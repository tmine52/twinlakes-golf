/*
 * 「ホール」画面
 *
 * 上から順に：
 *   （お試しモードの枠） → コースの選択 → ホールの選択 → 残り距離と打数 → GPS
 *   → 次の番手の提案 → 1打を記録する枠（グリーン上ではパットの枠） → 図 → 危険・狙い
 */

/** 「ホール」画面を描く */
function holeView() {
  const n = R.cur,
    d = D[n - 1],
    h = H(n);
  app.innerHTML =
    holeNav(n) +
    nowCard(n, d, h) +
    gpsCard() +
    suggestCard(n, h) +
    (R.simple ? quickBox(n, h) : h.green && U.edit == null ? puttCard(n, h) : shotCard(n, h)) +
    (R.simple ? "" : feelBox(h)) +
    picCard(n) +
    (R.simple || h.green ? "" : fixCard()) +
    mapBox(n) +
    hazardCard(d) +
    (DEMO
      ? ""
      : '<section class="card"><div class="h">操作の練習</div>' +
        note("お試しモードでは、本番の記録を変えずに、番手・到着・OB などを試せます。") +
        '<button class="ghost" data-demo="on" style="width:100%">お試しモードを始める</button></section>');
}

/** ホール画面のいちばん上の、コースの選択欄 */
function courseBar() {
  return (
    '<div style="display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:center">' +
    '<label for="csel2" class="note" style="margin:0">コース</label>' +
    '<select id="csel2" aria-label="コース切り替え" style="' +
    STYLE_SELECT +
    '">' +
    courseList()
      .map((c) => optionTag(c.id, c.name, c.id === CO.id))
      .join("") +
    "</select></div>"
  );
}

/** ホールを選ぶ行（◀ 選択欄 ▶）。打数を入れたホールには（打数）を添える */
function holeNav(n) {
  const opts = D.map((x, i) => {
    const v = R.holes[i + 1],
      m = v && touched(v) ? " (" + strokes(v) + ")" : "";
    return optionTag(i + 1, i + 1 + "番 Par" + x.p + m, i + 1 === n);
  }).join("");
  return (
    '<div class="nav"><button data-go="-1" aria-label="前のホール">◀</button><select id="pick" aria-label="ホール選択">' +
    opts +
    '</select><button data-go="1" aria-label="次のホール">▶</button></div>'
  );
}

/** 残り距離と、このホールの打数 */
function nowCard(n, d, h) {
  return (
    '<div class="now"><div><div class="lab">' +
    (h.green ? "グリーン上" : "残り") +
    "　" +
    esc(TN[R.tee]) +
    " " +
    yards(n) +
    "Y" +
    (d.hc ? "・HDCP" + d.hc : "") +
    '</div><div class="rem">' +
    (h.green ? "ON" : rem(n) + "Y") +
    '</div></div><div class="sc">打数<b>' +
    strokes(h) +
    "</b>Par" +
    d.p +
    "</div></div>"
  );
}

/** GPSの状態と、オン／オフのボタン */
function gpsCard() {
  return (
    '<div class="gps"><div class="t" id="gpsline">' +
    esc(gpsLine()) +
    '</div><button data-act="gps" class="' +
    (R.gps ? "" : "off") +
    '">GPS ' +
    (R.gps ? "オン" : "オフ") +
    "</button></div>"
  );
}

/** 次の番手の提案（球の場所を押すボタンつき） */
function suggestCard(n, h) {
  const s = suggest(n),
    tip = lieTip(n, h);
  return (
    '<div class="sug">' +
    lieRow(n, h) +
    '<div class="t">次の番手</div><div class="c">' +
    esc(s.c) +
    '</div><div class="n">' +
    esc(s.n) +
    "</div>" +
    (tip ? '<div class="n" style="margin-top:4px;font-weight:700">' + esc(tip) + "</div>" : "") +
    "</div>"
  );
}

/** 球の場所を押すボタンの行（球に着いた合図） */
function lieRow(n, h) {
  if (R.simple || h.green || atTee(n)) return "";
  return (
    choiceRow(LIE, "lie", lieOf(h), 40, "0 0 8px") +
    '<div class="note" style="margin:-4px 0 6px">球の場所（押すと到着の合図にもなります）</div>'
  );
}

