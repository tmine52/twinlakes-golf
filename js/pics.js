/*
 * ホールの画像（images.js に暗号化して入っている）を、合言葉で開く
 */

/** 画像のあるコースだけ、画像の枠を出す */
function picCard(n) {
  return CO.pics ? '<section class="card">' + picBox(n) + "</section>" : "";
}

/*
 * 画像の組（コースごと）。どれも同じ合言葉で開く（塩 s が違うので、鍵は組ごとに作る）
 *   twinlakes … images.js（IMGX）。全体・ティー・グリーンの3枚ずつ
 *   tamagawa  … images-tamagawa.js（IMGX_TAMA）。アコーディア・ゴルフのレイアウト図（ゴルフ場の了承を得て掲載）
 */
const PICSETS = {
  twinlakes: { x: () => (typeof IMGX === "undefined" ? null : IMGX), ls: "-img" },
  tamagawa: { x: () => (typeof IMGX_TAMA === "undefined" ? null : IMGX_TAMA), ls: "-img-tamagawa" },
};
let IMGS = {}, // 開いた画像（組の名前 → 18ホールの並び）
  imgErr = "";

/** 今のコースの画像の組の名前（無ければ null） */
function picSet() {
  return CO.pics === true ? "twinlakes" : PICSETS[CO.pics] ? CO.pics : null;
}

/** 文字にした鍵やデータを、バイトの列に戻す */
const unb = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** 鍵（256ビット）で画像の組を開く */
async function openSet(id, bits) {
  const X = PICSETS[id].x(),
    k = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb(X.i) }, k, unb(X.d));
  IMGS[id] = JSON.parse(new TextDecoder().decode(pt));
}

/** 合言葉から鍵を作って、入っている画像の組をすべて開く（鍵はこの端末に覚えておく） */
async function unlock(p) {
  let ok = 0;
  const bk = await crypto.subtle.importKey("raw", new TextEncoder().encode(p), "PBKDF2", false, [
    "deriveBits",
  ]);
  for (const id of Object.keys(PICSETS)) {
    const X = PICSETS[id].x();
    if (!X) continue;
    try {
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: unb(X.s), iterations: 200000 },
        bk,
        256,
      );
      await openSet(id, bits);
      ok++;
      try {
        localStorage.setItem(KEY + PICSETS[id].ls, btoa(String.fromCharCode(...new Uint8Array(bits))));
      } catch (e) {}
    } catch (e) {}
  }
  imgErr = ok ? "" : "合言葉が違います。";
  render();
}

/** 前に開いた鍵が端末にあれば、入力なしで開く */
async function autoUnlock() {
  for (const id of Object.keys(PICSETS)) {
    try {
      const r = localStorage.getItem(KEY + PICSETS[id].ls);
      if (r && PICSETS[id].x()) await openSet(id, unb(r));
    } catch (e) {}
  }
  render();
}

/** ホールの画像（全体・ティー・グリーン） */
function picBox(n) {
  const id = picSet();
  if (!id || !PICSETS[id].x()) return '<p class="note">この版に画像は入っていません。</p>';
  if (!IMGS[id])
    return (
      '<div class="h">画像の合言葉</div><div class="row"><input class="input" id="imgpw" type="password" autocomplete="off" aria-label="画像の合言葉"><button class="act" data-unlock="1">開く</button></div><p class="note">' +
      esc(imgErr || "最初の1回だけ入力します。スコアや番手は入力なしで使えます。") +
      "</p>"
    );
  const m = IMGS[id][n - 1],
    one = !m.tee, // レイアウト図1枚だけの組（玉川CC）
    p = one ? "map" : U.pic || "map",
    i =
      p === "map"
        ? '<div class="pic map"><img style="max-height:' +
          (one ? "520px" : "280px") +
          ';width:auto;max-width:100%" src="' +
          m.map +
          '" alt="' +
          n +
          '番のホールマップ。下がティー、上がグリーン"></div><p class="note">マップは下がティー、上がグリーンです。</p>'
        : p === "tee"
          ? '<div class="pic"><img src="' + m.tee + '" alt="' + n + '番のティー付近"></div>'
          : '<div class="pic"><img src="' +
            m.green +
            '" alt="' +
            n +
            '番のグリーン"><span class="tag top">↑奥</span><span class="tag bot">↓手前</span></div><p class="note">旗は撮影時のものです。当日のピンはカートナビかピン位置表で確認します。</p>';
  if (one)
    return (
      '<div class="h">' +
      n +
      '番のレイアウト図</div><div class="pics">' +
      i +
      '</div><p class="note">アコーディア・ゴルフの資料（ゴルフ場の了承を得て掲載）。</p>'
    );
  return (
    '<div class="tabs">' +
    [
      ["map", "全体"],
      ["tee", "ティー"],
      ["green", "グリーン"],
    ]
      .map((x) => '<button data-pic="' + x[0] + '" aria-pressed="' + (p === x[0]) + '">' + x[1] + "</button>")
      .join("") +
    '</div><div class="pics">' +
    i +
    "</div>"
  );
}
