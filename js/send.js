/*
 * 「上達道場へ渡す」画面（send.html）
 *
 * 上達道場（練習用の別のアプリ）で「攻略アプリから受け取る」を押すと、この画面が開く。
 * ここで選んだラウンドの結果を、開いた元の上達道場へ直接渡す（コピーと貼り付けがいらない）。
 *
 * 渡す相手は DOJO_ORIGIN（上達道場のページの場所）だけ。
 * ほかのサイトがこの画面を開いても、結果はそのサイトへは届かない。
 */
const DOJO_ORIGIN = "https://084ba4e3-b171-4d41-a4bf-eed9f6e36491.frame.claudeusercontent.com";

load();
applyCourse();
document.title = "上達道場へ渡す";

let SENT = null; // 渡したラウンドの見出し（上達道場から「受け取った」の返事を待っている間）

/** 渡せるラウンドの一覧（記録中のラウンド → 履歴の新しい順）。[{ title, sub, text }] */
function sendList() {
  const L = [],
    m = roundSummary();
  if (m.n) {
    const o = currentRound();
    L.push({
      title: "記録中のラウンド：" + o.course,
      sub: o.date + "・" + m.t + "打（" + m.n + "ホール）",
      text: roundText(o),
    });
  }
  (R.hist || []).forEach((x) => {
    if (m.n && x.id === R.rid) return; // 記録中のラウンドと同じものは、上の1件で足りる
    const o = histRound(x);
    if (!o.rows.length) return; // ホールごとの打数が無い記録は、上達道場が読めない
    L.push({
      title: x.date + "　" + (o.course || "コース名なし"),
      sub: x.t + "打（" + x.n + "ホール）" + (x.rows ? "" : "・パットの内訳なし"),
      text: roundText(o),
    });
  });
  return L;
}

/** 画面を描く */
function drawSend(msg) {
  const L = sendList();
  app.innerHTML =
    "<h1>上達道場へ渡す</h1>" +
    (msg ? '<div class="msg" id="sendmsg">' + esc(msg) + "</div>" : "") +
    (L.length
      ? '<p class="note">渡すラウンドを1つ押してください。' +
        (window.opener ? "" : "（上達道場から開いていないので、押すと結果をコピーします）") +
        "</p>" +
        L.map(
          (x, i) =>
            '<button class="item" data-i="' +
            i +
            '">' +
            esc(x.title) +
            "<small>" +
            esc(x.sub) +
            "</small></button>",
        ).join("")
      : '<p class="note">渡せるラウンドがありません。攻略アプリで打数を記録するか、「スコア」の「履歴に保存」を押してから、もう一度開いてください。</p>') +
    '<p class="note">' +
    esc(APP_NAME + " " + APP_VER) +
    "</p>";
}

/** 結果をコピーする（上達道場へ直接渡せないときの代わり） */
async function copyForDojo(text) {
  try {
    await navigator.clipboard.writeText(text);
    drawSend("結果をコピーしました。上達道場の「結果を貼り付ける」に貼り付けてください。");
  } catch (e) {
    drawSend(
      "直接渡せず、コピーもできませんでした。攻略アプリの「スコア」→「結果をコピー」を使ってください。",
    );
  }
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (!b) return;
  if (SENT) return; // 渡している最中は、ほかのラウンドを受け付けない（上達道場が受け取るのは1回に1件）
  const x = sendList()[Number(b.dataset.i)];
  if (!x) return;
  if (!window.opener || window.opener.closed) {
    copyForDojo(x.text);
    return;
  }
  SENT = x;
  window.opener.postMessage({ app: "golf-kouryaku", kind: "round", text: x.text }, DOJO_ORIGIN);
  drawSend("上達道場へ渡しています…");
  // 3秒待っても「受け取った」の返事が無ければ、コピーに切り替える
  setTimeout(() => {
    if (SENT === x) {
      SENT = null;
      copyForDojo(x.text);
    }
  }, 3000);
});

// 上達道場からの「受け取った」の返事
window.addEventListener("message", (e) => {
  if (e.origin !== DOJO_ORIGIN || !e.data || e.data.app !== "golf-jotatsu-dojo" || e.data.kind !== "ack")
    return;
  if (!SENT) return;
  const t = SENT.title;
  SENT = null;
  if (e.data.ok === false) {
    // 届いたが、上達道場が中身を読み取れなかった（画面は閉じない。上達道場の画面に理由が出ている）
    drawSend(
      "上達道場へ渡しましたが、上達道場が内容を読み取れませんでした（" +
        t +
        "）。上達道場の画面を確かめてください。",
    );
    return;
  }
  drawSend(
    "上達道場へ渡しました（" +
      t +
      "）。この画面は閉じてかまいません。上達道場の画面で「この内容で保存する」を押してください。",
  );
  setTimeout(() => {
    try {
      window.close();
    } catch (er) {}
  }, 2500);
});

drawSend();
