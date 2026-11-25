/*
 * 画面の描き直し、ボタンの処理、起動
 *
 * ボタンには data-◯◯ という目印を付けてある（例：<button data-club="7I">）。
 * 押されたら、下の ON_CLICK から同じ名前の処理を探して動かす。
 */

/* ---- 画面の描き直し ---- */

const VIEWS = { hole: holeView, score: scoreView, advice: adviceView, clubs: clubsView, coach: coachView };

/** 今の画面を描き直す */
function render() {
  // お試しモード：ホールやコースが変わったら、立つ場所をそのホールのティーに置き直す
  if (DEMO && R.gps && SIM.n !== R.cur + "/" + CO.id) simSet(null);
  VIEWS[U.view]();
  if (U.view === "hole") app.insertAdjacentHTML("afterbegin", courseBar());
  if (DEMO) app.insertAdjacentHTML("afterbegin", demoBar());
  app.insertAdjacentHTML("beforeend", verLine());
  scoreBar();
  document
    .querySelectorAll(".tabbar button")
    .forEach((b) => b.setAttribute("aria-current", b.dataset.view === U.view));
}

/** 全画面のいちばん下に出す、アプリの名前・版・日付 */
function verLine() {
  return (
    '<p class="note" id="verline" style="text-align:center">' +
    esc(APP_NAME + " " + APP_VER + "（" + APP_DATE + "）" + (DEMO ? "・お試しモード中" : "")) +
    "</p>"
  );
}

/** 画面の上に付く帯（合計打数と今のホールの打数。押すとスコア画面） */
function scoreBar() {
  let b = document.getElementById("scorebar");
  if (!b) {
    b = document.createElement("button");
    b.id = "scorebar";
    b.dataset.view = "score";
    b.setAttribute("aria-label", "スコアを開く");
    b.style.cssText =
      "position:sticky;top:0;z-index:6;display:block;width:100%;margin:8px 0;padding:6px 12px;text-align:left;background:var(--surface);color:var(--fg);border:1px solid var(--line);border-radius:6px;font:inherit;box-shadow:0 2px 6px rgba(0,0,0,.08)";
    app.parentNode.insertBefore(b, app);
  }
  let total = 0,
    otherPar = 0, // 今のホール以外の、パーの合計
    otherStrokes = 0; // 今のホール以外の、打数の合計
  const a = { bunker: 0, miss: 0, ob: 0, putts: 0 };
  D.forEach((d, i) => {
    const h = R.holes[i + 1];
    if (!h || !touched(h)) return;
    total += strokes(h);
    if (i + 1 !== R.cur) {
      otherPar += d.p;
      otherStrokes += strokes(h);
    }
    const s = stat(h);
    Object.keys(a).forEach((k) => (a[k] += s[k]));
  });
  const over = otherStrokes - otherPar;
  b.innerHTML =
    '<div style="display:flex;justify-content:space-between;gap:8px;font-weight:700;font-size:16px"><span>合計 ' +
    total +
    "打" +
    (otherPar ? "（他ホール " + (over > 0 ? "+" : "") + over + "）" : "") +
    "</span><span>" +
    R.cur +
    "番 " +
    strokes(H(R.cur)) +
    '打</span></div><div style="font-size:13px;color:var(--muted)">パット' +
    a.putts +
    "・バンカー" +
    a.bunker +
    "・空振り" +
    a.miss +
    "・OB池" +
    a.ob +
    '<span style="float:right">' +
    APP_VER +
    "</span></div>";
}

/* ---- ボタンの処理 ---- */

/** 今の1打の感触（k: dir＝方向 / hit＝当たり）を付ける。同じものをもう一度押すと取り消す */
function setFeel(k, v) {
  const h = H(R.cur),
    s = h.shots[h.shots.length - 1];
  if (!s) return;
  if (s[k] === v) delete s[k];
  else s[k] = v;
  save();
  render();
}

