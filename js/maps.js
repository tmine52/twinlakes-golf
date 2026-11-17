/*
 * 図：ホールの簡易図と、コース全体の位置関係
 *
 * 図の中の長さの単位はメートル。緯度・経度は gps.js の xy() でメートルに直してから描く。
 * SVG（図を描くための書き方）は上が y の小さいほうなので、北を上にするために y を反転している。
 */

/** SVGの部品を1つ作る。数は小数1けたに丸める */
function el(tag, attrs, inner) {
  const a = Object.keys(attrs)
    .map(
      (k) => " " + k + '="' + (typeof attrs[k] === "number" ? Number(attrs[k].toFixed(1)) : attrs[k]) + '"',
    )
    .join("");
  return "<" + tag + a + (inner == null ? "/>" : ">" + inner + "</" + tag + ">");
}

/** 点の列を、折れ線の points 属性の形にする（y は反転） */
function linePoints(P) {
  return P.map((p) => p[0].toFixed(1) + "," + (-p[1]).toFixed(1)).join(" ");
}

/** 点の集まりが収まる、図の範囲 [左, 上, 幅, 高さ] を決める（minW: 高さに対する幅の最小の割合） */
function svgFit(P, minW) {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  P.forEach((p) => {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  });
  const m = 35; // まわりの余白（メートル）
  x0 -= m;
  x1 += m;
  y0 -= m;
  y1 += m * 1.8;
  const w = x1 - x0,
    h = y1 - y0;
  if (w < h * minW) {
    const c = (x0 + x1) / 2;
    x0 = c - (h * minW) / 2;
    x1 = c + (h * minW) / 2;
  }
  return [x0, -y1, x1 - x0, y1 - y0];
}

/** 旗の絵（x, y: 立てる場所、c: 旗の色、s: 大きさ） */
function flag(x, y, c, s) {
  return el(
    "g",
    { transform: "translate(" + x.toFixed(1) + "," + y.toFixed(1) + ") scale(" + s + ")" },
    el("line", { x1: 0, y1: 0, x2: 0, y2: -26, stroke: "#222", "stroke-width": 2.5 }) +
      el("path", { d: "M0,-26 L18,-20 L0,-14Z", fill: c }) +
      el("circle", { r: 3.5, fill: "#222" }),
  );
}

/**
 * n番の簡易図（下がティー、上がグリーン）の絵だけを作る。
 * 戻り値: { svg: 絵, me: 現在地が分かっているか, meIn: 現在地を図に入れたか }。座標が足りなければ null
 */
function holeMapSvg(n) {
  const d = D[n - 1],
    path = holePath(d);
  if (!path) return null;
  // ティーを原点にして、ティー→グリーンが真上を向くように回す
  const o = d.tc,
    g = xy(d.gc, o),
    th = Math.atan2(g[0], g[1]),
    rot = (p) => {
      const q = xy(p, o);
      return [q[0] * Math.cos(th) - q[1] * Math.sin(th), q[0] * Math.sin(th) + q[1] * Math.cos(th)];
    };
  const h = H(n),
    line = path.map(rot),
    T = line[0],
    Gp = line[line.length - 1],
    all = line.slice();
  h.shots.forEach((s) => {
    if (s.from) all.push(rot(s.from));
    if (s.to) all.push(rot(s.to));
  });
  const me = meNow(),
    mp = me ? rot(me) : null,
    meIn = !!mp && Math.hypot(mp[0] - Gp[0], mp[1] - Gp[1]) < 700; // 遠すぎる現在地は図に入れない
  if (meIn) all.push(mp);
  const vb = svgFit(all, 0.55),
    s = vb[3] / 300; // 文字や点の大きさを、図の縮尺に合わせる係数
  let body =
    // フェアウェイの帯（ティー → 通過点 → グリーン）
    el("polyline", {
      points: linePoints(line),
      fill: "none",
      stroke: "#7bbf7b",
      "stroke-width": 28,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      opacity: 0.45,
    }) +
    el("circle", { cx: Gp[0], cy: -Gp[1], r: 16, fill: "#3fa34d", opacity: 0.75 }) +
    flag(Gp[0], -Gp[1], "#e8e8e8", s * 1.1) +
    el("rect", { x: T[0] - 8, y: -T[1] - 5, width: 16, height: 10, fill: "#555" });
  // 打った球の止まった場所（GPSで記録できた打だけ）
  h.shots.forEach((sh) => {
    if (!sh.from || !sh.to) return;
    const a = rot(sh.from),
      b = rot(sh.to);
    body +=
      el("line", {
        x1: a[0],
        y1: -a[1],
        x2: b[0],
        y2: -b[1],
        stroke: "#0b6bcb",
        "stroke-width": 2 * s,
        "stroke-dasharray": (5 * s).toFixed(1),
      }) +
      el("circle", { cx: b[0], cy: -b[1], r: 5 * s, fill: "#0b6bcb" }) +
      el(
        "text",
        { x: b[0] + 8 * s, y: -b[1] + 4 * s, "font-size": 12 * s, fill: "#0b4f99" },
        esc(sh.c) + (sh.dist ? " " + sh.dist + "Y" : ""),
      );
  });
  if (meIn) body += flag(mp[0], -mp[1], "#d63b2f", s * 1.3);
  const svg = el(
    "svg",
    {
      viewBox: vb.map((v) => v.toFixed(1)).join(" "),
      style:
        "display:block;width:100%;max-height:300px;background:#eef3ea;border-radius:6px" +
        (holeMapTap() ? ";cursor:crosshair;touch-action:manipulation" : ""),
      role: "img",
      "aria-label": n + "番の簡易図。下がティー、上がグリーン",
      // タップした場所を緯度・経度に戻すための、原点（ティー）と回した角度
      "data-hm": o[0] + "," + o[1] + "," + th,
    },
    body,
  );
  return { svg, me: !!mp, meIn };
}

