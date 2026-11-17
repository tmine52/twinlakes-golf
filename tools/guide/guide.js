/*
 * 攻略ノート（読むだけのページ）
 *
 * ラウンドの前に、コースの攻略・番手の使い方・コーチの教えを読むためのページです。
 * 記録はしません（記録はスマホのアプリで行います）。
 *
 * コースデータ（courses.js）とアドバイスの文（advice.js）、図と番手の表の作り方（maps.js・suggest.js）は、
 * アプリと同じファイルをそのまま使います。アプリを直すと、このページも同じ内容になります。
 */

/* PICS（ホールの画像）は、作るときに差しこまれる。無ければ画像なし */
const GUIDE_PICS = typeof PICS !== "undefined" ? PICS : {};

/* 記録をするアプリの場所（公開先を変えたら、ここも直す） */
const APP_URL = "https://tmine52.github.io/twinlakes-golf/";

const SECTIONS = [
  ["holes", "ホール"],
  ["clubs", "番手"],
  ["distance", "残り距離"],
  ["coach", "コーチ"],
];
const view = { open: {} }; // open: 画像を開いているホール { ホール番号: "map" | "tee" | "green" }

/** 今のコースを切り替える（アプリの部品が使う CO・D・TN をそろえる） */
function pickCourse(id) {
  CO = COURSES.find((c) => c.id === id) || COURSES[0];
  D = CO.holes;
  TN = {};
  CO.tees.forEach((t) => (TN[t[0]] = t[1]));
  R.tee = CO.base;
  R.holes = {};
  view.open = {};
  try {
    localStorage.setItem("guide-course", CO.id); // 次に開いたときのために覚える（覚えられなくても動く）
  } catch (e) {}
}

/** 今のページ（#◯◯ の部分）がどの切り替えか */
function section() {
  const h = location.hash.replace("#", "");
  return SECTIONS.some((s) => s[0] === h) ? h : "holes";
}

/** ページ全体を描く */
function draw() {
  const sec = section();
  app.innerHTML =
    '<header class="top"><h1>ゴルフ攻略ノート</h1><p class="cap">ラウンドの前に読むページです。打数の記録と、番手の距離の変更は、スマホの<a href="' +
    APP_URL +
    '" target="_blank" rel="noopener">アプリ「' +
    esc(APP_NAME) +
    "」</a>で行います。内容はアプリ " +
    esc(APP_VER + "（" + APP_DATE + "）") +
    'と同じです。</p></header><nav class="tabs" aria-label="読む内容">' +
    SECTIONS.map(
      (s) => '<a href="#' + s[0] + '"' + (s[0] === sec ? ' aria-current="page"' : "") + ">" + s[1] + "</a>",
    ).join("") +
    "</nav>" +
    { holes: holesPage, clubs: clubsPage, distance: distancePage, coach: coachPage }[sec]();
}

/** コースを選ぶボタン */
function coursePicker() {
  return (
    '<div class="pick" role="group" aria-label="コース">' +
    COURSES.map(
      (c) =>
        '<button data-course="' + c.id + '" aria-pressed="' + (c === CO) + '">' + esc(c.name) + "</button>",
    ).join("") +
    "</div>"
  );
}

/** ティーごとの合計ヤードなど、コースのまとめ */
function courseSummary() {
  const par = D.reduce((a, d) => a + d.p, 0),
    m = courseMapSvg(0);
  return (
    '<section class="card"><h2>' +
    esc(CO.name) +
    "　パー" +
    par +
    '</h2><div class="yards">' +
    CO.tees
      .map((t) => {
        const sum = D.reduce((a, d) => a + (d.y[t[0]] || 0), 0);
        return "<span>" + esc(t[1]) + " <b>" + sum.toLocaleString() + "Y</b></span>";
      })
      .join("") +
    "</div>" +
    ((CO.notes || []).length
      ? '<ul class="plain">' + CO.notes.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>"
      : "") +
    (m ? m.svg + note(courseMapLegend(false)) : "") +
    '<div class="jump" aria-label="ホールへ移動">' +
    D.map(
      (d, i) =>
        '<button data-jump="' + (i + 1) + '" aria-label="' + (i + 1) + '番へ">' + (i + 1) + "</button>",
    ).join("") +
    "</div></section>"
  );
}