/** 打数の入力（◀ ▶ で何打目かを選び、番手・結果・到着を押す） */
function shotCard(n, h) {
  const i = slotOf(h),
    s = h.shots[i] || null,
    last = i === h.shots.length - 1,
    open = s && s === openShot(h),
    no = strokeNo(h, i),
    rec = !s ? suggest(n).rec : null; // 提案している番手（新しい打のときだけ印を付ける）
  const clubs = byDist()
    .slice()
    .reverse()
    .map((c) => {
      const on = s && s.c === c.name,
        isRec = rec && (c.name === rec || rec.indexOf(c.name) >= 0),
        off = !s && ng(c, h);
      return (
        '<button data-club="' +
        esc(c.name) +
        '" class="' +
        (on ? "sel " : "") +
        (isRec ? "rec" : "") +
        '"' +
        (off ? ' style="opacity:.55"' : "") +
        ">" +
        esc(c.name) +
        "<small>" +
        (off ? "使わない" : eff(c, h) + "Y") +
        "</small></button>"
      );
    })
    .join("");
  const state = !s
    ? "まだ記録していません。打つ前に番手を押すと記録します。"
    : open
      ? esc(s.c) + "で記録しました。ボールに着いたら「到着」を押します。"
      : (s.r === "add" ? "番手なし" : esc(s.c)) +
        (s.r === "ok" ? "" : "・" + esc(resLabel(s))) +
        (s.dist ? "・" + s.dist + "Y" : "") +
        "（記録ずみ。番手や結果を押すと直せます）";
  const arriveBtn = open
    ? '<button class="act" data-arrive="1" style="width:100%;min-height:60px;font-size:18px">到着（ボールに着いた）</button>'
    : '<button class="ghost" disabled style="width:100%;min-height:60px;font-size:16px;opacity:.5">到着（' +
      (!s ? "番手を押して打ったあとに押せます" : "この打は到着ずみです") +
      "）</button>";
  return (
    '<section class="card" id="strokecard" style="border:2px solid var(--accent)">' +
    '<div class="hole-nav" style="display:grid;grid-template-columns:64px 1fr 64px;gap:8px;align-items:center">' +
    '<button class="ghost" data-sk="-1" style="min-height:56px;font-size:22px"' +
    (i === 0 ? " disabled" : "") +
    ">◀</button>" +
    '<div style="text-align:center"><div id="strokeno" style="font-size:28px;font-weight:700">' +
    no +
    '打目</div><div class="note" style="margin:0">' +
    (s ? "記録ずみ " + (i + 1) + "/" + h.shots.length : "次の打") +
    "</div></div>" +
    '<button class="ghost" data-sk="1" style="min-height:56px;font-size:22px"' +
    (!s ? " disabled" : "") +
    ">▶</button></div>" +
    '<p class="note" id="strokestate" style="margin:0;color:var(--fg)">' +
    state +
    "</p>" +
    '<div class="h" style="font-size:14px">番手（打つ前に押す）</div>' +
    '<div class="clubs">' +
    clubs +
    "</div>" +
    arriveBtn +
    (s && s.r !== "add" && s.r !== "f4" ? resultBox(n, h, i) : !s ? f4Box(n) : "") +
    (s
      ? '<div class="two"><button class="ghost" data-del="1" style="color:var(--danger)">この打を消す</button>' +
        (h.green
          ? '<button class="act" data-edend="1">パットの入力に戻る</button>'
          : last
            ? '<button class="act" data-act="green">グリーンに乗った</button>'
            : '<button class="ghost" data-edend="1">いちばん新しい打へ</button>') +
        "</div>"
      : '<div class="two"><button class="ghost" data-add="1">番手なしで1打足す</button><button class="act" data-act="green">グリーンに乗った</button></div>') +
    shotLog(h, i < h.shots.length ? i : null) +
    '<button class="ghost" data-simple="1" style="width:100%">かんたん入力（合計打数だけ）</button>' +
    "</section>"
  );
}