/** お試しモード中は、ホール図をタップした場所に立てる */
function holeMapTap() {
  return DEMO && R.gps;
}

/** n番の簡易図と、その説明 */
function holeMap(n) {
  const m = holeMapSvg(n);
  if (!m) return '<p class="note">このホールはティーかグリーンの座標が未登録のため、図を出せません。</p>';
  return (
    m.svg +
    '<p class="note">' +
    (m.me
      ? m.meIn
        ? "赤い旗が現在地。グリーンまで " + G.y + "Y"
        : "現在地はこのホールの外です。"
      : "GPSをオンにすると、赤い旗で現在地を表示します。") +
    " 青い点は打った球の止まった場所です（GPSで記録できた打だけ）。" +
    (holeMapTap() ? "お試し中は、図をタップするとその場所に立ちます。" : "") +
    "</p>"
  );
}

/** ホール図の上でタップした画面の位置を、緯度・経度に直す（お試しモード用） */
function holeMapPos(svg, clientX, clientY) {
  const a = svg.getAttribute("data-hm").split(",").map(Number),
    o = [a[0], a[1]],
    th = a[2],
    pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse()), // 図の中の座標（メートル）
    X = q.x,
    Y = -q.y,
    // holeMap の rot() と逆向きに回して、東・北のメートルに戻す
    east = X * Math.cos(th) + Y * Math.sin(th),
    north = -X * Math.sin(th) + Y * Math.cos(th);
  return [o[0] + north / 110540, o[1] + east / (Math.cos((o[0] * Math.PI) / 180) * 111320)];
}

/**
 * コース全体の位置関係の図（上が北）の絵だけを作る。n は今のホール（0 なら、どのホールも強調しない）。
 * 戻り値: { svg: 絵, me: 現在地が分かっているか, meIn: 現在地を図に入れたか, center: 図の中心にする場所 }。座標が無ければ null
 */