/** data-act="◯◯" のボタンの処理（h: 今のホールの記録） */
const ACT = {
  gps() {
    R.gps = !R.gps;
    R.gps ? gpsOn() : gpsOff();
    save();
    render();
  },
  green(h) {
    arrive(h); // 最後の打の止まった場所（＝グリーン）を記録する
    h.green = true;
    U.edit = null;
    save();
    render();
    window.scrollTo(0, 0);
  },
  ungreen(h) {
    h.green = false;
    save();
    render();
  },
  fix(h) {
    const f = document.getElementById("fix"),
      v = Number(f.value);
    if (f.value === "" || !(v >= 0 && v <= 700)) {
      say("0から700までの数字を入力してください。", 3000);
      return;
    }
    h.rem = Math.round(v);
    save();
    render();
    say("残り" + Math.round(v) + "Yに直しました。", 2500);
  },
  reset() {
    if (!U.arm) {
      U.arm = true; // 1回目は確かめるだけ
      render();
      return;
    }
    U.arm = false;
    newRound();
    save();
    render();
    say("記録を消しました。", 2500);
  },
};

/**
 * 2回押しの確認（1回目で「もう一度押すと…」と出す操作）を、全部解く。
 * 画面を移ったあとまで確認の状態が残っていると、戻ってきて1回押しただけで消えてしまうため。
 */
function disarm() {
  U.arm = U.hnew = U.hslim = U.cdel = U.bkArm = false;
  U.hdel = null;
  U.edit = null; // 直している打
}

