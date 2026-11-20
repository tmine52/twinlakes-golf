/*
 * 書き出し：結果を送る文、研究用のコピー、記録の控え（書き出し・読み込み）
 */

/* ---- ラウンドの結果を文にする ---- */

/**
 * ラウンド1回分を、送るための文にする（上達道場もこの形を読む）。
 * o = { course, date, tee, t: 合計, n: ホール数, putts, rows: ホールごとの内訳, shots: ショット }
 */
function roundText(o) {
  // 1行目は「コース 日付 ティー アプリ版」。上達道場は、この並びと空白の区切りで読み取る。
  // コース名が空だと読み取れないので、必ず何か入れる。ティー名の中の空白は詰める。
  const L = [
    (String(o.course || "").trim() || "コース名なし") +
      " " +
      o.date +
      " " +
      (String(o.tee || "").replace(/\s+/g, "") || "-") +
      " アプリ" +
      APP_VER,
    "合計 " + o.t + "打（" + o.n + "ホール）パット" + o.putts,
    "",
    "H,Par,打数,ショット,パット,バンカー,空振り,OB池",
  ];
  o.rows.forEach((r) =>
    L.push([r.n, r.p, r.s, r.sh == null ? "" : r.sh, r.pt == null ? "" : r.pt, r.bk, r.ms, r.ob].join(",")),
  );
  L.push("", "[ショット]", "ホール,番手,結果,残り,球の場所,方向,当たり,実測Y");
  o.shots.forEach((s) =>
    L.push(
      [
        s.h,
        s.c,
        resLabel(s),
        s.before,
        LIE[s.lie || "fw"],
        DIR[s.dir] || "",
        HIT[s.hit] || "",
        s.dist || "",
      ].join(","),
    ),
  );
  return L.join("\n");
}

/** 今のラウンドを roundText に渡す形にする */
function currentRound() {
  const m = roundSummary();
  return {
    course: COURSE,
    date: roundDate(),
    tee: TN[R.tee],
    t: m.t,
    n: m.n,
    putts: m.a.putts,
    rows: roundRows(),
    shots: curShots(),
  };
}

/**
 * 履歴の1件を roundText に渡す形にする。
 * 前の版で保存した履歴にはホールごとの内訳（rows）が無いので、打数とコースのパーから作る
 * （パットの内訳は分からないので空になる）。
 */
function histRound(x) {
  const course = histCourse(x),
    c = courseList().find((k) => k.name === course),
    tee = c && c.tees.find((t) => t[0] === x.tee);
  let rows = x.rows;
  if (!rows) {
    rows = [];
    (x.holes || []).forEach((v, i) => {
      if (v == null) return;
      const sh = (x.shots || []).filter((s) => s.h === i + 1);
      rows.push({
        n: i + 1,
        p: c ? c.holes[i].p : 4,
        s: v,
        sh: null,
        pt: null,
        bk: sh.filter((s) => s.lie === "bunker").length,
        ms: 0,
        ob: sh.filter((s) => s.r === "ob" || s.r === "f4").length,
      });
    });
  }
  return {
    course,
    date: x.date,
    tee: x.teeName || (tee ? tee[1] : x.tee || "-"),
    t: x.t,
    n: x.n,
    putts: x.a.putts,
    rows,
    shots: x.shots || [],
  };
}

/** 今のラウンドの結果を、送るための文にする */
function resultText() {
  return roundText(currentRound());
}

/** 全ショット（今回＋履歴）を、表計算に貼れる形（CSV）にする */
function shotCsv() {
  const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  return ["日付,ホール,番手,結果,残り,球の場所,方向,当たり,実測Y"]
    .concat(
      allShots().map((s) =>
        [
          s.date,
          s.h,
          s.c,
          resLabel(s),
          s.before,
          LIE[s.lie || "fw"],
          DIR[s.dir] || "",
          HIT[s.hit] || "",
          s.dist || "",
        ]
          .map(q)
          .join(","),
      ),
    )
    .join("\n");
}

/** 結果をコピーする */
async function copyResult() {
  const t = resultText();
  try {
    await navigator.clipboard.writeText(t);
    say("コピーしました。チャットに貼り付けて送れます。", 3000);
  } catch (e) {
    U.rtext = true;
    render();
    say("下の枠を長押ししてコピーしてください。", 3500);
  }
}

/** 文をファイルにして、スマホの「共有」で送る。共有が使えなければ false を返す */
async function shareFile(title, text, name) {
  const f = new File([text], name, { type: "text/plain" });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    await navigator.share({ title, files: [f] });
    return true;
  }
  if (navigator.share) {
    await navigator.share({ title, text });
    return true;
  }
  return false;
}

