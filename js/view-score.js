/*
 * 「スコア」画面：スコア表、結果を送る、番手別の傾向、履歴
 */

/** 表の1行を作る（cells: セルの中身の並び、attrs: tr に付ける属性） */
function tableRow(cells, attrs) {
  return "<tr" + (attrs || "") + ">" + cells.map((c) => "<td>" + c + "</td>").join("") + "</tr>";
}

/** 複数行に書ける読み取り専用の枠（長押しでコピーするための表示用） */
function textBox(id, text, label) {
  return (
    '<textarea id="' +
    id +
    '" readonly rows="6" aria-label="' +
    label +
    '" style="' +
    STYLE_TEXTBOX +
    '">' +
    esc(text) +
    "</textarea>"
  );
}

/** 「スコア」画面を描く */
function scoreView() {
  // a番〜b番の行と、その合計を作る
  const half = (a, b) => {
    let t = 0,
      html = "";
    for (let i = a; i <= b; i++) {
      const h = R.holes[i],
        s = stat(h),
        v = h && touched(h) ? strokes(h) : null;
      if (v != null) t += v;
      html += tableRow(
        [
          i,
          D[i - 1].p,
          v == null ? "-" : v,
          h && h.putts ? h.putts : "-",
          s.bunker || "-",
          s.miss || "-",
          s.ob || "-",
        ],
        ' data-hole="' + i + '"',
      );
    }
    return { html, t };
  };
  const sum = (name, t) =>
    '<tr class="sum"><td colspan="2">' +
    name +
    "</td><td>" +
    t +
    "</td><td></td><td></td><td></td><td></td></tr>";
  const o = half(1, 9),
    i = half(10, 18);
  app.innerHTML =
    '<section class="card"><div class="h">合計 ' +
    (o.t + i.t) +
    " 打</div><table><thead><tr><th>H</th><th>Par</th><th>打数</th><th>パット</th><th>B</th><th>空</th><th>OB</th></tr></thead><tbody>" +
    o.html +
    sum("OUT", o.t) +
    i.html +
    sum("IN", i.t) +
    '</tbody></table><p class="note">Bはバンカーの打数、空は空振りです。行をタップするとそのホールを開きます。</p></section>' +
    exportBox() +
    feelStats() +
    histBox();
}

/** 結果を送る欄（コピー・共有） */
function exportBox() {
  return (
    '<section class="card"><div class="h">結果を送る</div>' +
    twoButtons(
      '<button class="act" data-rcopy="1">結果をコピー</button>',
      '<button class="ghost" data-rshare="1">結果を共有</button>',
    ) +
    note("ホールごとの打数・パットと、全ショットの記録をまとめます。スクリーンショットは不要です。") +
    (U.rtext ? textBox("rtext", resultText(), "結果") : "") +
    "</section>"
  );
}