/** 押されたボタンごとの処理。名前は data-◯◯ の ◯◯。a はボタンに付けた目印の一覧 */
const ON_CLICK = {
  /* 画面の切り替え */
  view(a) {
    U.view = a.view;
    disarm();
    render();
    window.scrollTo(0, 0);
  },
  coach(a) {
    U.coach = a.coach;
    render();
    window.scrollTo(0, 0);
  },
  adv(a) {
    U.adv = a.adv;
    render();
    window.scrollTo(0, 0);
  },
  mapv(a) {
    U.mapv = a.mapv;
    render();
  },
  pic(a) {
    U.pic = a.pic;
    render();
  },
  picgo(a) {
    picStep(Number(a.picgo));
  },

  /* ホールの移動 */
  go(a) {
    const dir = Number(a.go);
    // 記録が途中に見えるホールから先へ進むときは、1回だけ止めて知らせる
    if (dir > 0 && unfinished(R.cur) && U.goArm !== R.cur) {
      U.goArm = R.cur;
      say(
        R.cur +
          "番の記録が途中のようです（今 " +
          strokes(H(R.cur)) +
          "打）。合っていれば、もう一度押すと進みます。",
        6000,
      );
      return;
    }
    U.goArm = null;
    moveTo(Math.min(18, Math.max(1, R.cur + dir)));
  },
  hole(a) {
    U.view = "hole";
    disarm();
    moveTo(Number(a.hole));
  },

  /* 1打の記録（◀ ▶ で何打目かを選ぶ → 番手 → 到着。OB・池・ロスト・空振りは結果のボタン） */
  club(a) {
    U.f4 = false;
    clubTap(a.club);
  },
  res(a) {
    U.f4 = false;
    setResult(slotOf(H(R.cur)), a.res);
  },
  arrive() {
    const h = H(R.cur),
      i = h.shots.length - 1,
      s = h.shots[i];
    arrive(h);
    U.edit = null;
    save();
    render();
    say(
      strokeNo(h, i) +
        "打目 到着" +
        (s && s.dist
          ? "：" + s.c + " " + s.dist + "Y（実測）"
          : fixPos()
            ? "（距離は測れませんでした）"
            : "（GPSがオフなので距離は測っていません）") +
        "。次は " +
        strokeNo(h, h.shots.length) +
        "打目です。",
      3500,
    );
  },
  sk(a) {
    // ◀ ▶：何打目を入力するかを選ぶ
    const h = H(R.cur),
      i = slotOf(h),
      d = Number(a.sk);
    U.f4 = false;
    if (d < 0) U.edit = Math.max(0, i - 1);
    else if (i >= h.shots.length) return;
    else if (h.shots[i] === openShot(h)) {
      arrive(h); // 到着を押さずに次へ：今いる場所を到着にする
      U.edit = null;
    } else U.edit = i + 1;
    save();
    render();
    const c = document.getElementById("strokecard");
    if (c) c.scrollIntoView({ block: "start" });
  },
  ed(a) {
    // 記録した打の一覧で押した打へ移る
    U.edit = Number(a.ed);
    U.f4 = false;
    render();
    const c = document.getElementById("strokecard");
    if (c) c.scrollIntoView({ block: "start" });
  },
  edend() {
    U.edit = null;
    render();
  },
  del() {
    const h = H(R.cur),
      i = slotOf(h);
    if (h.shots[i]) delShot(i);
  },
  gs(a) {
    adjustShots(H(R.cur), Number(a.gs));
  },
  add() {
    addStroke();
    say("番手なしで1打足しました（今 " + strokes(H(R.cur)) + "打）。", 3000);
  },
  f4() {
    U.f4 = !U.f4;
    render();
  },
  f4go() {
    f4Go();
  },
  fd(a) {
    setFeel("dir", a.fd);
  },
  fh(a) {
    setFeel("hit", a.fh);
  },
  lie(a) {
    // 球の場所を押す（まだ到着を押していなければ、到着の合図も兼ねる）
    arrive(H(R.cur), a.lie);
    save();
    render();
  },
  putt(a) {
    const h = H(R.cur);
    startRound();
    h.putts = Math.max(0, h.putts + Number(a.putt));
    save();
    render();
  },

  /* かんたん入力（合計打数と、うちパット） */
  simple(a) {
    R.simple = a.simple === "1";
    save();
    render();
  },
  q(a) {
    const h = H(R.cur),
      d = D[R.cur - 1],
      v = h.quick != null ? h.quick : strokes(h),
      q = Number(a.q);
    startRound();
    if (h.quick == null) h.qWas = h.putts; // かんたん入力を始める前のパット数を覚えておく（「入力を消す」で戻す）
    h.quick = Math.max(1, v ? v + q : q > 0 ? d.p : d.p - 1); // 未入力なら最初の＋でパー
    if (h.putts > h.quick - 1) h.putts = h.quick - 1; // パットは合計より少なく
    save();
    render();
  },
  qp(a) {
    const h = H(R.cur);
    if (h.quick == null) {
      say("先に合計打数を入れてください。", 3000);
      return;
    }
    h.putts = Math.max(0, Math.min(h.quick - 1, h.putts + Number(a.qp)));
    h.qp = true; // かんたん入力でパットを入れた印
    save();
    render();
  },
  qclear() {
    // かんたん入力を消して、1打ごとの記録に戻す。パット数も、かんたん入力を始める前の数に戻す
    const h = H(R.cur);
    delete h.quick;
    if (h.qWas != null) h.putts = h.qWas;
    else if (h.qp) h.putts = 0; // 前の版で入れたかんたん入力（始める前の数を覚えていない）
    delete h.qWas;
    delete h.qp;
    save();
    render();
  },

  /* グリーンの位置の登録 */
  gfix() {
    const p = fixPos();
    if (!p) {
      say("GPSをオンにして、現在地が取れてから押してください。", 5000);
      return;
    }
    const n = R.cur,
      old = D[n - 1].gc,
      moved = old ? yardsTo(old, p) : null;
    if (moved != null && moved > 150) {
      say("今の位置は登録済みのグリーンから" + moved + "Y離れています。グリーン上で押してください。", 6000);
      return;
    }
    R.fix = R.fix || {};
    R.fix[CO.id] = R.fix[CO.id] || {};
    R.fix[CO.id][n] = [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
    applyCourse();
    save();
    render();
    say(n + "番のグリーンを登録しました" + (moved != null ? "（" + moved + "Y移動）" : "") + "。", 5000);
  },
  gunfix() {
    const n = R.cur;
    if (R.fix && R.fix[CO.id]) delete R.fix[CO.id][n];
    applyCourse();
    save();
    render();
    say(n + "番のグリーンを元の位置に戻しました。", 4000);
  },

  /* スコア画面 */
  async rcopy() {
    await copyResult();
  },
  async rshare() {
    await shareResult();
  },
  async csv() {
    U.csv = true;
    render();
    const t = document.getElementById("csvbox");
    if (!t) return;
    t.focus();
    t.select();
    try {
      await navigator.clipboard.writeText(t.value);
      say("コピーしました。", 2500);
    } catch (er) {
      say("長押しでコピーしてください。", 3000);
    }
  },
  hsave() {
    saveRound();
  },
  hnew() {
    if (!U.hnew) {
      U.hnew = true; // 1回目は確かめるだけ
      render();
      return;
    }
    U.hnew = false;
    newRound();
    save();
    U.view = "hole";
    render();
    window.scrollTo(0, 0);
    say("新しいラウンドを始めました。", 2500);
  },
  hdel(a) {
    if (U.hdel !== a.hdel) {
      U.hdel = a.hdel; // 1回目は確かめるだけ
      render();
      return;
    }
    U.hdel = null;
    R.hist = (R.hist || []).filter((x) => x.id !== a.hdel);
    if (R.rid === a.hdel) R.rid = null;
    save();
    render();
  },
  hslim() {
    if (!U.hslim) {
      U.hslim = true; // 1回目は確かめるだけ
      render();
      return;
    }
    U.hslim = false;
    const n = slimOld();
    save();
    render();
    say(n + "回分の1打ごとの記録を消しました。", 4000);
  },

  /* 「番手の距離」画面 */
  tee(a) {
    R.tee = a.tee;
    save();
    render();
  },
  gm(a) {
    // 用語：覚える／一覧・さがす
    U.gm = a.gm;
    U.gshow = false;
    render();
  },
  gshow() {
    U.gshow = true;
    render();
  },
  gknow(a) {
    // 覚える：「覚えた」「まだ」を押して次の用語へ
    if (a.gknow === "1") R.gl[U.gc] = 1;
    else delete R.gl[U.gc];
    save();
    U.gc = glNext(U.gc);
    U.gshow = false;
    render();
  },
  gmark(a) {
    // 一覧：覚えた／まだ を切り替える（画面は作り直さず、ボタンだけ変える）
    const t = a.gmark,
      on = !R.gl[t];
    if (on) R.gl[t] = 1;
    else delete R.gl[t];
    save();
    const b = [...document.querySelectorAll("[data-gmark]")].find((x) => x.dataset.gmark === t);
    if (b) {
      b.className = on ? "act" : "ghost";
      b.textContent = on ? "覚えた" : "まだ";
      b.setAttribute("aria-pressed", on);
    }
  },
  swing(a) {
    R.swing = a.swing;
    save();
    render();
    say("番手の勧めを、" + SWING[a.swing] + "スイングの距離にしました。", 2500);
  },
  prop(a) {
    const p = distProposals().find((x) => x.name === a.prop),
      c = R.clubs.find((x) => x.name === a.prop);
    if (!p || !c) return;
    c.dist = p.to;
    save();
    render();
    say(c.name + "を" + p.to + "Yにしました（前は" + p.from + "Y）。", 4000);
  },
  cadd() {
    try {
      const c = parseCourse(document.getElementById("cjson").value);
      R.courses = R.courses || {};
      R.courses[c.id] = c;
      save();
      setCourse(c.id);
      say("「" + c.name + "」を追加して切り替えました。", 4000);
      render();
    } catch (er) {
      say(er.message, 7000);
    }
  },
  async ccopy() {
    const t = courseJson();
    try {
      await navigator.clipboard.writeText(t);
      say("今のコースのデータをコピーしました。", 3000);
    } catch (er) {
      document.getElementById("cjson").value = t;
      say("枠に表示しました。長押しでコピーしてください。", 4000);
    }
  },
  cdel() {
    if (COURSES.indexOf(CO) >= 0) return; // 最初から入っているコースは消せない
    if (roundSummary().n) {
      say("記録中のラウンドがあります。先に履歴へ保存して、新しいラウンドを始めてください。", 6000);
      return;
    }
    if (!U.cdel) {
      U.cdel = true; // 1回目は確かめるだけ
      render();
      return;
    }
    U.cdel = false;
    const gone = CO.id;
    setCourse(COURSES[0].id);
    delete R.courses[gone];
    save();
    render();
    say("コースを消しました。", 3000);
  },
  async bk(a) {
    if (DEMO) {
      say("お試しモード中は、控えの書き出し・読み込みはできません。", 4000);
      return;
    }
    if (a.bk === "copy") await copyBackup();
    else if (a.bk === "file") await saveBackupFile();
    else loadBackup();
  },
  unlock() {
    unlock(document.getElementById("imgpw").value);
  },

  /* お試しモード */
  demo(a) {
    if (a.demo === "on") {
      // 今の記録をコピーして、ラウンドだけ空にしたものを、お試し用の保存場所に置く
      try {
        save();
        const c = JSON.parse(JSON.stringify(R));
        c.holes = {};
        c.cur = 1;
        c.rid = null;
        c.rdate = null;
        c.rounds = {};
        c.gps = true;
        localStorage.setItem(KEY + "-demo", JSON.stringify(c));
        localStorage.setItem(KEY + "-mode", "demo");
        location.reload();
      } catch (er) {
        say("お試しモードを始められません（この端末に保存できません）。", 5000);
      }
      return;
    }
    try {
      localStorage.removeItem(KEY + "-mode");
      localStorage.removeItem(KEY + "-demo");
    } catch (er) {}
    location.reload();
  },
  sim(a) {
    const path = holePath(D[R.cur - 1]);
    if (!path) {
      say("このホールは座標がないため、位置を動かせません。", 4000);
      return;
    }
    const L = pathMeters(path) / YARD, // ティーからグリーンまでの道のり
      cur = SIM.r == null ? L : SIM.r;
    simSet(a.sim === "tee" ? L : a.sim === "fwd" ? Math.max(0, cur - 50) : a.sim === "near" ? 30 : 0);
    render();
    say("立つ場所：グリーン中央まで " + G.y + "Y", 2500);
  },

  /* そのほか（GPS・1打戻す・グリーンに乗った・残りの手入力・記録を消す） */
  act(a) {
    if (ACT[a.act]) ACT[a.act](H(R.cur));
  },
};

/** 貼り付けた控えを読み込む（1回目は中身を確かめて知らせるだけ。2回目で読み込む） */
function loadBackup() {
  const box = document.getElementById("bktext"),
    t = ((box && box.value) || "").trim();
  U.bkText = t;
  if (!t) {
    say("控えの文を貼り付けるか、ファイルを選んでください。", 4000);
    return;
  }
  let o;
  try {
    o = readBackup(t);
  } catch (er) {
    U.bkArm = false;
    U.bkInfo = er.message;
    render();
    say(er.message, 6000);
    return;
  }
  if (!U.bkArm) {
    U.bkArm = true;
    U.bkInfo = backupSummary(o) + "。もう一度押すと読み込みます。";
    render();
    return;
  }
  U.bkArm = false;
  applyBackup(o);
  U.bkText = "";
  U.bkInfo = "読み込みました。" + backupSummary(o);
  render();
  say("控えを読み込みました。", 4000);
}

document.addEventListener("click", async (e) => {
  // お試しモード：ホール図をタップした場所に立つ
  const svg = e.target.closest && e.target.closest("svg[data-hm]");
  if (svg && DEMO && R.gps) {
    simFree(holeMapPos(svg, e.clientX, e.clientY));
    render();
    say("立つ場所：グリーン中央まで " + G.y + "Y", 2500);
    return;
  }
  const b = e.target.closest("button,tr[data-hole]");
  if (!b) return;
  const a = b.dataset,
    name = Object.keys(ON_CLICK).find((k) => a[k] != null);
  if (name) await ON_CLICK[name](a);
});

/*
 * 図のフリック：図（data-swipe）の上で指1本を左右に50px以上払うと、前後のホールの図にする。
 * 左へ払う＝次のホール、右へ払う＝前のホール。縦のスクロールや2本指の拡大は、そのまま。
 */
let swipe0 = null;
document.addEventListener(
  "touchstart",
  (e) => {
    const t = e.target.closest && e.target.closest("[data-swipe]");
    swipe0 =
      t && e.touches.length === 1
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() }
        : null;
  },
  { passive: true },
);
document.addEventListener(
  "touchend",
  (e) => {
    if (!swipe0) return;
    const c = e.changedTouches[0],
      dx = c.clientX - swipe0.x,
      dy = c.clientY - swipe0.y,
      ok = Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - swipe0.at < 800;
    swipe0 = null;
    if (ok) picStep(dx < 0 ? 1 : -1);
  },
  { passive: true },
);
document.addEventListener("touchcancel", () => (swipe0 = null), { passive: true });

