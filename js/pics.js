/*
 * ホールの画像（images.js に暗号化して入っている）を、合言葉で開く
 */

/** 画像のあるコースだけ、画像の枠を出す */
function picCard(n) {
  return CO.pics ? '<section class="card">' + picBox(n) + "</section>" : "";
}

let IMGS = null,
  imgErr = "";

/** 文字にした鍵やデータを、バイトの列に戻す */
const unb = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** 鍵で画像を開く */
async function openImgs(k) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb(IMGX.i) }, k, unb(IMGX.d));
  IMGS = JSON.parse(new TextDecoder().decode(pt));
}

/** 合言葉から鍵を作って画像を開く（鍵はこの端末に覚えておく） */
async function unlock(p) {
  try {
    const bk = await crypto.subtle.importKey("raw", new TextEncoder().encode(p), "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: unb(IMGX.s), iterations: 200000 },
      bk,
      256,
    );
    const k = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);
    await openImgs(k);
    imgErr = "";
    try {
      localStorage.setItem(KEY + "-img", btoa(String.fromCharCode(...new Uint8Array(bits))));
    } catch (e) {}
  } catch (e) {
    imgErr = "合言葉が違います。";
  }
  render();
}

/** 前に開いた鍵が端末にあれば、入力なしで開く */
async function autoUnlock() {
  try {
    const r = localStorage.getItem(KEY + "-img");
    if (!r || typeof IMGX === "undefined") return;
    const k = await crypto.subtle.importKey("raw", unb(r), "AES-GCM", false, ["decrypt"]);
    await openImgs(k);
    render();
  } catch (e) {}
}

/** ホールの画像（全体・ティー・グリーン） */
function picBox(n) {
  if (typeof IMGX === "undefined")
    return '<p class="note">この版に画像は入っていません。攻略ページで見られます。</p>';
  if (!IMGS)
    return (
      '<div class="h">画像の合言葉</div><div class="row"><input class="input" id="imgpw" type="password" autocomplete="off" aria-label="画像の合言葉"><button class="act" data-unlock="1">開く</button></div><p class="note">' +
      esc(imgErr || "最初の1回だけ入力します。スコアや番手は入力なしで使えます。") +
      "</p>"
    );
  const m = IMGS[n - 1],
    p = U.pic || "map",
    i =
      p === "map"
        ? '<div class="pic map"><img style="max-height:280px;width:auto;max-width:100%" src="' +
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
