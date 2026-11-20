/*
 * コースの切り替え・追加（貼り付けたコースデータの確かめ）
 */

/** 選べるコースの一覧（最初から入っているコース＋追加したコース） */
function courseList() {
  return COURSES.concat(Object.keys(R.courses || {}).map((k) => R.courses[k]));
}

/** R.course に合わせて、今のコース（CO・D・TN）を入れ替える */
function applyCourse() {
  CO = (R.courses && R.courses[R.course]) || COURSES.find((c) => c.id === R.course) || COURSES[0];
  if (CO === COURSES[0]) R.course = COURSES[0].id;
  const fx = gFix();
  D = CO.holes.map((h, i) => (fx[i + 1] ? Object.assign({}, h, { gc: fx[i + 1] }) : h));
  TN = {};
  CO.tees.forEach((t) => {
    TN[t[0]] = t[1];
  });
  if (!TN[R.tee]) R.tee = CO.base;
  COURSE = CO.name;
  document.title = CO.name + " 攻略";
}

/** 貼り付けられた文字から、画面を壊す記号を取り除く */
function cleanStr(v, max) {
  return String(v == null ? "" : v)
    .replace(/[<>&"'`\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** 緯度・経度として正しい形か */
function okPos(p) {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    typeof p[0] === "number" &&
    typeof p[1] === "number" &&
    Math.abs(p[0]) <= 90 &&
    Math.abs(p[1]) <= 180
  );
}

/** 貼り付けられたコースデータを確かめ、安全な形に直す（だめなら理由つきで止める） */
function parseCourse(txt) {
  let j;
  try {
    j = JSON.parse(txt);
  } catch (e) {
    throw new Error("コースデータとして読めません。クロコが作った文をそのまま貼り付けてください。");
  }
  return cleanCourse(j, "c" + Date.now());
}

/** コースデータ（JSONを読んだもの）を確かめ、知っている項目だけを取り出して安全な形にする */
function cleanCourse(j, id) {
  if (!j || typeof j !== "object") throw new Error("コースデータの形が正しくありません。");
  const name = cleanStr(j.name, 30).replace(/ /g, "");
  if (!name) throw new Error("コース名がありません。");
  if (!Array.isArray(j.holes) || j.holes.length !== 18)
    throw new Error(
      "18ホール分のデータが必要です（今は" + (Array.isArray(j.holes) ? j.holes.length : 0) + "ホール）。",
    );
  const tees = (Array.isArray(j.tees) ? j.tees : [])
    .filter((t) => Array.isArray(t) && /^[a-z0-9]{1,8}$/.test(String(t[0])))
    .slice(0, 5)
    .map((t) => [String(t[0]), cleanStr(t[1], 12) || String(t[0])]);
  if (!tees.length) throw new Error("ティーの一覧（tees）がありません。");
  const base = tees.some((t) => t[0] === j.base) ? j.base : tees[0][0];
  const holes = j.holes.map((h, i) => {
    const p = Number(h && h.p);
    if (!(p >= 3 && p <= 6)) throw new Error(i + 1 + "番のパー（p）が正しくありません。");
    const y = {};
    tees.forEach((t) => {
      const v = Number(h.y && h.y[t[0]]);
      if (v >= 30 && v <= 800) y[t[0]] = Math.round(v);
    });
    if (y[base] == null) throw new Error(i + 1 + "番の" + base + "ティーのヤードがありません。");
    const o = { p, y };
    const hc = Number(h.hc);
    if (hc >= 1 && hc <= 18) o.hc = Math.round(hc);
    if (okPos(h.gc)) o.gc = h.gc;
    if (okPos(h.tc)) o.tc = h.tc;
    const wp = (Array.isArray(h.wp) ? h.wp : []).filter(okPos).slice(0, 3);
    if (wp.length) o.wp = wp;
    const plus = Number(h.plus);
    if (plus >= 1 && plus <= 60) o.plus = Math.round(plus);
    ["club", "risk", "aim", "green"].forEach((k) => {
      const v = cleanStr(h[k], 120);
      if (v) o[k] = v;
    });
    return o;
  });
  const c = {
    id,
    name,
    base,
    tees,
    holes,
    notes: (Array.isArray(j.notes) ? j.notes : [])
      .slice(0, 6)
      .map((x) => cleanStr(x, 60))
      .filter(Boolean),
  };
  if (okPos(j.ch)) c.ch = j.ch;
  const ponds = (Array.isArray(j.ponds) ? j.ponds : [])
    .filter((q) => Array.isArray(q) && okPos(q.slice(0, 2)) && Number(q[2]) >= 3 && Number(q[2]) <= 300)
    .slice(0, 30)
    .map((q) => [q[0], q[1], Math.round(Number(q[2]))]);
  if (ponds.length) c.ponds = ponds;
  if (j.clubTips && typeof j.clubTips === "object") {
    const tips = {};
    Object.keys(j.clubTips)
      .slice(0, 20)
      .forEach((k) => {
        const name2 = cleanStr(k, 6),
          v = cleanStr(j.clubTips[k], 80);
        if (name2 && v) tips[name2] = v;
      });
    if (Object.keys(tips).length) c.clubTips = tips;
  }
  return c;
}

/** 今のコースを、コースデータの文にする（控え・ほかの端末へ渡す用） */
function courseJson() {
  const j = {
    name: CO.name,
    base: CO.base,
    tees: CO.tees,
    notes: CO.notes || [],
    holes: D.map((d) => {
      const o = { p: d.p, hc: d.hc, y: d.y };
      ["gc", "tc", "wp", "plus", "club", "risk", "aim", "green"].forEach((k) => {
        if (d[k] != null) o[k] = d[k];
      });
      return o;
    }),
  };
  ["ch", "ponds", "clubTips"].forEach((k) => {
    if (CO[k] != null) j[k] = CO[k];
  });
  return JSON.stringify(j);
}

/** コースを切り替える。途中の記録はコースごとに残し、戻ると続きから */
function setCourse(id) {
  if (id === CO.id) return true;
  const from = CO.name,
    keep = roundSummary().n > 0;
  R.rounds = R.rounds || {};
  if (keep)
    R.rounds[CO.id] = { holes: R.holes, cur: R.cur, tee: R.tee, rid: R.rid || null, rdate: R.rdate || null };
  else delete R.rounds[CO.id];
  const k = R.rounds[id];
  R.course = id;
  R.holes = k ? k.holes : {};
  R.cur = k ? k.cur : 1;
  R.rid = k ? k.rid : null;
  R.rdate = k ? k.rdate || null : null;
  if (k && k.tee) R.tee = k.tee;
  delete R.rounds[id];
  applyCourse();
  G.y = null;
  G.direct = null;
  U.edit = null;
  save();
  say(
    "「" +
      CO.name +
      "」に切り替えました。" +
      (k ? "途中の記録を戻しました。" : "") +
      (keep ? "「" + from + "」の途中の記録は残してあります。" : ""),
    6000,
  );
  return true;
}

/** グリーン上で登録し直した位置（今のコースの分） */
function gFix() {
  return (R.fix && R.fix[CO.id]) || {};
}
