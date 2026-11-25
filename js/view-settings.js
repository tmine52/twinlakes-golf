/*
 * 「番手の距離」画面（設定もここ）
 *
 * 上から順に：コース → お試しモード → 使うティー → 番手の距離の見直し案 → 番手の距離 → 番手ごとの記録（累計）と飛距離の伸び
 *   → 記録の控え（書き出し・読み込み） → ラウンド記録を消す
 */

/** 「番手の距離」画面を描く */
function clubsView() {
  app.innerHTML =
    courseBox() +
    demoCard() +
    teeCard() +
    proposalCard() +
    distCard() +
    clubLogCard() +
    backupCard() +
    resetCard();
}

/** コースの選択・追加の欄 */
function courseBox() {
  const gps = D.filter((d) => d.gc).length,
    tee = D.filter((d) => d.tc).length,
    wp = D.filter((d) => d.wp && d.wp.length).length;
  return (
    '<section class="card"><div class="h">コース</div><select id="csel" class="input" aria-label="コース選択" style="width:100%">' +
    courseList()
      .map((c) => optionTag(c.id, c.name, c.id === CO.id))
      .join("") +
    '</select><p class="note">今のコース：グリーンの座標 ' +
    gps +
    "/18、ティーの座標 " +
    tee +
    "/18" +
    (wp ? "、通過点（曲がり角）のあるホール " + wp : "") +
    '。座標があるホールだけ、GPSの残り距離と旗の図が使えます。</p><div class="h">コースを追加</div>' +
    '<textarea id="cjson" rows="3" placeholder="クロコが作ったコースデータを貼り付け" aria-label="コースデータ" style="' +
    STYLE_TEXTBOX +
    '"></textarea>' +
    twoButtons(
      '<button class="act" data-cadd="1">追加する</button>',
      '<button class="ghost" data-ccopy="1">今のコースをコピー</button>',
    ) +
    (COURSES.indexOf(CO) < 0
      ? '<button class="link" data-cdel="1">' +
        (U.cdel ? "もう一度押すと「" + esc(CO.name) + "」を消します" : "このコースを消す") +
        "</button>"
      : "") +
    "</section>"
  );
}

/** お試しモードの入口 */
function demoCard() {
  return (
    '<section class="card"><div class="h">お試しモード</div>' +
    (DEMO
      ? '<p class="note">お試しモード中です。終わると、ここで入れた記録・番手の距離・追加したコースは消え、本番の内容に戻ります。</p><button class="act" data-demo="off">お試しを終わる</button>'
      : note(
          "操作の練習用です。本番の記録とは別の場所に保存するので、何を押しても本番の記録・履歴は変わりません。" +
            "GPSの代わりに、立つ場所をボタンや図のタップで動かせます（家でも試せます）。",
        ) + '<button class="act" data-demo="on">お試しモードを始める</button>') +
    "</section>"
  );
}

/** 使うティーを選ぶ欄 */
function teeCard() {
  return (
    '<section class="card"><div class="h">使うティー</div><div style="display:grid;grid-template-columns:repeat(' +
    CO.tees.length +
    ',minmax(0,1fr));gap:6px">' +
    CO.tees
      .map(
        (t) =>
          '<button class="' +
          (R.tee === t[0] ? "act" : "ghost") +
          '" data-tee="' +
          esc(t[0]) +
          '">' +
          esc(t[1]) +
          "</button>",
      )
      .join("") +
    "</div></section>"
  );
}

/** 実測から作った、番手の距離の見直し案（押した番手だけ変える。自動では変えない） */
function proposalCard() {
  const P = distProposals();
  return (
    '<section class="card"><div class="h">番手の距離の見直し（実測から）</div>' +
    (P.length
      ? P.map(
          (p) =>
            '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center"><div style="font-size:14px"><b>' +
            esc(p.name) +
            "</b>：実測の中央値 " +
            p.med +
            "Y（" +
            p.n +
            "回・" +
            p.min +
            "〜" +
            p.max +
            "Y）。今の設定は " +
            p.from +
            'Y</div><button class="act" style="padding:0 10px;white-space:nowrap" data-prop="' +
            esc(p.name) +
            '">' +
            p.to +
            "Yにする</button></div>",
        ).join("") +
        '<p class="note">FWから打って結果が「普通」だった打の、GPSの実測だけで計算しています。押した番手だけ変わります。下の欄でいつでも直せます。</p>'
      : note(
          "今は見直し案がありません。同じ番手の実測（FWから・結果が普通）が3回以上たまり、" +
            "今の設定と10Y以上ちがう時に、ここへ案を出します。距離を自動で変えることはありません。",
        )) +
    "</section>"
  );
}