// 用語をさがす欄：1文字ごとに、その場で絞り込む
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.gq != null) {
    U.gq = t.value;
    glFilter();
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "pick") {
    moveTo(Number(t.value));
    return;
  }
  if (t.id === "csel" || t.id === "csel2") {
    setCourse(t.value);
    U.cdel = false;
    render();
    return;
  }
  if (t.id === "hsel") {
    U.hcourse = t.value;
    render();
    return;
  }
  if (t.id === "bkfile") {
    // 控えのファイルを選んだ：中身を貼り付け欄に入れる（読み込みは、ボタンを押してから）
    const f = t.files && t.files[0];
    if (!f) return;
    if (f.size > 3000000) {
      say("ファイルが大きすぎます。控えのファイルを選んでください。", 5000);
      return;
    }
    f.text().then((txt) => {
      U.bkText = txt;
      U.bkArm = false;
      U.bkInfo = "ファイルを読みました。「控えを読み込む」を押してください。";
      render();
    });
    return;
  }
  // 用語の分類
  if (t.dataset && t.dataset.gk != null) {
    U.gk = t.value;
    U.gc = null;
    U.gshow = false;
    render();
    return;
  }
  // ハーフスイングの距離の入力欄（空にすると、フルの9割に戻す）
  const hi = t.dataset && t.dataset.half;
  if (hi != null) {
    const c = R.clubs[hi];
    if (t.value === "") {
      delete c.half;
      save();
      render();
      say(c.name + "のハーフを、フルの9割（" + halfOf(c) + "Y）に戻しました。", 2500);
      return;
    }
    const v = Number(t.value);
    if (!(v > 0 && v <= 350)) {
      say("1から350までの数字を入力してください。", 3000);
      return;
    }
    c.half = Math.round(v);
    save();
    say(c.name + "のハーフを" + c.half + "Yにしました。", 2500);
    return;
  }
  // 番手の距離の入力欄
  const i = t.dataset && t.dataset.dist;
  if (i == null) return;
  const v = Number(t.value);
  if (!(v > 0 && v <= 350)) {
    say("1から350までの数字を入力してください。", 3000);
    return;
  }
  R.clubs[i].dist = Math.round(v);
  save();
  say(R.clubs[i].name + "を" + R.clubs[i].dist + "Yにしました。", 2500);
});

