/*
 * 「アドバイス」画面と「コーチ」画面
 *
 * 文そのものは advice.js にあります。ここは並べ方だけ。
 */

/** 画面の中の切り替えボタン（3つ並び）。items: [[値, 表示], …]、attr: data-◯◯ の名前 */
function subTabs(items, attr, cur) {
  return (
    '<div style="display:grid;grid-template-columns:repeat(' +
    items.length +
    ',minmax(0,1fr));gap:6px">' +
    items
      .map(
        (x) =>
          '<button class="' +
          (cur === x[0] ? "act" : "ghost") +
          '" style="white-space:nowrap;font-size:14px;padding:0 2px" data-' +
          attr +
          '="' +
          x[0] +
          '" aria-pressed="' +
          (cur === x[0]) +
          '">' +
          x[1] +
          "</button>",
      )
      .join("") +
    "</div>"
  );
}

/** 番手の名前と距離を左右に置いた、枠の見出し */
function clubHead(name, right) {
  return (
    '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><div class="h" style="font-size:18px">' +
    esc(name) +
    '</div><div style="font-weight:700;color:var(--accent);white-space:nowrap">' +
    right +
    "</div></div>"
  );
}

/** 「アドバイス」画面を描く（番手別／残り距離／ラフ・傾斜） */
function adviceView() {
  const sec = U.adv || "club",
    n = R.cur,
    h = H(n);
  const tabs =
    '<section class="card">' +
    subTabs(
      [
        ["club", "番手別"],
        ["chart", "残り距離"],
        ["lie", "ラフ・傾斜"],
      ],
      "adv",
      sec,
    ) +
    '<p class="note">今は' +
    n +
    "番 Par" +
    D[n - 1].p +
    "・球の場所は" +
    LIE[lieOf(h)] +
    "です。下の「ホール」で戻れます。</p></section>";
  app.innerHTML = tabs + (sec === "club" ? adviceClubs() : sec === "chart" ? adviceChart() : adviceLie());
}

/** アドバイス：番手別（使い方、ラフでの扱い、このコースだけの注意） */
function adviceClubs() {
  const light = { lie: "light" },
    tips = CO.clubTips || {};
  return (
    R.clubs
      .map((c) => {
        const a = ADV[c.name];
        return (
          '<section class="card">' +
          clubHead(c.name, c.dist + "Y" + (ng(c, light) ? "" : "・浅いラフ" + eff(c, light) + "Y")) +
          '<div style="font-size:15px;line-height:1.6">' +
          esc(a ? a[1] : "登録した番手です。") +
          "</div>" +
          (tips[c.name]
            ? '<div style="font-size:15px;line-height:1.6">このコース：' + esc(tips[c.name]) + "</div>"
            : "") +
          '<div class="note">ラフ：' +
          esc(a ? a[0] : "未設定") +
          "</div></section>"
        );
      })
      .join("") +
    '<p class="note">' +
    esc(ADV_NOTE) +
    "</p>"
  );
}

/** 残り距離ごとの番手の表（t: 見出し、k: 球の場所） */
function bandTable(t, k) {
  return (
    "<div><table><thead><tr><th>" +
    t +
    "</th><th>番手</th></tr></thead><tbody>" +
    bands(k)
      .map((x) => "<tr><td>" + x[0] + '</td><td style="font-weight:700">' + esc(x[1]) + "</td></tr>")
      .join("") +
    "</tbody></table></div>"
  );
}

/** アドバイス：残り距離から番手を選ぶ表と、池・谷越えの決まり、コースのメモ */
function adviceChart() {
  return (
    '<section class="card"><div class="h">残り距離から番手を選ぶ</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:start">' +
    bandTable("FW", "fw") +
    bandTable("浅いラフ", "light") +
    "</div>" +
    note("深いラフは距離に関係なくSWかAWで出します。30Y以内はSWかAWで寄せます。") +
    '</section><section class="card"><div class="h">池・谷を越える時だけ</div><div style="font-size:15px;line-height:1.6">' +
    "距離は転がり込みです。越える距離に<b>20Yを足して</b>番手を選びます（仮のルール）。" +
    (CO.notes || []).map((x) => "<br>" + esc(x)).join("") +
    "</div></section>"
  );
}

/** アドバイス：ラフ・傾斜の考え方 */
function adviceLie() {
  return (
    '<section class="card"><dl>' +
    LIE_GUIDE.map((x) => "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>").join("") +
    '</dl><p class="note">ラフの割引と傾斜の項目は一般的な目安です。コーチの指示を優先してください。</p></section>'
  );
}

/** 「コーチ」画面を描く（番手別／基本／使い方） */
function coachView() {
  const sec = U.coach || "club";
  const tabs =
    '<section class="card">' +
    subTabs(
      [
        ["club", "番手別"],
        ["base", "基本"],
        ["flow", "使い方"],
      ],
      "coach",
      sec,
    ) +
    '<p class="note">' +
    esc(COACH_NOTE) +
    "</p></section>";
  app.innerHTML = tabs + (sec === "club" ? coachClubs() : sec === "base" ? coachBase() : coachFlow());
}

/** コーチ：番手別の教え */
function coachClubs() {
  return R.clubs
    .map((c) => {
      const t = COACH[c.name];
      if (!t) return "";
      return (
        '<section class="card">' +
        clubHead(c.name, c.dist + "Y") +
        '<ul style="margin:0;padding-left:20px;line-height:1.6">' +
        t.map((x) => "<li>" + esc(x) + "</li>").join("") +
        "</ul></section>"
      );
    })
    .join("");
}

/** コーチ：基本の教え */
function coachBase() {
  return (
    '<section class="card"><div class="h">当日はこの3つだけ</div><ol style="margin:0;padding-left:22px;line-height:1.6">' +
    BASE_TOP3.map((x) => "<li>" + esc(x) + "</li>").join("") +
    '</ol></section><section class="card"><dl>' +
    BASE.map((x) => "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>").join("") +
    "</dl></section>"
  );
}

/** コーチ：アプリの使い方（1打の流れ） */
function coachFlow() {
  return (
    '<section class="card"><div class="h">1打の流れ</div><ol style="margin:0;padding-left:22px;line-height:1.6">' +
    FLOW.map((x) => "<li><b>" + esc(x[0]) + "</b>：" + esc(x[1]) + "</li>").join("") +
    '</ol><p class="note">押したボタンはその場で保存されます。反映ボタンはありません。</p></section>'
  );
}
