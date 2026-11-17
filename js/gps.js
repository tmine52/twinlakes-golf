/*
 * GPS：現在地、残り距離、実測飛距離、お試しモードの「立つ場所」
 *
 * 位置はすべて [緯度, 経度]。距離はヤード（1ヤード＝0.9144メートル）。
 */

const YARD = 0.9144; // 1ヤードのメートル数

/* ---- 距離の計算 ---- */

/** 2つの地点の直線距離（メートル。丸めない） */
function metersTo(a, b) {
  const r = Math.PI / 180,
    E = 6371000,
    dl = (b[0] - a[0]) * r,
    dg = (b[1] - a[1]) * r,
    x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dg / 2) ** 2;
  return 2 * E * Math.asin(Math.sqrt(x));
}

/** 2つの地点の直線距離（ヤード） */
function yardsTo(a, b) {
  return Math.round(metersTo(a, b) / YARD);
}

/** 緯度・経度を、基準点 o からのメートル（東がx、北がy）に直す */
function xy(p, o) {
  return [(p[1] - o[1]) * Math.cos((o[0] * Math.PI) / 180) * 111320, (p[0] - o[0]) * 110540];
}

/** ホールの道すじ（ティー → 通過点 → グリーン中央）。座標が足りなければ null */
function holePath(d) {
  return d.tc && d.gc ? [d.tc].concat(d.wp || [], [d.gc]) : null;
}

/** 点の列を順にたどった道のり（メートル） */
function pathMeters(P) {
  let t = 0;
  for (let i = 1; i < P.length; i++) t += metersTo(P[i - 1], P[i]);
  return t;
}

/** 道すじ P の上で、始点から m メートル進んだ場所 */
function pathPoint(P, m) {
  for (let i = 1; i < P.length; i++) {
    const L = metersTo(P[i - 1], P[i]);
    if (m <= L || i === P.length - 1) {
      const f = L ? Math.min(1, Math.max(0, m / L)) : 0;
      return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f];
    }
    m -= L;
  }
  return P[P.length - 1];
}

/** 点 p を、区間 a→b の上に真横から下ろした位置（0 が a、1 が b。0未満や1より大きい値も返す） */
function legT(p, a, b) {
  const q = xy(p, a),
    u = xy(b, a);
  return (q[0] * u[0] + q[1] * u[1]) / (u[0] * u[0] + u[1] * u[1] || 1);
}

/**
 * 曲がり角を1つ回るための「回り道」（メートル）。
 * A→W が今いる区間（W が通過点＝曲がり角）、B が W の次の点。
 *
 *   ・道すじ（A→W）の上にいる球の回り道は、（W までの距離＋W から B）−（B までの直線）。W に近づくほど小さくなる。
 *   ・道すじから横に外れた球にも、同じ進み具合の「道すじの上の球」と同じだけの回り道を足す。
 *     外れた球を W まで歩かせると、横に外れた分まで足されて長く出すぎるので、それより多くは足さない。
 *   ・角の内側へ大きく入った球は、もう角を回らなくてよいので、回り道を足さない。
 *     W から先の向きに、道すじより15Yを超えて進んでいたら減らし始め、55Yでなくす（急に数字が飛ばないようにするため）。
 */
function cornerExtra(p, A, W, B) {
  const t = Math.max(0, Math.min(1, legT(p, A, W))), // 区間 A→W の上での進み具合（0〜1）
    onPath = [A[0] + (W[0] - A[0]) * t, A[1] + (W[1] - A[1]) * t], // 同じ進み具合の、道すじの上の点
    detour = metersTo(onPath, W) + metersTo(W, B) - metersTo(onPath, B), // 道すじの上の球の回り道
    own = metersTo(p, W) + metersTo(W, B) - metersTo(p, B), // この球が W まで歩いたときの回り道
    off = xy(p, onPath), // 道すじからのずれ
    out = xy(B, W), // W から先の向き
    ahead = (off[0] * out[0] + off[1] * out[1]) / (Math.hypot(out[0], out[1]) || 1), // ずれのうち、W から先の向きの分
    inside = Math.max(0, Math.min(1, (ahead - 15 * YARD) / (40 * YARD))); // 角の内側へ入った度合い（0〜1）
  return Math.max(0, Math.min(detour, own)) * (1 - inside);
}

