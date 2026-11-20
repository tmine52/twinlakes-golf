/*
 * 記録：1打・空振り・番手なしの1打・前進ティー、ホールの移動、履歴への保存
 */

/* ---- 1打ごとの記録 ---- */

/** ラウンドの日付を覚える（その日の最初の記録のときだけ） */
function startRound() {
  if (!R.rdate) R.rdate = ymd();
}

/*
 * 1打の入れ方（v31）
 *   ◀ ▶ で「何打目」を選び、その打の番手を押す。
 *   ・新しい打（まだ記録していない打目）で番手を押す … その番手で1打を記録する
 *   ・記録ずみの打で番手を押す … その打の番手を直す（打数は増えない）
 *   ・ボールに着いたら「到着」… 打った場所からの距離（実測）を記録し、次の打目へ進む
 *   ・OB・池・ロスト・空振りのときだけ、結果のボタンを押す（押すと次の打目へ進む）
 *   U.edit … ◀ ▶ で選んでいる打（0から数える）。null のときは自動（到着前の打、無ければ次の新しい打）
 */

/** 結果のボタン（OB・池・ロスト・空振り）。押さなければ「ふつうに打てた」 */
const RESULTS = [
  ["ob", "OB"],
  ["pond", "池"],
  ["lost", "ロスト"],
  ["miss", "空振り"],
];

/** そのホールの最後の打が、まだボールに着いていない（到着を押していない）ふつうの打か */
function openShot(h) {
  const s = h.shots[h.shots.length - 1];
  return s && s.r === "ok" && h.arr !== h.shots.length && !h.green ? s : null;
}

/** 今入力している打（0から数える）。h.shots.length なら、まだ記録していない新しい打 */
function slotOf(h) {
  if (U.edit != null && U.edit >= 0 && U.edit <= h.shots.length) return U.edit;
  return openShot(h) ? h.shots.length - 1 : h.shots.length;
}

/** i番目の打が「何打目」か（前の打の罰打も数える） */
function strokeNo(h, i) {
  let n = 1;
  for (let j = 0; j < i && j < h.shots.length; j++) n += 1 + (h.shots[j].pen || 0);
  return n;
}

/** 番手を押したとき：選んでいる打が新しい打なら1打を記録、記録ずみの打なら番手を直す */
function clubTap(name) {
  const h = H(R.cur),
    c = R.clubs.find((x) => x.name === name);
  if (!c) return;
  const i = slotOf(h),
    s = h.shots[i],
    p = fixPos();
  if (!s) return shot(c);
  // 到着を押し忘れて、次の球のところで番手を押した（GPSで30Y以上離れている）：前の打を到着にして、新しい打にする
  if (s === openShot(h) && p && s.from && yardsTo(p, s.from) > 30) {
    arrive(h);
    say(strokeNo(h, i) + "打目を到着にして、次の打を記録しました。", 3000);
    return shot(c);
  }
  editClub(i, name);
}

/** 1打を記録する（番手 c で、ふつうに打てた1打として） */
function shot(c) {
  const n = R.cur,
    h = H(n);
  const r = rem(n);
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
  startRound();
  h.shots.push({ c: c.name, r: "ok", pen: 0, before: bf, lie: k, from, at: Date.now() });
  h.rem = late ? r : Math.max(0, r - e);
  h.lie = "fw";
  U.edit = null;
  save();
  render();
  window.scrollTo(0, 0);
  if (late && first)
    say(
      "ティーから離れた場所で押したため、この1打の実測は記録しません。残りは現在地の距離のままです。",
      6000,
    );
}

/** ボールに着いた（到着）。打った場所からの距離を記録する。lie を渡すと球の場所も変える */
function arrive(h, lie) {
  if (lie) h.lie = lie;
  h.arr = h.shots.length;
  markBall(h);
  const p = fixPos();
  if (p) {
    h.anc = p;
    h.ancN = h.shots.length;
    h.ancRem = rem(R.cur);
  }
}

/**
 * i打目（0から数える）の結果を付ける。k: ob / pond / lost / miss。
 * 同じ結果をもう一度押すと取り消す（ふつうに打てた1打に戻す）。
 * OB・池・ロストは1打罰で、次は同じ場所から打つ扱い。空振りは打数1・距離0。
 */