/** ホール1つ分 */
function holeCard(n) {
  const d = D[n - 1],
    m = holeMapSvg(n),
    pics = (GUIDE_PICS[CO.id] || [])[n - 1],
    rows = [
      ["ティーで持つ番手（" + esc(TN[CO.base]) + "の時）", d.club, ""],
      ["狙い", d.aim, ""],
      ["危険", d.risk, "risk"],
      ["グリーン周り", d.green, ""],
    ].filter((x) => x[1]);
  return (
    '<article class="card hole" id="h' +
    n +
    '"><div class="holehead"><span class="no">' +
    n +
    '番</span><span class="par">Par' +
    d.p +
    "</span>" +
    (d.hc ? '<span class="cap">HDCP' + d.hc + "</span>" : "") +
    (d.plus ? '<span class="cap">池・谷越え（ティーで' + d.plus + "Y足して番手を選ぶ）</span>" : "") +
    '</div><div class="yards">' +
    CO.tees
      .filter((t) => d.y[t[0]] != null)
      .map((t) => "<span>" + esc(t[1]) + " <b>" + d.y[t[0]] + "Y</b></span>")
      .join("") +
    '</div><div class="holebody">' +
    (m ? "<div>" + m.svg + "</div>" : '<div class="note">図なし</div>') +
    "<dl>" +
    (rows.length
      ? rows.map((x) => '<dt class="' + x[2] + '">' + x[0] + "</dt><dd>" + esc(x[1]) + "</dd>").join("")
      : '<dd class="note">攻略の文はまだありません。</dd>') +
    "</dl></div>" +
    (pics ? picsBox(n, pics) : "") +
    "</article>"
  );
}

/** ホールの画像（押すと開く。全体・ティー・グリーンを切り替え） */
function picsBox(n, pics) {
  const cur = view.open[n];
  if (!cur) return '<button class="ghost" data-pics="' + n + '" data-kind="map">画像を見る</button>';
  const alt = { map: "全体図。下がティー、上がグリーン", tee: "ティー付近", green: "グリーン" };
  return (
    '<div class="pics"><div class="seg">' +
    [
      ["map", "全体"],
      ["tee", "ティー"],
      ["green", "グリーン"],
    ]
      .map(
        (x) =>
          '<button data-pics="' +
          n +
          '" data-kind="' +
          x[0] +
          '" aria-pressed="' +
          (cur === x[0]) +
          '">' +
          x[1] +
          "</button>",
      )
      .join("") +
    '</div><img src="' +
    pics[cur] +
    '" alt="' +
    n +
    "番の" +
    alt[cur] +
    '">' +
    note(
      cur === "green"
        ? "旗は撮影時のものです。当日のピンはカートナビかピン位置表で確認します。"
        : "全体図は、下がティー、上がグリーンです。",
    ) +
    '<button class="ghost" data-pics="' +
    n +
    '" data-kind="">画像を閉じる</button></div>'
  );
}

/** 「ホール」のページ */
function holesPage() {
  return coursePicker() + courseSummary() + D.map((d, i) => holeCard(i + 1)).join("");
}