// 控えの貼り付け欄：描き直しても消えないように、打った内容を覚えておく
document.addEventListener("input", (e) => {
  if (e.target.id === "bktext") {
    U.bkText = e.target.value;
    U.bkArm = false;
  }
});

/* ---- 起動 ---- */

load();
applyCourse();
render();
if (U.clubNote) say(U.clubNote, 9000); // 番手の距離を新しい世代に合わせたときだけ
if (R.gps) gpsOn();

// GPSの「◯秒前」の表示と図を、5秒ごとに新しくする
setInterval(() => {
  if (R.gps && U.view === "hole") refreshGps();
}, 5000);

// 保存係（sw.js）を登録する。電波のない場所でも開けるように、アプリのファイルを端末に保存する係
if ("serviceWorker" in navigator) {
  const register = () =>
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
  // 画面の読み込みが終わってから登録する（もう終わっていれば、すぐ登録する）
  if (document.readyState === "complete") register();
  else addEventListener("load", register);
}

// 新しい版の保存係に切り替わったら、1回だけ読み直して新しい版の画面にする
if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloaded) {
      reloaded = true;
      location.reload();
    }
  });
}

autoUnlock();

/**
 * 引っ越しの後片付け。
 * 前の版（v28 まで）の保存係は、端末に「古い入口」（前の版の画面）を保存している。
 * 新しい保存係に切り替わる前に、電波なしでその入口から開くと、前の版が動いて、記録が2か所に分かれてしまう。
 * それを防ぐために、古い入口を今の画面に入れ替えておく。
 * （新しい保存係に切り替わると、古い保存場所ごと消えるので、ここは何もしなくなる）
 */
async function retireOldEntrances() {
  try {
    const names = (await caches.keys()).filter((k) => k.startsWith("twinlakes-"));
    if (!names.length) return;
    // 先に開いておく。このあと新しい保存係が古い保存場所を消しても、
    // 開いてあるものに書くだけなので、消えた保存場所を作り直してしまうことがない
    const olds = await Promise.all(names.map((k) => caches.open(k)));
    const r = await fetch(location.href.split(/[?#]/)[0]), // 今開いている画面そのもの
      html = r.ok ? await r.text() : "";
    if (html.indexOf('<script id="boot">') < 0) return; // 今の版の画面を取れなかったら、何もしない
    for (const c of olds)
      for (const u of ["./", "index.html"])
        await c.put(u, new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  } catch (e) {}
}
retireOldEntrances();

window.APP_READY = true; // 起動が終わった印（自動テストが待つのに使う）
