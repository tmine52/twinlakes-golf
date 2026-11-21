/*
 * 土台：保存する記録、画面の一時的な状態、共通の小道具
 *
 * よく出てくる短い名前
 *   R   保存する記録（今のラウンド・番手の距離・履歴・追加したコース）
 *   U   画面の一時的な状態（今どの画面か、選んでいる番手など。保存しない）
 *   G   GPSの状態（保存しない）
 *   CO  今のコース   D  今のコースの18ホール   TN  ティーの記号 → 名前
 *   H(n)  n番ホールの記録
 *         { shots: 1打ごとの記録, rem: 残り距離, putts: パット数, green: グリーンに乗ったか,
 *           lie: 球の場所, quick: かんたん入力の合計打数, qWas: かんたん入力を始める前のパット数 }
 *   1打の記録
 *         { c: 番手, r: 結果, pen: 罰打, before: 打つ前の残り, lie: 打った場所,
 *           from / to: 打った場所 / 止まった場所の緯度経度, dist: 実測の飛距離,
 *           dir: 方向の感触, hit: 当たりの感触, k: 1打罰の種類（ob / pond / lost）, at: 番手を押した時刻 }
 *   結果 r  ok=ふつうに打てた  short=短い（v29 まで）  ob=OB・池・ロスト（1打罰）  miss=空振り
 *           f4=前進ティー  add=番手を選ばず足した1打
 *   h.arr  ボールに着いた（到着を押した）ときの打の数。最後の打が到着済みかを見るのに使う
 */

/* ---- 保存場所 ---- */
const OLD_KEY = "twinlakes-v1"; // v28 までの保存場所（引き継ぎのために読むだけ。消さない）
const KEY = "golf-kouryaku-v1"; // 今の保存場所
const CV = 3; // 番手の一覧の世代。世代2の端末は CLUB_UPD の番手だけを変え、それより古い端末は最初の値に戻す

/**
 * v28 までの保存場所に記録があり、今の保存場所がまだ空なら、中身をコピーする。
 * 前の保存場所は消さない（前の版に戻したときのため）。
 */
function migrateOldKey() {
  try {
    ["", "-img"].forEach((tail) => {
      if (localStorage.getItem(KEY + tail) != null) return;
      const old = localStorage.getItem(OLD_KEY + tail);
      if (old != null) localStorage.setItem(KEY + tail, old);
    });
  } catch (e) {}
}

/* ---- 読むだけの画面 ---- */
// 「上達道場へ渡す」画面（send.html）と攻略ノートは、記録を読むだけの画面。window.READ_ONLY を立ててある。
// 読むだけの画面では、引き継ぎ（コピー）も保存もしない。お試しモード中でも、本番の記録を読む。
// （引き継ぎをアプリ本体の最初の起動だけに任せるため。起動係は「新しい保存場所があるか」で、今の版が動いたことがあるかを見分けている）
const READ_ONLY = !!window.READ_ONLY;
if (!READ_ONLY) migrateOldKey();

/* ---- お試しモード ---- */
// お試しモード中は、本番とは別の場所（KEY + "-demo"）に保存する。
const DEMO =
  !READ_ONLY &&
  (() => {
    try {
      return localStorage.getItem(KEY + "-mode") === "demo";
    } catch (e) {
      return false;
    }
  })();
const SK = DEMO ? KEY + "-demo" : KEY; // 今、読み書きする保存場所
const SIM = { r: null, n: null }; // お試しの立つ場所（r: 道のりでの残りヤード, n: どのホールの分か）

/* ---- 状態 ---- */
const U = { view: "hole", edit: null, arm: false }; // edit: 直している打（0から数える）

let R = {
  cv: CV,
  cur: 1, // 今のホール
  tee: "w", // 使うティー
  holes: {}, // ホールごとの記録
  clubs: DEF.map((c) => ({ name: c[0], dist: c[1] })), // 番手と計画の距離
  gps: false,
};

let G = { watch: null, y: null, acc: null, at: 0, err: "" };

const app = document.getElementById("app");

/* ---- 画面に出す言葉 ---- */
const LIE = { fw: "FW", light: "浅いラフ", deep: "深いラフ", bunker: "バンカー" };
const DIR = { left: "左", straight: "まっすぐ", right: "右" };
const HIT = { good: "芯", fat: "ダフリ", top: "トップ", shank: "シャンク" };
const RES = { ok: "普通", short: "短い", ob: "OB・池", miss: "空振り", add: "1打（番手なし）" };
const OB_KIND = { ob: "OB", pond: "池", lost: "ロスト" }; // 1打罰の結果の種類（v30 から。shots[].k）