/** 「番手」のページ：使い方、ラフでの扱い、このコースだけの注意、コーチの教え */
function clubsPage() {
  const light = { lie: "light" },
    tips = CO.clubTips || {};
  return (
    coursePicker() +
    note("距離は、アプリに最初から入っている計画の値です。アプリで直した距離は、このページには出ません。") +
    R.clubs
      .map((c) => {
        const a = ADV[c.name],
          k = COACH[c.name];
        return (
          '<section class="card"><div class="clubhead"><span class="name">' +
          esc(c.name) +
          '</span><span class="dist">' +
          c.dist +
          "Y" +
          (ng(c, light) ? "" : "・浅いラフ" + eff(c, light) + "Y") +
          "</span></div>" +
          (a ? "<p>" + esc(a[1]) + "</p>" + note("ラフ：" + esc(a[0])) : "") +
          (tips[c.name] ? "<p><b>" + esc(CO.name) + "：</b>" + esc(tips[c.name]) + "</p>" : "") +
          (k
            ? '<div class="h">コーチの教え</div><ul class="plain">' +
              k.map((x) => "<li>" + esc(x) + "</li>").join("") +
              "</ul>"
            : "") +
          "</section>"
        );
      })
      .join("") +
    note(esc(ADV_NOTE) + esc(COACH_NOTE))
  );
}

/** 残り距離ごとの番手の表（アプリと同じ計算） */
function bandTable(title, lie) {
  return (
    '<div class="tblwrap"><table><thead><tr><th>' +
    title +
    "</th><th>番手</th></tr></thead><tbody>" +
    bands(lie)
      .map((x) => "<tr><td>" + x[0] + "</td><td><b>" + esc(x[1]) + "</b></td></tr>")
      .join("") +
    "</tbody></table></div>"
  );
}

/** 「残り距離」のページ：番手の表、池・谷越えの決まり、ラフ・傾斜の考え方 */
function distancePage() {
  return (
    '<section class="card"><h2>残り距離から番手を選ぶ</h2><div class="two">' +
    bandTable("FW", "fw") +
    bandTable("浅いラフ", "light") +
    "</div>" +
    note(
      "深いラフは距離に関係なくSWかAWで出します。30Y以内はSWかAWで寄せます。計画の距離（最初の値）での表です。",
    ) +
    '</section><section class="card"><h2>池・谷を越える時だけ</h2><p>距離は転がり込みです。越える距離に<b>20Yを足して</b>番手を選びます（仮のルール）。</p></section>' +
    '<section class="card"><h2>ラフ・傾斜</h2><dl>' +
    LIE_GUIDE.map((x) => "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>").join("") +
    "</dl>" +
    note("ラフの割引と傾斜の項目は一般的な目安です。コーチの指示を優先してください。") +
    "</section>"
  );
}

/** 「コーチ」のページ：当日の3つと、基本の教え */
function coachPage() {
  return (
    '<section class="card"><h2>当日はこの3つだけ</h2><ol class="plain">' +
    BASE_TOP3.map((x) => "<li>" + esc(x) + "</li>").join("") +
    '</ol></section><section class="card"><h2>基本</h2><dl>' +
    BASE.map((x) => "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>").join("") +
    "</dl>" +
    note(esc(COACH_NOTE) + "番手ごとの教えは「番手」のページにあります。") +
    "</section>"
  );
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const a = b.dataset;
  if (a.course) {
    pickCourse(a.course);
    draw();
  } else if (a.jump) {
    const t = document.getElementById("h" + a.jump);
    if (t) t.scrollIntoView({ block: "start" });
  } else if (a.pics) {
    // 画像を開く・切り替える・閉じる（そのホールの枠だけ描き直す）
    if (a.kind) view.open[a.pics] = a.kind;
    else delete view.open[a.pics];
    const card = document.getElementById("h" + a.pics);
    if (card) card.outerHTML = holeCard(Number(a.pics));
  }
});
window.addEventListener("hashchange", () => {
  draw();
  window.scrollTo(0, 0);
});

/* ---- 起動 ---- */
R.gps = false; // このページでは現在地を使わない
let startCourse = null;
try {
  startCourse = localStorage.getItem("guide-course");
} catch (e) {}
pickCourse(startCourse || COURSES[0].id);
draw();