function setResult(i, k) {
  const h = H(R.cur),
    s = h.shots[i];
  if (!s || s.r === "add" || s.r === "f4") return;
  const cur = s.r === "ob" ? s.k || "ob" : s.r === "miss" ? "miss" : null;
  const last = i === h.shots.length - 1;
  delete s.to;
  delete s.dist;
  delete s.k;
  if (cur === k) {
    // 取り消し：ふつうに打てた1打に戻す
    s.r = "ok";
    s.pen = 0;
    if (last) {
      const c = R.clubs.find((x) => x.name === s.c);
      if (!fixPos() && c) h.rem = Math.max(0, s.before - eff(c, { lie: s.lie }));
      if (h.arr === h.shots.length) h.arr = null;
      h.lie = "fw";
    }
    say(strokeNo(h, i) + "打目の結果を取り消しました。", 2500);
  } else {
    s.r = k === "miss" ? "miss" : "ob";
    s.pen = k === "miss" ? 0 : 1;
    if (k !== "miss") s.k = k;
    if (last) {
      h.rem = s.before; // 同じ場所から打ち直す
      h.lie = s.lie || "fw";
      h.arr = h.shots.length;
    }
    say(strokeNo(h, i) + "打目を「" + resLabel(s) + "」にしました" + (s.pen ? "（1打罰）" : "") + "。", 2500);
  }
  if (last) U.edit = null;
  startRound();
  save();
  render();
}

/** i打目（0から数える）を消す */
function delShot(i) {
  const h = H(R.cur),
    s = h.shots[i];
  if (!s) return;
  const last = i === h.shots.length - 1;
  h.shots.splice(i, 1);
  if (last) {
    h.rem = s.before;
    h.lie = s.lie || "fw";
  }
  if (h.arr != null && h.arr > i) h.arr = Math.min(h.arr - 1, h.shots.length);
  if (h.ancN != null && h.ancN > i) h.ancN--;
  U.edit = null;
  save();
  render();
  say("消しました（今 " + strokes(h) + "打）。", 3000);
}

/** i打目（0から数える）の番手を直す */
function editClub(i, name) {
  const h = H(R.cur),
    s = h.shots[i],
    c = R.clubs.find((x) => x.name === name);
  if (!s || !c) return;
  s.c = name;
  if (s.r === "add") s.r = "ok"; // 番手なしの1打に、番手を付けた
  if (i === h.shots.length - 1 && s.r === "ok" && !fixPos())
    h.rem = Math.max(0, s.before - eff(c, { lie: s.lie }));
  save();
  render();
  say(strokeNo(h, i) + "打目を" + name + "にしました。", 2500);
}

/** グリーンに乗ったとき：ティーからここまでのショットの数を、d（+1 / -1）だけ直す */
function adjustShots(h, d) {
  if (d > 0) {
    startRound();
    h.shots.push({ c: "-", r: "add", pen: 0, before: rem(R.cur), lie: lieOf(h) });
    h.arr = h.shots.length;
  } else {
    if (!h.shots.length) return;
    h.shots.pop();
    if (h.arr != null && h.arr > h.shots.length) h.arr = h.shots.length;
  }
  save();
  render();
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
  h.arr = h.shots.length;
  U.edit = null;
  save();
  render();
}

/* ---- 前進ティー（OBのあと、特設ティーから打つ取り決め） ---- */

/** 前進ティーを使ったとき、次が何打目になるか（パー3は3、ほかは4） */
function f4T(n) {
  return D[n - 1].p === 3 ? 3 : 4;
}

/** 前進ティーを使える状態か（ティーショットを記録した直後だけ。空振りは数えない） */
function f4Open(n) {
  const h = H(n),
    real = h.shots.filter((x) => x.r !== "miss"),
    last = h.shots[h.shots.length - 1];
  return real.length === 1 && last === real[0] && (last.r === "ok" || last.r === "ob") && !h.green;
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
  const t = f4T(n),
    tee = h.shots.pop(); // ティーショット（番手を押した打）を、前進の記録に置きかえる
  h.rem = tee.before;
  startRound();
  h.shots.push({
    c: tee.c,
    r: "f4",
    pen: Math.max(0, t - 2 - strokes(h)),
    before: rem(n),
    lie: lieOf(h),
    t,
    from: shotFrom(h),
  });
  h.rem = Math.round(v);
  h.lie = "fw";
  h.arr = h.shots.length;
  U.f4 = false;
  save();
  render();
  window.scrollTo(0, 0);
}

/* ---- ホールの移動 ---- */

/** n番へ移る */
function moveTo(n) {
  R.cur = n;
  U.edit = null;
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