function courseMapSvg(n) {
  const V = D.map((d, i) => [d, i]).filter((x) => holePath(x[0]));
  if (!V.length) return null;
  const o = V[0][0].gc, // 図の原点
    P = [];
  V.forEach((x) => holePath(x[0]).forEach((p) => P.push(xy(p, o))));
  if (CO.ch) {
    const q = xy(CO.ch, o);
    P.push(q, [q[0], q[1] - 45]); // クラブハウスの下に名前を書く分の余白
  }
  const me = meNow(),
    mp = me ? xy(me, o) : null,
    meIn = !!mp && P.some((q) => Math.hypot(q[0] - mp[0], q[1] - mp[1]) < 600), // コースの外なら図に入れない
    all = meIn ? P.concat([mp]) : P;
  const vb = svgFit(all, 0.6),
    s = Math.max(vb[2] / 340, vb[3] / 420), // 文字や印の大きさを、図の縮尺に合わせる係数
    pad = 8 * s; // 端にあるグリーンの丸い番号が切れないように、まわりを少し広げる
  vb[0] -= pad;
  vb[1] -= pad;
  vb[2] += pad * 2;
  vb[3] += pad * 2;
  let body = "";
  (CO.ponds || []).forEach((q) => {
    const c = xy(q, o);
    body += el("circle", { cx: c[0], cy: -c[1], r: q[2], fill: "#2f6fb5", opacity: 0.8 });
  });
  if (CO.ch) {
    const c = xy(CO.ch, o);
    body +=
      el("rect", { x: c[0] - 11 * s, y: -c[1] - 8 * s, width: 22 * s, height: 16 * s, fill: "#6b4a2b" }) +
      el(
        "text",
        { x: c[0], y: -c[1] + 20 * s, "text-anchor": "middle", "font-size": 10 * s, fill: "#3b2a18" },
        "クラブハウス",
      );
  }
  // ホールの線（黄＝OUT、水色＝IN、青＝今のホール）と、ティーの白い四角
  V.forEach((v) => {
    const i = v[1],
      on = i + 1 === n,
      line = holePath(v[0]).map((p) => xy(p, o)),
      a = line[0];
    body +=
      el("polyline", {
        points: linePoints(line),
        fill: "none",
        stroke: on ? "#0b6bcb" : i < 9 ? "#c9a400" : "#2a9bb0",
        "stroke-width": (on ? 8 : 5) * s,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: on ? 1 : 0.75,
      }) +
      el("rect", {
        x: a[0] - 4 * s,
        y: -a[1] - 4 * s,
        width: 8 * s,
        height: 8 * s,
        fill: "#fff",
        stroke: "#333",
        "stroke-width": 1 * s,
      });
  });
  // グリーンの丸い番号（線の上に重ねるので後から描く）
  V.forEach((v) => {
    const i = v[1],
      on = i + 1 === n,
      b = xy(v[0].gc, o);
    body +=
      el("circle", {
        cx: b[0],
        cy: -b[1],
        r: (on ? 11 : 9) * s,
        fill: on ? "#0b4f99" : "#d6281f",
        stroke: "#fff",
        "stroke-width": 1.5 * s,
      }) +
      el(
        "text",
        {
          x: b[0],
          y: -b[1] + 4 * s,
          "text-anchor": "middle",
          "font-size": (on ? 12 : 10.5) * s,
          "font-weight": 700,
          fill: "#fff",
        },
        i + 1,
      );
  });
  if (meIn) body += flag(mp[0], -mp[1], "#d63b2f", s * 1.4);
  const svg = el(
    "svg",
    {
      viewBox: vb.map((v) => v.toFixed(1)).join(" "),
      style: "display:block;width:100%;max-height:440px;background:#e3ecd9;border-radius:6px",
      role: "img",
      "aria-label": "コース全体の位置関係。上が北",
    },
    body,
  );
  return { svg, me: !!mp, meIn, center: CO.ch || V[0][0].gc };
}

/** コース全体図につける、色や印の説明（withCurrent: 今のホールを青で強調しているか） */
function courseMapLegend(withCurrent) {
  return (
    "上が北。丸い数字がグリーン、白い四角がティー。黄がOUT、水色がIN" +
    (withCurrent ? "、青が今のホール" : "") +
    "。" +
    (CO.ponds ? "青い丸は池のおおよその位置。" : "")
  );
}

/** コース全体の位置関係の図と、その説明、Googleマップへのリンク */
function courseMap(n) {
  const m = courseMapSvg(n);
  if (!m) return '<p class="note">このコースは座標が未登録のため、図を出せません。</p>';
  return (
    m.svg +
    '<p class="note">' +
    courseMapLegend(true) +
    (m.me
      ? m.meIn
        ? "赤い旗が現在地。"
        : "現在地はコースの外です。"
      : "GPSをオンにすると現在地に赤い旗を立てます。") +
    "</p>" +
    linkButton(
      "https://www.google.com/maps/search/?api=1&query=" + m.center[0] + "," + m.center[1],
      "Googleマップで開く（通信が必要）",
    )
  );
}

/** 図の枠（ホール図／コース全体の切り替え） */
function mapBox(n) {
  const v = U.mapv || "hole";
  return (
    '<section class="card"><div class="tabs" style="grid-template-columns:repeat(2,1fr)">' +
    [
      ["hole", "ホール図"],
      ["course", "コース全体"],
    ]
      .map(
        (x) => '<button data-mapv="' + x[0] + '" aria-pressed="' + (v === x[0]) + '">' + x[1] + "</button>",
      )
      .join("") +
    "</div>" +
    (v === "hole" ? holeMap(n) : courseMap(n)) +
    "</section>"
  );
}
