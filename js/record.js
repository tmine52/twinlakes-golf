/*
 * 記録：1打・空振り・番手なしの1打・前進ティー、ホールの移動、履歴への保存
 */

/* ---- 1打ごとの記録 ---- */

/** ラウンドの日付を覚える（その日の最初の記録のときだけ） */
function startRound() {
  if (!R.rdate) R.rdate = ymd();
}

/** 1打を記録する（res: ok=普通 / short=短い / ob=OB・池） */
function shot(res) {
  const n = R.cur,
    h = H(n),
    c = R.clubs.find((x) => x.name === U.sel);
  if (!c) return;
  const r = rem(n);
  let nr = r,
    pen = 0;
  const e = eff(c, h),
    k = lieOf(h),
    p = fixPos(),
    first = !lastReal(h);
  let from = shotFrom(h),
    bf = r,
    late = false;
  if (first && teeLate(n, p)) {
    // ティーから離れてから押した：どこから打ったか分からないので、実測しない
    late = true;
    from = null;
    bf = yards(n);
  } else if (!first && p && h.anc && h.ancN === h.shots.length && yardsTo(p, h.anc) > 40) {
    // 球に着いた合図の場所から40Y以上離れて押した：合図の場所から打ったことにする
    late = true;
    from = h.anc;
    if (h.ancRem != null) bf = h.ancRem;
  }
  if (res === "ok") nr = late ? r : Math.max(0, r - e);
  else if (res === "short") nr = late ? r : Math.max(0, r - Math.round(e / 2));
  else pen = 1;
  startRound();
  h.shots.push({ c: c.name, r: res, pen, before: bf, lie: k, from });
  h.rem = nr;
  h.lie = "fw";
  U.sel = null;
  save();
  render();
  window.scrollTo(0, 0);
  if (late && first)
    say(
      "ティーから離れた場所で押したため、この1打の実測は記録しません。残りは現在地の距離のままです。",
      6000,
    );
}

/** 空振りを記録する */
function miss() {
  const n = R.cur,
    h = H(n),
    r = rem(n);
  startRound();
  h.shots.push({ c: U.sel || "-", r: "miss", pen: 0, before: r, lie: lieOf(h) });
  h.rem = r;
  U.sel = null;
  save();
  render();
  window.scrollTo(0, 0);
}

/**
 * 番手を選ばずに1打足す（数え忘れた1打や、番手を押すひまがなかった1打）。
 * 打数（ショット）には数えるが、番手別の集計や実測には入れない。
 */
function addStroke() {
  const n = R.cur,
    h = H(n);
  startRound();
  h.shots.push({ c: "-", r: "add", pen: 0, before: rem(n), lie: lieOf(h) });
  U.sel = null;
  save();
  render();
}

/* ---- 前進ティー（OBのあと、特設ティーから打つ取り決め） ---- */

/** 前進ティーを使ったとき、次が何打目になるか（パー3は3、ほかは4） */
function f4T(n) {
  return D[n - 1].p === 3 ? 3 : 4;
}

/** 前進ティーを使える状態か（1打目だけ） */
function f4Open(n) {
  return H(n).shots.every((x) => x.r === "miss");
}

/** 前進ティーへ進む（打数を合わせ、残り距離を入れ直す） */
function f4Go() {
  const n = R.cur,
    h = H(n),
    e = document.getElementById("f4y"),
    v = Number(e && e.value);
  if (!e || e.value === "" || !(v >= 0 && v <= 700)) {
    say("0から700までの数字を入力してください。", 3000);
    return;
  }
  const t = f4T(n);
  startRound();
  h.shots.push({
    c: U.sel,
    r: "f4",
    pen: Math.max(0, t - 2 - strokes(h)),
    before: rem(n),
    lie: lieOf(h),
    t,
    from: shotFrom(h),
  });
  h.rem = Math.round(v);
  h.lie = "fw";
  U.sel = null;
  U.f4 = false;
  save();
  render();
  window.scrollTo(0, 0);
}

/* ---- ホールの移動 ---- */

/** n番へ移る */
function moveTo(n) {
  R.cur = n;
  U.sel = null;
  U.pic = "map";
  G.y = null;
  G.direct = null;
  save();
  render();
  window.scrollTo(0, 0);
}