/** 1打の結果を、画面に出す言葉にする */
function resLabel(s) {
  if (s.r === "f4") return "前進" + (s.t || 4) + "打";
  if (s.r === "ob" && s.k) return OB_KIND[s.k] || RES.ob;
  return RES[s.r] || s.r;
}

/** HTMLの中に入れても安全な文字に直す */
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

/** 画面の下に短いお知らせを出す（ms ミリ秒たつと消える） */
function say(t, ms) {
  const e = document.querySelector("#status span");
  if (!e) return;
  e.textContent = t;
  clearTimeout(say.t);
  if (ms) say.t = setTimeout(() => (e.textContent = ""), ms);
}

/** 記録をこの端末に保存する（読むだけの画面では、何もしない） */
function save() {
  if (READ_ONLY) return;
  try {
    localStorage.setItem(SK, JSON.stringify(R));
  } catch (e) {
    say("この端末に保存できません。", 4000);
  }
}

/** 保存してある記録を読み込む */
function load() {
  try {
    let raw = localStorage.getItem(SK);
    // 読むだけの画面：引き継ぎがまだ（今の版が1度も動いていない）なら、前の保存場所をそのまま読む
    if (raw == null && READ_ONLY) raw = localStorage.getItem(OLD_KEY);
    const x = JSON.parse(raw || "null");
    if (x && x.holes) {
      R = Object.assign(R, x);
      if (x.cv !== CV) {
        if (x.cv === CV - 1 && Array.isArray(R.clubs)) {
          // 1つ前の世代：測り直した番手だけ距離を変える（ほかの番手は、端末で直した値のまま）
          const ch = [];
          CLUB_UPD.list.forEach(([name, d]) => {
            const c = R.clubs.find((k) => k.name === name);
            if (c && c.dist !== d) {
              ch.push(name + " " + c.dist + "→" + d + "Y");
              c.dist = d;
            }
          });
          if (ch.length) U.clubNote = CLUB_UPD.label + "の結果で、番手の距離を変えました：" + ch.join("・");
        } else R.clubs = DEF.map((c) => ({ name: c[0], dist: c[1] }));
        R.cv = CV;
        save();
      }
    }
  } catch (e) {}
}

/**
 * このアプリが端末に保存している大きさ（バイト）。
 * 今の保存場所だけでなく、前の版から引き継ぐために残してある保存場所（OLD_KEY）や、お試しモードの分も数える。
 */
function storeBytes() {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.indexOf(KEY) === 0 || k.indexOf(OLD_KEY) === 0)
        n += new Blob([k, localStorage.getItem(k) || ""]).size;
    }
  } catch (e) {}
  return n;
}

/** n番ホールの記録を返す（無ければ空の記録を作る） */
function H(n) {
  return R.holes[n] || (R.holes[n] = { shots: [], rem: null, putts: 0, green: false });
}

/* ---- 今のコース（course.js の applyCourse が入れ替える） ---- */
let D = COURSES[0].holes,
  CO = COURSES[0],
  TN = {},
  COURSE = CO.name;

/** n番の、今のティーからのヤード */
function yards(n) {
  const y = D[n - 1].y;
  return y[R.tee] != null ? y[R.tee] : y[CO.base];
}

/** n番の残り距離（まだ打っていなければカードのヤード） */
function rem(n) {
  const h = H(n);
  return h.rem == null ? yards(n) : h.rem;
}

/** そのホールの打数（かんたん入力があれば、それを優先） */
function strokes(h) {
  return h.quick != null ? h.quick : h.shots.reduce((a, s) => a + 1 + (s.pen || 0), 0) + h.putts;
}

/** そのホールのショットの打数（パットを除く。罰打を含む） */
function shotStrokes(h) {
  return strokes(h) - h.putts;
}

/** そのホールに何か記録があるか */
function touched(h) {
  return h.shots.length > 0 || h.putts > 0 || h.quick != null;
}

/** そのホールのバンカー・空振り・OB・パットの数 */
function stat(h) {
  const x = (h && h.shots) || [];
  return {
    bunker: x.filter((s) => s.lie === "bunker").length,
    miss: x.filter((s) => s.r === "miss").length,
    ob: x.filter((s) => s.r === "ob" || s.r === "f4").length,
    putts: (h && h.putts) || 0,
  };
}