/** 結果のボタン（OB・池・ロスト・空振り）。i 番目の打に付ける */
function resultBox(n, h, i) {
  const s = h.shots[i];
  const cur = s.r === "ob" ? s.k || "ob" : s.r === "miss" ? "miss" : null;
  return (
    '<div class="h" style="font-size:14px">結果（ふつうに打てた時は押さない）</div><div class="res r4">' +
    RESULTS.map(
      (x) =>
        '<button data-res="' +
        x[0] +
        '" class="' +
        (cur === x[0] ? "warn" : "off") +
        '">' +
        x[1] +
        "</button>",
    ).join("") +
    (i === h.shots.length - 1 ? f4Btn(n) : "") +
    "</div>" +
    (i === h.shots.length - 1 ? f4Box(n) : "") +
    note("OB・池・ロストは1打罰で、次は同じ場所から。もう一度押すと取り消せます。", ' style="margin:0"') +
    (i === h.shots.length - 1 && s.r === "ok" ? clubNotes(s.c) : "")
  );
}

/** その番手の注意（番手の使い方・このコースの注意・コーチの教え） */
function clubNotes(c) {
  const courseTip = CO.clubTips && CO.clubTips[c];
  return (
    (ADV[c] ? '<p class="note" style="color:var(--fg)">' + esc(ADV[c][1]) + "</p>" : "") +
    (courseTip ? '<p class="note" style="color:var(--fg)">このコース：' + esc(courseTip) + "</p>" : "") +
    (COACH[c] ? '<p class="note">コーチ：' + esc(COACH[c][0]) + "</p>" : "")
  );
}

/** このホールで記録した打の一覧（押すと、その打を直せる） */
function shotLog(h, ed) {
  if (!h.shots.length) return "";
  return (
    '<div class="note" style="margin:0">記録した打（押すと、その打へ移ります）</div><div class="log">' +
    h.shots
      .map(
        (x, i) =>
          '<button data-ed="' +
          i +
          '"' +
          (ed === i ? ' class="on"' : "") +
          ">" +
          (i + 1) +
          ". " +
          (x.r === "add" ? "" : esc(x.c) + " ") +
          (x.r === "ok" ? "" : resLabel(x)) +
          (x.lie === "bunker" ? "（バンカー）" : "") +
          (x.dist ? "・" + x.dist + "Y" : "") +
          "</button>",
      )
      .join("") +
    "</div>"
  );
}

/** 前進ティーのボタン（1打目だけ出る） */
function f4Btn(n) {
  return f4Open(n)
    ? '<button class="mid" style="grid-column:1/-1;background:var(--soft);color:var(--fg)" data-f4="1">前進' +
        f4T(n) +
        "打（特設ティーへ）</button>"
    : "";
}

/** 前進ティーの残り距離を入れる欄 */
function f4Box(n) {
  if (!U.f4 || !f4Open(n)) return "";
  return (
    '<div class="row"><input class="input" id="f4y" type="number" inputmode="numeric" min="0" max="700" value="' +
    Math.min(150, rem(n)) +
    '" aria-label="特設ティーからの残りヤード"><button class="act" data-f4go="1">反映</button></div><p class="note">特設ティーからグリーンまでの距離を入れます。次が' +
    f4T(n) +
    "打目になるよう打数を直します。使えるかはコースのルールで確認してください。</p>"
  );
}

/** グリーン上：パットを数える枠。ショットとパットの内訳も見せる */
function puttCard(n, h) {
  return (
    '<section class="card"><div class="h">パット ' +
    h.putts +
    '</div><div class="two"><button class="ghost" data-putt="-1">1減らす</button><button class="act" data-putt="1">パットを記録</button></div>' +
    '<p class="note" id="breakdown" style="color:var(--fg)">内訳：ショット ' +
    shotStrokes(h) +
    "打 ＋ パット " +
    h.putts +
    "打 ＝ " +
    strokes(h) +
    "打</p>" +
    stepper("ティーからグリーンに乗るまで（罰打を含む）", shotStrokes(h), "gs", false) +
    note("記録しそこねた打があれば、ここで合わせます。＋は番手なしの1打を足し、−は最後の打から消します。") +
    shotLog(h, null) +
    '<button class="ghost" data-act="ungreen">グリーンを外れた（戻す）</button>' +
    (D[n - 1].gc || R.gps ? greenFixBox(n) : "") +
    "</section>"
  );
}