/** 番手を、「番手の距離」に並んでいる順にする */
function clubOrder(names) {
  const order = R.clubs.map((c) => c.name);
  return names.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** 並びの中に出てくる番手の名前（重なりなし） */
function clubNames(shots) {
  const names = [];
  shots.forEach((s) => {
    if (names.indexOf(s.c) < 0) names.push(s.c);
  });
  return clubOrder(names);
}

/** 番手別の傾向（方向・当たり）と、実測飛距離、研究用コピー */
function feelStats() {
  const L = allShots();
  if (!L.length) return "";
  const n = (l, f) => l.filter(f).length || "-";
  const rows = clubNames(L)
    .map((c) => {
      const l = L.filter((s) => s.c === c);
      return tableRow([
        "<b>" + esc(c) + "</b>",
        l.length,
        n(l, (s) => s.dir === "left"),
        n(l, (s) => s.dir === "straight"),
        n(l, (s) => s.dir === "right"),
        n(l, (s) => s.hit === "good"),
        n(l, (s) => s.hit === "fat"),
        n(l, (s) => s.hit === "top"),
        n(l, (s) => s.hit === "shank"),
      ]);
    })
    .join("");
  return (
    '<section class="card"><div class="h">番手別の傾向</div><div style="overflow-x:auto"><table style="font-size:14px">' +
    "<thead><tr><th>番手</th><th>球</th><th>左</th><th>直</th><th>右</th><th>芯</th><th>ダ</th><th>ト</th><th>シ</th></tr></thead><tbody>" +
    rows +
    '</tbody></table></div><p class="note">直はまっすぐ、ダはダフリ、トはトップ、シはシャンクです。履歴に保存した分も含みます。</p>' +
    distStats() +
    '<button class="ghost" data-csv="1">研究用に記録をコピー</button>' +
    (U.csv
      ? textBox("csvbox", shotCsv(), "記録データ") +
        '<p class="note">表計算に貼り付けられます。このチャットに貼れば分析もできます。</p>'
      : "") +
    "</section>"
  );
}

/** 番手別の実測飛距離（GPS） */
function distStats() {
  const L = allShots().filter((s) => s.dist);
  if (!L.length)
    return '<p class="note">実測はまだありません。GPSをオンにして、球に着いたら球の場所を押すと記録します。</p>';
  const props = distProposals().length;
  return (
    '<div class="h">番手別の実測飛距離（GPS）</div><table style="font-size:14px"><thead><tr><th>番手</th><th>回数</th><th>中央</th><th>平均</th><th>最長</th><th>最短</th></tr></thead><tbody>' +
    clubNames(L)
      .map((c) => {
        const v = L.filter((s) => s.c === c).map((s) => s.dist);
        return tableRow([
          "<b>" + esc(c) + "</b>",
          v.length,
          Math.round(median(v)) + "Y",
          Math.round(v.reduce((a, b) => a + b, 0) / v.length) + "Y",
          Math.max(...v) + "Y",
          Math.min(...v) + "Y",
        ]);
      })
      .join("") +
    "</tbody></table>" +
    note(
      "転がりを含む、止まった場所までの直線距離です。" +
        "中央は、小さい順に並べた真ん中の値（1回の大きなミスに引っぱられにくい）。" +
        "GPSの誤差で10Y前後ずれることがあります。",
    ) +
    (props
      ? '<p class="note" id="prophint" style="color:var(--fg)">番手の距離の見直し案が' +
        props +
        "件あります。「番手の距離」の画面で確認できます。</p>"
      : "")
  );
}

/** ラウンド履歴（保存・コース別の表示・平均・削除・整理） */
function histBox() {
  const all = R.hist || [],
    m = roundSummary(),
    saved = R.rid && all.some((x) => x.id === R.rid),
    names = [];
  all.forEach((x) => {
    if (names.indexOf(histCourse(x)) < 0) names.push(histCourse(x));
  });
  const pick = names.indexOf(U.hcourse) >= 0 ? U.hcourse : "", // 選んでいるコース（""＝すべて）
    L = pick ? all.filter((x) => histCourse(x) === pick) : all,
    full = L.filter((x) => x.n === 18), // 平均とベストは18ホール回ったラウンドだけ
    avg = (k) => (full.length ? (full.reduce((a, x) => a + k(x), 0) / full.length).toFixed(1) : "-"),
    big = (label, v) =>
      "<div><small>" + label + '</small><div style="font-weight:700;font-size:20px">' + v + "</div></div>";
  const rows = L.map((x) =>
    tableRow([
      '<span style="white-space:nowrap">' +
        esc(x.date.slice(5)) +
        "</span><br><small>" +
        esc(histCourse(x).slice(0, 6)) +
        "</small>",
      x.t + (x.n < 18 ? "<small>（" + x.n + "H）</small>" : ""),
      x.a.putts,
      x.a.bunker,
      x.a.miss,
      x.a.ob,
      '<button class="ghost" style="min-height:32px;padding:0 6px;font-size:13px" data-hdel="' +
        esc(x.id) +
        '">' +
        (U.hdel === x.id ? "消す" : "×") +
        "</button>",
    ]),
  ).join("");
  const slim = slimCount();
  return (
    '<section class="card"><div class="h">ラウンド履歴</div><button class="act" data-hsave="1"' +
    (m.n ? "" : " disabled") +
    ">" +
    (saved ? "このラウンドの履歴を更新" : "このラウンドを履歴に保存") +
    "</button>" +
    (all.length
      ? (names.length > 1
          ? '<select id="hsel" class="input" aria-label="履歴に出すコース" style="width:100%;font-size:16px">' +
            optionTag("", "すべてのコース（" + all.length + "回）", !pick) +
            names
              .map((c) =>
                optionTag(c, c + "（" + all.filter((x) => histCourse(x) === c).length + "回）", c === pick),
              )
              .join("") +
            "</select>"
          : "") +
        '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;text-align:center">' +
        big(
          "平均スコア",
          avg((x) => x.t),
        ) +
        big("ベスト", full.length ? Math.min(...full.map((x) => x.t)) : "-") +
        big(
          "平均パット",
          avg((x) => x.a.putts),
        ) +
        "</div><table><thead><tr><th>日付</th><th>打数</th><th>パ</th><th>B</th><th>空</th><th>OB</th><th></th></tr></thead><tbody>" +
        rows +
        '</tbody></table><p class="note">平均とベストは18ホール記録したラウンドだけで計算します。' +
        (names.length > 1 && !pick
          ? "パーのちがうコースが混ざるので、コースを選ぶと比べやすくなります。"
          : "") +
        "</p>"
      : '<p class="note">保存すると次回以降も残り、平均スコアやパット数を見られます。</p>') +
    (m.n
      ? '<button class="ghost" data-hnew="1">' +
        (U.hnew
          ? saved
            ? "もう一度押すと今の記録を消して始めます"
            : "未保存です。もう一度押すと今の記録を消します"
          : "新しいラウンドを始める") +
        "</button>"
      : "") +
    '<p class="note" id="usage">この端末に保存している量：約' +
    Math.max(1, Math.round(storeBytes() / 1024)) +
    "KB（前の版から引き継いだ分の写しを含む。上限の目安は約5,000KB）。控え：" +
    (R.bkAt ? esc(R.bkAt) + "に取りました" : "まだ取っていません") +
    "（「番手の距離」の画面の「記録の控え」）。</p>" +
    (slim
      ? '<button class="link" data-hslim="1">' +
        (U.hslim
          ? "もう一度押すと、1年より前の" + slim + "回分の1打ごとの記録を消します（打数は残ります）"
          : "1年より前の履歴を軽くする（1打ごとの記録だけ消す）") +
        "</button>"
      : "") +
    "</section>"
  );
}