/** そのホールの記録が途中に見えるか（次へ進む前に1回止めるため） */
function unfinished(n) {
  const h = R.holes[n];
  if (!h || !touched(h)) return false;
  const p = D[n - 1].p;
  if (h.quick != null) return h.quick < p - 1;
  return !h.green || h.putts === 0 || strokes(h) < p - 1;
}

/* ---- ラウンドと履歴 ---- */

/** 今のラウンドの全ショット（空振りと、番手なしの1打を除く） */
function curShots() {
  const o = [];
  Object.keys(R.holes).forEach((n) => {
    (R.holes[n].shots || []).forEach((s) => {
      if (s.r !== "miss" && s.r !== "add") o.push(Object.assign({ h: Number(n) }, s));
    });
  });
  return o;
}

/** 今回＋履歴の全ショット */
function allShots() {
  const o = curShots().map((s) => Object.assign({ date: "今回" }, s));
  (R.hist || []).forEach((x) => {
    if (x.id !== R.rid) (x.shots || []).forEach((s) => o.push(Object.assign({ date: x.date }, s)));
  });
  if (R.rid) {
    const x = (R.hist || []).find((y) => y.id === R.rid);
    if (x)
      o.forEach((s) => {
        if (s.date === "今回") s.date = x.date;
      });
  }
  return o;
}

/**
 * 今のラウンドの、ホールごとの内訳（記録のあるホールだけ）。
 * { n: ホール, p: パー, s: 打数, sh: ショット, pt: パット, bk: バンカー, ms: 空振り, ob: OB・池 }
 * かんたん入力のホールは、パットを入れていなければ sh と pt を null にする（分からないため）。
 */
function roundRows() {
  const rows = [];
  D.forEach((d, i) => {
    const h = R.holes[i + 1];
    if (!h || !touched(h)) return;
    const v = strokes(h),
      s = stat(h),
      unknown = h.quick != null && !h.putts;
    rows.push({
      n: i + 1,
      p: d.p,
      s: v,
      sh: unknown ? null : v - h.putts,
      pt: unknown ? null : h.putts,
      bk: s.bunker,
      ms: s.miss,
      ob: s.ob,
    });
  });
  return rows;
}

/** 履歴の1件のコース名（コースを選べなかった頃の履歴にはコース名が無いので、最初のコースとみなす） */
function histCourse(x) {
  return x.course || COURSES[0].name;
}

/** 今のラウンドの日付（履歴に保存済みならその日付、無ければ打ち始めた日、それも無ければ今日） */
function roundDate() {
  const x = R.rid && (R.hist || []).find((y) => y.id === R.rid);
  return (x && x.date) || R.rdate || ymd();
}

/** 今のラウンドを履歴に保存する（同じラウンドなら上書き） */
function saveRound() {
  const m = roundSummary();
  if (!m.n) {
    say("記録があるホールがありません。", 3000);
    return;
  }
  const date = roundDate();
  R.hist = R.hist || [];
  R.rid = R.rid || String(Date.now());
  const e = Object.assign(
    {
      id: R.rid,
      date,
      at: Date.now(), // 履歴に保存した時刻（控えを読み込むとき、同じラウンドの新しいほうを残すのに使う）
      tee: R.tee,
      teeName: TN[R.tee],
      course: COURSE,
      shots: curShots(),
      rows: roundRows(),
    },
    m,
  );
  const i = R.hist.findIndex((x) => x.id === R.rid);
  if (i >= 0) R.hist[i] = e;
  else R.hist.unshift(e);
  save();
  render();
  say("履歴に保存しました。", 2500);
}

/** 新しいラウンドを始める（今のコースの記録を空にする。履歴は消さない） */
function newRound() {
  R.holes = {};
  R.cur = 1;
  R.rid = null;
  R.rdate = null;
}

/** date（YYYY-MM-DD）が、今日から数えて1年より前か */
function olderThanYear(date) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return String(date) < ymd(d);
}

/** 1年より前の履歴で、1打ごとの記録が残っているラウンドの数 */
function slimCount() {
  return (R.hist || []).filter((x) => olderThanYear(x.date) && (x.shots || []).length).length;
}

/** 1年より前の履歴から、1打ごとの記録だけを消して軽くする（打数・パットなどの合計は残す） */
function slimOld() {
  let n = 0;
  (R.hist || []).forEach((x) => {
    if (olderThanYear(x.date) && (x.shots || []).length) {
      x.shots = [];
      n++;
    }
  });
  return n;
}