/** 結果を、スマホの「共有」で送る */
async function shareResult() {
  try {
    if (!(await shareFile(COURSE + "の結果", resultText(), "golf_" + roundDate() + ".txt"))) copyResult();
  } catch (e) {
    if (e && e.name === "AbortError") return; // 共有の画面を閉じただけ
    copyResult();
  }
}

/* ---- 記録の控え（機種変更や、閲覧データを消してしまったときのため） ---- */

const BACKUP_APP = "golf-kouryaku"; // 控えの目印

/** 今の記録すべてを、控えの文にする */
function backupText() {
  return JSON.stringify({
    app: BACKUP_APP,
    fmt: 1,
    ver: APP_VER,
    at: new Date().toISOString(),
    data: {
      clubs: R.clubs,
      hist: R.hist || [],
      courses: R.courses || {},
      fix: R.fix || {},
      rounds: R.rounds || {},
      course: R.course,
      tee: R.tee,
      cur: R.cur,
      holes: R.holes,
      rid: R.rid || null,
      rdate: R.rdate || null,
    },
  });
}

/** 控えをコピーする */
async function copyBackup() {
  try {
    await navigator.clipboard.writeText(backupText());
    R.bkAt = ymd();
    save();
    render();
    say("控えをコピーしました。メモやメールに貼り付けて保存してください。", 5000);
  } catch (e) {
    U.bkShow = true;
    render();
    say("下の枠を長押ししてコピーしてください。", 4000);
  }
}