/**
 * コースに沿った、グリーン中央までの残り距離（ヤード）。
 * 通過点（曲がり角）が無いホールは直線。あるホールは、直線の距離に、これから回る角の「回り道」を足す。
 * 道すじの上にいれば「現在地 → 通過点 → グリーン」の道のりと同じになる。
 *
 * 「通過点を過ぎた」の決め方：その通過点へ向かう区間（1つ前の点 → 通過点）の終わりを越えたら、過ぎたとみなす。
 * 通過点は、ティーの座標があるホールだけで使う（どちらから来たかが分からないと、角の向きが決まらないため）。
 */
function playYards(p, d) {
  const W = d.wp || [];
  if (!W.length || !d.tc) return yardsTo(p, d.gc);
  const pts = [d.tc].concat(W, [d.gc]); // ティー → 通過点 → … → グリーン
  let next = 1; // 次に向かう点の番号（1 が最初の通過点）
  for (let j = W.length; j >= 1; j--)
    if (legT(p, pts[j - 1], pts[j]) >= 1) {
      next = j + 1;
      break;
    }
  let m = metersTo(p, d.gc); // 直線
  for (let k = next; k <= W.length; k++) m += cornerExtra(p, pts[k - 1], pts[k], pts[k + 1]);
  return Math.round(m / YARD);
}

/* ---- 現在地 ---- */

/** 記録に使える現在地（古い・誤差が大きいときは null） */
function fixPos() {
  if (DEMO) return R.gps && G.pos ? G.pos.slice() : null;
  if (!R.gps || !G.pos || Date.now() - G.at > 30000 || G.acc > 40) return null;
  return G.pos.slice();
}

/** 図に旗を立てるための現在地 */
function meNow() {
  return R.gps && G.pos && G.y != null && (DEMO || Date.now() - G.at < 60000) ? G.pos : null;
}

/** ティーの近く（90Y以内）にいるか。GPSが無いときは「いる」とみなす */
function nearTee(n) {
  const d = D[n - 1],
    p = fixPos();
  return !p || !d.tc || yardsTo(p, d.tc) <= 90;
}

/** まだ1打も打っておらず、ティーにいるか */
function atTee(n) {
  return H(n).shots.every((x) => x.r === "miss") && nearTee(n);
}

/** ティーから離れたあとで、1打目のボタンを押したか（押し遅れ） */
function teeLate(n, p) {
  const d = D[n - 1];
  return !!(p && d.tc && G.y != null && yardsTo(p, d.tc) > 90 && G.y < yards(n) - 50);
}

/** GPSの状態を1行で */
function gpsLine() {
  if (!R.gps) return "GPSはオフです。";
  if (G.err) return G.err;
  if (G.y == null) return "現在地を取得しています。";
  // 通過点のあるホールでは、道のりと直線がちがうので直線も添える
  const direct = G.direct != null && Math.abs(G.direct - G.y) >= 3 ? "直線" + G.direct + "Y・" : "";
  if (DEMO) return "グリーン中央まで " + G.y + "Y（" + direct + "お試しの位置）";
  const age = Math.round((Date.now() - G.at) / 1000);
  return (
    "グリーン中央まで " + G.y + "Y（" + direct + "誤差 約" + Math.round(G.acc / YARD) + "Y・" + age + "秒前）"
  );
}

/** GPSの行と図を新しくする */
function refreshGps() {
  const e = document.getElementById("gpsline");
  if (e) e.textContent = gpsLine();
  if (
    U.view === "hole" &&
    !U.sel &&
    !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) &&
    (!U.mt || Date.now() - U.mt > 15000)
  ) {
    U.mt = Date.now();
    const m = document.querySelector("[data-mapv]");
    if (m) render();
  }
}