/** グリーンの位置を登録し直す欄 */
function greenFixBox(n) {
  const f = gFix()[n];
  return (
    '<button class="ghost" data-gfix="1">ここをグリーン中央として登録</button>' +
    (f ? '<button class="link" data-gunfix="1">登録を取り消す（元の位置に戻す）</button>' : "") +
    '<p class="note">' +
    (f
      ? "このホールのグリーンは、登録した位置を使っています。"
      : "残り距離がずれていた時だけ押します。グリーンの真ん中に立って押すと、次回からその位置で測ります。") +
    "</p>"
  );
}

/** 残り距離を手で直す欄（カートナビの数字を入れる） */
function fixCard() {
  return card(
    "残り距離を手入力",
    '<div class="row"><input class="input" id="fix" type="number" inputmode="numeric" min="0" max="700"' +
      ' placeholder="カートナビのY" aria-label="残りヤード"><button class="act" data-act="fix">反映</button></div>',
  );
}

/** かんたん入力：合計打数と、そのうちのパット数だけを入れる欄 */
function quickBox(n, h) {
  const d = D[n - 1],
    v = h.quick != null ? h.quick : strokes(h);
  return (
    '<section class="card">' +
    stepper("このホールの合計打数", v || "-", "q", true) +
    stepper("うちパット", h.putts, "qp", false) +
    '<div class="two"><button class="ghost" data-qclear="1"' +
    (h.quick == null ? " disabled" : "") +
    '>入力を消す</button><button class="act" data-go="1">次のホールへ</button></div><p class="note">未入力の時は最初の＋でPar' +
    d.p +
    'になります。ここの数字は詳しい記録より優先します。パットは分かる時だけ入れます。</p><button class="ghost" data-simple="0">詳しい記録に戻す</button></section>'
  );
}

/** 今の1打の感触（方向・当たり）を押す欄 */
function feelBox(h) {
  const s = h.shots[h.shots.length - 1];
  if (!s || s.r === "miss" || s.r === "add") return "";
  return (
    '<section class="card">' +
    '<div class="h">今の1打の感触（' +
    esc(s.c) +
    (s.dist ? "・実測" + s.dist + "Y" : "") +
    "）</div>" +
    choiceRow(DIR, "fd", s.dir, 44) +
    choiceRow(HIT, "fh", s.hit, 44) +
    '<p class="note">押さなくても打数は記録されています。もう一度押すと取り消せます。</p></section>'
  );
}

/** このホールの危険・狙い・グリーン周り */
function hazardCard(d) {
  const rows = [
    ["危険", d.risk],
    ["狙い", d.aim],
    ["グリーン周り", d.green],
  ].filter((x) => x[1]);
  if (!rows.length) return "";
  return (
    '<section class="card"><dl>' +
    rows.map((x) => "<dt>" + x[0] + "</dt><dd>" + esc(x[1]) + "</dd>").join("") +
    "</dl></section>"
  );
}

/** お試しモード中に、全画面の上へ出す枠（ホール画面では、立つ場所を動かすボタンつき） */
function demoBar() {
  const b = (k, t) =>
    '<button class="ghost" style="min-height:44px;font-size:14px;padding:0 2px" data-sim="' +
    k +
    '">' +
    t +
    "</button>";
  let move = "";
  if (U.view === "hole")
    move = R.gps
      ? '<div class="h">お試しの現在地（GPSの代わり）</div><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px">' +
        b("tee", "ティー") +
        b("fwd", "50Y進む") +
        b("near", "残り30Y") +
        b("green", "グリーン上") +
        "</div>" +
        note(
          "ボタンで立つ場所を動かすと、コースを歩いた時と同じように残り距離と提案が変わります。" +
            "下のホール図をタップして、好きな場所に立つこともできます。",
          ' style="margin:0"',
        )
      : note("下の「GPS」をオンにすると、立つ場所をボタンで動かして試せます。", ' style="margin:0"');
  return card(
    "",
    '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center">' +
      '<div><b>お試しモード中</b><div class="note" style="margin:0">ここでの操作は本番の記録に残りません。</div></div>' +
      '<button class="ghost" style="min-height:44px;padding:0 10px" data-demo="off">終わる</button></div>' +
      move,
    ' style="border:2px solid #d97706"',
  );
}