/** 控えをファイルにして、共有（使えなければダウンロード）で保存する */
async function saveBackupFile() {
  const t = backupText(),
    name = "golf-kouryaku-backup-" + ymd() + ".txt";
  try {
    if (!(await shareFile(APP_NAME + "の控え", t, name))) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([t], { type: "text/plain" }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
    copyBackup();
    return;
  }
  R.bkAt = ymd();
  save();
  render();
  say("控えを書き出しました。", 3000);
}

/* 控えを読み込むときは、中身を信用せず、知っている項目だけを決まった形で取り出す。 */

/** 数として正しく、lo〜hi に入っていれば丸めた整数、そうでなければ null */
function cleanInt(v, lo, hi) {
  if (v === null || v === "" || typeof v === "boolean" || Array.isArray(v)) return null;
  const n = Number(v);
  return n >= lo && n <= hi ? Math.round(n) : null;
}

/** 決まった言葉（obj のキー）のどれかなら、そのまま返す。そうでなければ null */
function cleanKey(v, obj) {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(obj, v) ? v : null;
}

/** 日付（YYYY-MM-DD）ならそのまま、そうでなければ null */
function cleanDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** 1打の記録を確かめる（withHole: 履歴の中のショットはホール番号 h を持つ） */
function cleanShot(s, withHole) {
  if (!s || typeof s !== "object" || !/^(ok|short|ob|miss|f4|add)$/.test(s.r)) return null;
  const o = {
    c: cleanStr(s.c, 6) || "-",
    r: s.r,
    pen: cleanInt(s.pen, 0, 9) || 0,
    before: cleanInt(s.before, 0, 900) || 0,
    lie: cleanKey(s.lie, LIE) || "fw",
  };
  if (withHole) {
    o.h = cleanInt(s.h, 1, 18);
    if (!o.h) return null;
  }
  if (okPos(s.from)) o.from = s.from;
  if (okPos(s.to)) o.to = s.to;
  const dist = cleanInt(s.dist, 1, 500),
    dir = cleanKey(s.dir, DIR),
    hit = cleanKey(s.hit, HIT);
  if (dist) o.dist = dist;
  if (dir) o.dir = dir;
  if (hit) o.hit = hit;
  if (s.r === "f4") o.t = cleanInt(s.t, 3, 4) || 4;
  if (s.r === "ob" && OB_KIND[s.k]) o.k = s.k; // OB・池・ロストの別（v30 から）
  return o;
}

/** 18ホール分の記録を確かめる */
function cleanHoles(src) {
  const out = {};
  if (!src || typeof src !== "object") return out;
  for (let n = 1; n <= 18; n++) {
    const h = src[n];
    if (!h || typeof h !== "object") continue;
    const o = {
      shots: (Array.isArray(h.shots) ? h.shots : [])
        .slice(0, 60)
        .map((s) => cleanShot(s))
        .filter(Boolean),
      rem: cleanInt(h.rem, 0, 900),
      putts: cleanInt(h.putts, 0, 30) || 0,
      green: h.green === true,
    };
    const lie = cleanKey(h.lie, LIE),
      quick = cleanInt(h.quick, 1, 40),
      qWas = cleanInt(h.qWas, 0, 30),
      arr = cleanInt(h.arr, 0, 60);
    if (lie) o.lie = lie;
    if (quick != null) o.quick = quick;
    if (quick != null && qWas != null) o.qWas = qWas;
    if (arr != null) o.arr = arr;
    if (okPos(h.anc)) {
      o.anc = h.anc;
      o.ancN = cleanInt(h.ancN, 0, 60) || 0;
      const ar = cleanInt(h.ancRem, 0, 900);
      if (ar != null) o.ancRem = ar;
    }
    out[n] = o;
  }
  return out;
}

/** 履歴の1件を確かめる */
function cleanHist(x) {
  if (!x || typeof x !== "object") return null;
  const id = cleanStr(x.id, 24),
    date = cleanDate(x.date),
    a = x.a && typeof x.a === "object" ? x.a : {};
  if (!id || !date) return null;
  const o = {
    id,
    date,
    tee: cleanStr(x.tee, 8),
    course: cleanStr(x.course, 30),
    n: cleanInt(x.n, 0, 18) || 0,
    t: cleanInt(x.t, 0, 999) || 0,
    o: cleanInt(x.o, 0, 999) || 0,
    i: cleanInt(x.i, 0, 999) || 0,
    p: cleanInt(x.p, 0, 120) || 0,
    a: {
      bunker: cleanInt(a.bunker, 0, 999) || 0,
      miss: cleanInt(a.miss, 0, 999) || 0,
      ob: cleanInt(a.ob, 0, 999) || 0,
      putts: cleanInt(a.putts, 0, 999) || 0,
    },
    holes: (Array.isArray(x.holes) ? x.holes : []).slice(0, 18).map((v) => cleanInt(v, 1, 99)),
    shots: (Array.isArray(x.shots) ? x.shots : [])
      .slice(0, 400)
      .map((s) => cleanShot(s, true))
      .filter(Boolean),
  };
  const teeName = cleanStr(x.teeName, 12),
    at = cleanInt(x.at, 1, 1e14);
  if (teeName) o.teeName = teeName;
  if (at) o.at = at;
  if (Array.isArray(x.rows))
    o.rows = x.rows
      .slice(0, 18)
      .map((r) => {
        const n = r && typeof r === "object" ? cleanInt(r.n, 1, 18) : null,
          s = n ? cleanInt(r.s, 1, 99) : null;
        if (!n || !s) return null;
        return {
          n,
          p: cleanInt(r.p, 3, 6) || 4,
          s,
          sh: cleanInt(r.sh, 0, 99),
          pt: cleanInt(r.pt, 0, 30),
          bk: cleanInt(r.bk, 0, 99) || 0,
          ms: cleanInt(r.ms, 0, 99) || 0,
          ob: cleanInt(r.ob, 0, 99) || 0,
        };
      })
      .filter(Boolean);
  return o;
}

/** 途中のラウンド1つ分（今のラウンド／コースごとに残した分）を確かめる */
function cleanRound(x) {
  if (!x || typeof x !== "object") return null;
  return {
    holes: cleanHoles(x.holes),
    cur: cleanInt(x.cur, 1, 18) || 1,
    tee: typeof x.tee === "string" && /^[a-z0-9]{1,8}$/.test(x.tee) ? x.tee : null,
    rid: x.rid ? cleanStr(x.rid, 24) || null : null,
    rdate: cleanDate(x.rdate),
  };
}

/** 控えの文を読み、確かめた中身を返す（控えでなければ、理由つきで止める） */
function readBackup(txt) {
  let j;
  try {
    j = JSON.parse(txt);
  } catch (e) {
    throw new Error("控えとして読めません。「控えをコピー」で取った文を、そのまま貼り付けてください。");
  }
  if (!j || j.app !== BACKUP_APP || !j.data || typeof j.data !== "object")
    throw new Error("このアプリの控えではありません。");
  const d = j.data,
    isId = (k) => /^[a-z0-9]{1,24}$/.test(k),
    o = { at: cleanStr(j.at, 30).slice(0, 10), clubs: [], courses: {}, fix: {}, rounds: {} };
  const seen = {},
    rawClubs = Array.isArray(d.clubs) ? d.clubs.slice(0, 20) : [];
  rawClubs.forEach((c) => {
    const name = c && cleanStr(c.name, 6),
      dist = c && cleanInt(c.dist, 1, 350);
    if (name && dist && !seen[name]) {
      seen[name] = 1;
      o.clubs.push({ name, dist });
    }
  });
  // 読み取れない行が1つでもあったら、番手は入れ替えない（こわれた控えで、番手が減ってしまうのを防ぐ）
  o.clubsBad = o.clubs.length !== rawClubs.length;
  o.hist = (Array.isArray(d.hist) ? d.hist : []).slice(0, 300).map(cleanHist).filter(Boolean);
  if (d.courses && typeof d.courses === "object")
    Object.keys(d.courses)
      .filter((k) => /^c\d{1,16}$/.test(k))
      .slice(0, 30)
      .forEach((k) => {
        try {
          o.courses[k] = cleanCourse(d.courses[k], k);
        } catch (e) {} // 形のおかしいコースは読み飛ばす
      });
  if (d.fix && typeof d.fix === "object")
    Object.keys(d.fix)
      .filter(isId)
      .forEach((k) => {
        const f = d.fix[k],
          g = {};
        if (f && typeof f === "object") for (let n = 1; n <= 18; n++) if (okPos(f[n])) g[n] = f[n];
        if (Object.keys(g).length) o.fix[k] = g;
      });
  if (d.rounds && typeof d.rounds === "object")
    Object.keys(d.rounds)
      .filter(isId)
      .forEach((k) => {
        const r = cleanRound(d.rounds[k]);
        if (r && Object.keys(r.holes).length) o.rounds[k] = r;
      });
  o.cur = cleanRound(d);
  o.course = typeof d.course === "string" && isId(d.course) ? d.course : null;
  return o;
}

/** 控えの中身を、ひとことで説明する */
function backupSummary(o) {
  return (
    "控え（" +
    (o.at || "日付不明") +
    "）：履歴" +
    o.hist.length +
    "件・番手" +
    (o.clubsBad ? "は読み取れない行があるので変えません" : o.clubs.length + "本") +
    "・追加したコース" +
    Object.keys(o.courses).length +
    "件"
  );
}

/**
 * 確かめた控えを、今の記録に合わせる。
 *   履歴：合わせる。控えにもこの端末にもある同じラウンドは、新しく保存したほうを残す
 *         （保存した時刻が分からない古い記録は、ホール数の多いほう。同じなら控え）。控えに無いものは残す
 *   番手の距離：控えの内容にする（読み取れない行があったら、変えない）
 *   追加したコース・グリーンの登録：控えの分を足す（同じものは控えの内容）
 *   途中のラウンド：この端末に記録が無いコースの分だけ、控えから戻す
 */
function applyBackup(o) {
  const known = (id) => COURSES.some((c) => c.id === id) || !!(R.courses && R.courses[id]);
  if (o.clubs.length && !o.clubsBad) R.clubs = o.clubs;
  R.courses = Object.assign(R.courses || {}, o.courses);
  R.fix = R.fix || {};
  Object.keys(o.fix).forEach((k) => {
    R.fix[k] = Object.assign(R.fix[k] || {}, o.fix[k]);
  });
  const mine = {},
    ids = {};
  (R.hist || []).forEach((x) => (mine[x.id] = x));
  o.hist.forEach((x) => (ids[x.id] = 1));
  // 同じラウンドで、控え b より端末の記録 m のほうを残すか
  const keepMine = (b, m) => (b.at && m.at ? m.at > b.at : m.n > b.n);
  R.hist = o.hist
    .map((b) => (mine[b.id] && keepMine(b, mine[b.id]) ? mine[b.id] : b))
    .concat((R.hist || []).filter((x) => !ids[x.id]))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
  // 途中のラウンド：控えの「今のラウンド」も、コースごとに残した記録の1つとして扱う
  const hasRound = (r) => r && Object.keys(r.holes).some((n) => touched(r.holes[n]));
  const cand = Object.assign({}, o.rounds);
  if (o.course && hasRound(o.cur)) cand[o.course] = o.cur;
  R.rounds = R.rounds || {};
  Object.keys(cand).forEach((k) => {
    if (!known(k) || !hasRound(cand[k])) return;
    if (k === R.course) {
      if (roundSummary().n) return; // この端末に記録があるコースは、端末の記録を残す
      R.holes = cand[k].holes;
      R.cur = cand[k].cur;
      R.rid = cand[k].rid;
      R.rdate = cand[k].rdate;
      if (cand[k].tee) R.tee = cand[k].tee;
    } else if (!R.rounds[k]) R.rounds[k] = cand[k];
  });
  // この端末のラウンドが空で、控えが別のコースの途中だったら、そのコースを開く
  if (!roundSummary().n && o.course && o.course !== R.course && known(o.course) && R.rounds[o.course])
    setCourse(o.course);
  applyCourse();
  save();
}