/** 番手ごとの計画の距離を直す欄 */
function distCard() {
  return (
    '<section class="card"><div class="h">番手の距離（Y）</div>' +
    '<div class="row3 note"><div></div><div>フル</div><div>ハーフ</div></div>' +
    R.clubs
      .map(
        (c, i) =>
          '<div class="row3"><div style="align-self:center;font-weight:700">' +
          esc(c.name) +
          '</div><input class="input" data-dist="' +
          i +
          '" type="number" inputmode="numeric" min="1" max="350" value="' +
          c.dist +
          '" aria-label="' +
          esc(c.name) +
          'のフルスイングの距離"><input class="input" data-half="' +
          i +
          '" type="number" inputmode="numeric" min="1" max="350" value="' +
          (c.half > 0 ? c.half : "") +
          '" placeholder="' +
          halfOf(c) +
          '（仮）" aria-label="' +
          esc(c.name) +
          'のハーフスイングの距離"></div>',
      )
      .join("") +
    '<p class="note">ハーフが空欄の番手は、フルの9割（5Y単位。薄い字の数字）を仮に使います。練習でハーフの距離を測ったら入れてください。ホール画面の「フル／ハーフ」で、番手の勧めに使う距離を切り替えます。</p>' +
    "</section>"
  );
}

/** 記録の控え（書き出し・読み込み）の欄 */
function backupCard() {
  const box = STYLE_TEXTBOX;
  return (
    '<section class="card"><div class="h">記録の控え（書き出し・読み込み）</div><p class="note">' +
    "履歴・番手の距離・追加したコース・途中の記録を、1つの文にまとめます。" +
    "記録はこのスマホの中だけにあるので、機種変更の前や、ラウンドのあとに控えを取っておくと安心です。最後の控え：" +
    (R.bkAt ? esc(R.bkAt) : "まだ取っていません") +
    '</p><div class="two"><button class="act" data-bk="copy">控えをコピー</button><button class="ghost" data-bk="file">ファイルで保存</button></div>' +
    (U.bkShow
      ? '<textarea id="bkout" readonly rows="4" aria-label="控えの文" style="' +
        box +
        '">' +
        esc(backupText()) +
        "</textarea>"
      : "") +
    '<div class="h">控えから戻す</div><textarea id="bktext" rows="3" placeholder="控えの文を貼り付け" aria-label="控えの文を貼り付け" style="' +
    box +
    '">' +
    esc(U.bkText || "") +
    '</textarea><input id="bkfile" type="file" accept=".txt,.json,text/plain,application/json" aria-label="控えのファイルを選ぶ" style="font-size:14px;max-width:100%">' +
    '<button class="' +
    (U.bkArm ? "act" : "ghost") +
    '" data-bk="load">' +
    (U.bkArm ? "もう一度押すと読み込みます" : "控えを読み込む") +
    '</button><p class="note" id="bkinfo">' +
    esc(
      U.bkInfo ||
        "読み込むと、履歴は今の内容と合わせます（同じラウンドは、新しく保存したほうを残します）。" +
          "番手の距離は控えの内容になり、追加したコースは控えの分を足します。",
    ) +
    "</p></section>"
  );
}

/** 今のコースのラウンド記録を消す欄（2回押し） */
function resetCard() {
  return (
    '<section class="card"><button class="link" data-act="reset">' +
    (U.arm ? "もう一度押すと全ホールの記録を消します" : "ラウンド記録をすべて消す") +
    "</button></section>"
  );
}