/** 今のラウンドの合計（ホール数 n・打数 t・OUT o・IN i・パーの合計 p・内訳 a・ホールごとの打数 holes） */
function roundSummary() {
  let n = 0,
    t = 0,
    o = 0,
    i = 0,
    p = 0;
  const a = { bunker: 0, miss: 0, ob: 0, putts: 0 },
    holes = [];
  D.forEach((d, x) => {
    const h = R.holes[x + 1];
    if (!h || !touched(h)) {
      holes.push(null);
      return;
    }
    const v = strokes(h),
      s = stat(h);
    n++;
    t += v;
    p += d.p;
    if (x < 9) o += v;
    else i += v;
    holes.push(v);
    Object.keys(a).forEach((k) => (a[k] += s[k]));
  });
  return { n, t, o, i, p, a, holes };
}

/** 今日の日付（YYYY-MM-DD） */
function ymd(d) {
  d = d || new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

/** 数の並びの中央値（真ん中の値）。空なら null */
function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ---- 画面の部品（どの画面でも使うもの） ---- */

/* 何度も使う見た目（style）の指定 */
const STYLE_TEXTBOX =
  "width:100%;font-size:13px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px";
const STYLE_SELECT =
  "min-height:44px;width:100%;min-width:0;border:1px solid var(--line);border-radius:6px;" +
  "background:var(--surface);color:var(--fg);font-size:16px;font-weight:700";
const STYLE_LINKBTN =
  "display:block;text-align:center;padding:10px;border:1px solid var(--line);border-radius:6px;" +
  "color:var(--fg);text-decoration:none";

/** 説明の小さい文字 */
function note(text, attrs) {
  return '<p class="note"' + (attrs || "") + ">" + text + "</p>";
}

/** 枠。title があれば見出しを付ける */
function card(title, body, attrs) {
  return (
    '<section class="card"' +
    (attrs || "") +
    ">" +
    (title ? '<div class="h">' + title + "</div>" : "") +
    body +
    "</section>"
  );
}

/** 2つ並びのボタンの行 */
function twoButtons(a, b) {
  return '<div class="two">' + a + b + "</div>";
}

/** 別の画面（ほかのサイト）を開く、ボタンの形のリンク */
function linkButton(href, label, attrs) {
  return (
    '<a class="ghost" style="' +
    STYLE_LINKBTN +
    '" target="_blank" rel="noopener" href="' +
    href +
    '"' +
    (attrs || "") +
    ">" +
    label +
    "</a>"
  );
}

/** 選択欄（select）の1行 */
function optionTag(value, label, selected) {
  return (
    '<option value="' + esc(value) + '"' + (selected ? " selected" : "") + ">" + esc(label) + "</option>"
  );
}

/**
 * 横に並べた「どれか1つを選ぶ」ボタンの行。
 * items: { 値: 画面に出す言葉 }、attr: data-◯◯ の名前、cur: 今選ばれている値、minH: ボタンの高さ
 */
function choiceRow(items, attr, cur, minH, margin) {
  const keys = Object.keys(items);
  return (
    '<div style="display:grid;grid-template-columns:repeat(' +
    keys.length +
    ",minmax(0,1fr));gap:4px" +
    (margin ? ";margin:" + margin : "") +
    '">' +
    keys
      .map(
        (k) =>
          '<button style="font-size:13px;padding:0 1px;white-space:nowrap;min-height:' +
          minH +
          'px" class="' +
          (cur === k ? "act" : "ghost") +
          '" data-' +
          attr +
          '="' +
          k +
          '" aria-pressed="' +
          (cur === k) +
          '">' +
          items[k] +
          "</button>",
      )
      .join("") +
    "</div>"
  );
}

/** ＋と−で数を変える欄（label: 見出し、value: 今の数、attr: data-◯◯ の名前） */
function stepper(label, value, attr, big) {
  return (
    '<div class="h">' +
    label +
    '</div><div style="display:grid;grid-template-columns:72px 1fr 72px;gap:8px;align-items:center"><button class="ghost" style="font-size:24px" data-' +
    attr +
    '="-1" aria-label="' +
    label +
    'を1減らす">−</button><div style="text-align:center;font-size:' +
    (big ? 40 : 28) +
    'px;font-weight:700">' +
    value +
    '</div><button class="act" style="font-size:24px" data-' +
    attr +
    '="1" aria-label="' +
    label +
    'を1増やす">＋</button></div>'
  );
}
