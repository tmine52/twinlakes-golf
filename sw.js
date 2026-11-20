/*
 * 保存係（サービスワーカー）
 * アプリのファイルを端末に保存して、電波のない場所でも開けるようにする係です。
 *
 * しくみ
 *   ・版ごとに保存場所（キャッシュ）を分ける。名前は「golf-kouryaku-＋版番号」。
 *   ・新しい版を見つけたら、全部のファイルを新しい保存場所へ取りこむ。
 *     1つでも取りこめなければ取りこみは失敗になり、古い版がそのまま動き続ける。
 *   ・全部そろったら新しい版へ切り替え、古い保存場所を消す。画面は自動で1回読み直される。
 *   ・画面からの読み込みには、いつも今の版の保存場所から答える。
 *     こうすると「新しいファイルと古いファイルが混ざって動かなくなる」ことが起きない。
 *   ・取りこんだ画面（index.html）が前の作り（v28 まで）のままだったら、取りこみをやめる。
 *     公開の直後は、配信の中継（CDN）が前の版の写しを返すことがありうるため。次に開いたときに取りこみ直す。
 *
 * ファイルを足したら、下の FILES にも足します（自動テストが入れ忘れを見つけます）。
 * app.js（v28 までの本体）は保存しません。この保存係が動いているスマホでは、もう使わないためです。
 */
importScripts("js/version.js"); // APP_VER（版番号）と IMG_REV（画像の版）を読む

const PREFIX = "golf-kouryaku-";
const CACHE = PREFIX + APP_VER;
const FILES = [
  "./",
  "index.html",
  "send.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "js/version.js",
  "js/courses.js",
  "js/advice.js",
  "js/core.js",
  "js/course.js",
  "js/suggest.js",
  "js/gps.js",
  "js/record.js",
  "js/export.js",
  "js/maps.js",
  "js/pics.js",
  "js/view-hole.js",
  "js/view-score.js",
  "js/view-settings.js",
  "js/view-advice.js",
  "js/main.js",
  "js/send.js",
  "images-tamagawa.js", // 玉川CC のレイアウト図（約1.4MB）
];
// ホールの画像は大きい（約2MB）ので、同じ版の画像が前の保存場所にあれば写して使う
const IMAGES = "images.js";
const IMAGES_KEY = IMAGES + "?rev=" + IMG_REV;
// 今の作りの画面（index.html）に必ず入っている目印（起動係）。js/main.js の retireOldEntrances も同じ目印を見る
const BOOT_MARK = '<script id="boot">';

/** 新しい版の取りこみ */
async function install() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    FILES.map(async (u) => {
      const r = await fetch(new Request(u, { cache: "reload" })); // ブラウザの中の途中の保存を使わず、必ず取りに行く
      if (!r.ok) throw new Error(u + " を取りこめません（" + r.status + "）");
      // 画面の土台が前の作り（v28 まで）のまま届いたら、取りこまない。
      // 取りこむと、古い画面が新しい保存場所から出続け、電波なしでは開けなくなるため
      if ((u === "./" || u === "index.html") && (await r.clone().text()).indexOf(BOOT_MARK) < 0)
        throw new Error(u + " が前の版のままです（次に開いたときに、取りこみ直します）");
      await cache.put(u, r);
    }),
  );
  // 前の版（v28まで）は画像を「images.js」の名前で保存していたので、画像の版が1のときはそれも使う
  const old = (await caches.match(IMAGES_KEY)) || (IMG_REV === "1" ? await caches.match(IMAGES) : null);
  if (old) await cache.put(IMAGES_KEY, old);
  else {
    const r = await fetch(new Request(IMAGES, { cache: "reload" }));
    if (!r.ok) throw new Error(IMAGES + " を取りこめません（" + r.status + "）");
    await cache.put(IMAGES_KEY, r);
  }
  await self.skipWaiting(); // 取りこみが終わったら、すぐ新しい版に切り替える
}

/** 新しい版に切り替わったとき：このアプリの古い保存場所だけを消す */
async function activate() {
  for (const k of await caches.keys())
    if (k !== CACHE && (k.startsWith(PREFIX) || k.startsWith("twinlakes-"))) await caches.delete(k);
  await self.clients.claim(); // 開いている画面を、今すぐ新しい版の担当にする
}

/** 画面からの読み込みに答える：保存してあればそれを、無ければ取りに行く */
async function answer(q) {
  const cache = await caches.open(CACHE);
  return (await cache.match(q, { ignoreSearch: true })) || fetch(q);
}

/**
 * v28 までの保存係の後片付け。
 * 前の保存係は、入れ替わりの最中に受け取った返事を、あとから自分の保存場所（twinlakes-◯◯）に書きこむことがある。
 * すると、activate で消したはずの保存場所が、空に近い形でもう一度できてしまう。害は無いが、見つけたら消しておく。
 * （この保存係の保存場所 golf-kouryaku-◯◯ には、ここでは手を出さない。次の版が取りこみの最中かもしれないため）
 */
async function sweepOld() {
  for (const k of await caches.keys()) if (k.startsWith("twinlakes-")) await caches.delete(k);
}

self.addEventListener("install", (e) => e.waitUntil(install()));
self.addEventListener("activate", (e) => e.waitUntil(activate()));
self.addEventListener("fetch", (e) => {
  const q = e.request;
  // よそのサイトへの通信や、送信（GET以外）には手を出さない
  if (q.method !== "GET" || new URL(q.url).origin !== location.origin) return;
  e.respondWith(answer(q));
  if (q.mode === "navigate") e.waitUntil(sweepOld()); // 画面を開くたびに、前の保存係の残りを片付ける
});