/** 現在地が届いたときの処理（残り距離を更新する） */
function onPos(p) {
  G.err = "";
  G.acc = p.coords.accuracy;
  G.at = Date.now();
  G.pos = [p.coords.latitude, p.coords.longitude];
  const d = D[R.cur - 1];
  if (!d.gc) {
    G.y = null;
    G.direct = null;
    G.err = "このホールはグリーンの座標が未登録です。残りは手入力で直せます。";
    refreshGps();
    return;
  }
  G.direct = yardsTo(G.pos, d.gc);
  if (G.direct > 1000) {
    G.y = null;
    G.err = "コースから離れています。";
    refreshGps();
    return;
  }
  const y = playYards(G.pos, d);
  G.y = y;
  const h = H(R.cur);
  // 残り距離を現在地で上書きするのは、打ち始めた後か、ティーから20Y以上進んだ後だけ
  if (
    U.view === "hole" &&
    !h.green &&
    G.acc <= 40 &&
    (h.shots.length || h.rem != null || y < yards(R.cur) - 20)
  ) {
    if (h.rem !== y) {
      h.rem = y;
      save();
      // 入力中・選択中は描き直さない（入力が消えたり、選択欄が閉じたりするため）
      if (!U.sel && document.activeElement.id !== "fix" && !/^(pick|csel2)$/.test(document.activeElement.id))
        render();
      return;
    }
  }
  refreshGps();
}

/** 現在地を取れなかったときの処理 */
function onErr(e) {
  G.err =
    e.code === 1
      ? "位置情報が許可されていません。Chromeの設定で許可してください。"
      : "現在地を取得できません。";
  refreshGps();
}

/** GPSを使い始める */
function gpsOn() {
  if (DEMO) {
    simSet(SIM.r);
    return;
  }
  if (!navigator.geolocation) {
    G.err = "この端末ではGPSを使えません。";
    return;
  }
  if (G.watch == null)
    G.watch = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    });
}

/** GPSを止める */
function gpsOff() {
  if (DEMO) G.pos = null;
  if (G.watch != null) {
    navigator.geolocation.clearWatch(G.watch);
    G.watch = null;
  }
  G.y = null;
  G.direct = null;
  G.err = "";
}

/* ---- 実測の飛距離 ---- */

/** 最後に打った1打（空振りを除く） */
function lastReal(h) {
  for (let i = h.shots.length - 1; i >= 0; i--) if (h.shots[i].r !== "miss") return h.shots[i];
  return null;
}

/**
 * 1打の止まった場所を記録し、実測の飛距離を出す。
 * 打った場所が分からない打、OB・前進ティー・空振り・番手なしの1打は測らない。
 * 番手の距離の1.5倍＋20Yを超える値は、押し遅れとみなして捨てる。
 */
function endShot(s, p) {
  if (!s || s.to || !s.from || !p || /^(ob|f4|miss|add)$/.test(s.r)) return;
  s.to = p;
  const y = yardsTo(s.from, p),
    c = R.clubs.find((x) => x.name === s.c),
    cap = c ? c.dist * 1.5 + 20 : 350;
  if (y >= 5 && y <= cap) s.dist = y;
}

/** 球に着いた合図。前の1打の飛距離を確定する */
function markBall(h) {
  endShot(lastReal(h), fixPos());
}

/** 次の1打を打つ場所（前の1打の止まった場所） */
function shotFrom(h) {
  const l = lastReal(h),
    p = fixPos();
  endShot(l, p);
  if (l && l.r === "ob") return l.from || p;
  return (l && l.to) || p;
}

/* ---- お試しモードの「立つ場所」（GPSの代わり） ---- */

/** お試しモード：にせものの現在地を届ける */
function simPos(pos) {
  SIM.n = R.cur + "/" + CO.id;
  onPos({ coords: { latitude: pos[0], longitude: pos[1], accuracy: 5 } });
}

/** お試しモード：道すじの上で、グリーンまで r ヤードの場所に立つ（r が null ならティー） */
function simSet(r) {
  const d = D[R.cur - 1],
    path = holePath(d);
  SIM.n = R.cur + "/" + CO.id;
  if (!path) {
    SIM.r = null;
    G.pos = null;
    G.y = null;
    G.direct = null;
    G.err = "このホールは座標がないため、お試しの位置を置けません。";
    return;
  }
  const L = pathMeters(path) / YARD;
  r = Math.max(0, Math.min(L, r == null ? L : r));
  SIM.r = r;
  simPos(pathPoint(path, (L - r) * YARD));
}

/** お試しモード：図でタップした場所に立つ */
function simFree(pos) {
  simPos(pos);
  SIM.r = G.y; // このあと「50Y進む」を押したときの基準
}
