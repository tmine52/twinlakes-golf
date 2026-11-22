/*
 * 番手ごとの記録（累計）と飛距離の伸び（v35）
 *   練習（シミュレーター）の1球ずつの記録 PRACTICE と、コースでGPSで測った実測（ラウンドの記録）を、番手ごとにためて見せる。
 *   練習の記録は、本人の録音などから Claude が書き足す（新しい練習が増えたら、ここに1回分を足して版を上げる）。
 */

/*
 * 練習の記録。1回分 = { d: 日付, name: 名前, note: 補足, swing: "f" フルスイング／"p" 小さめのスイング, s: { 番手: [[キャリー, 合計, ミス], ...] } }
 *   キャリー：落ちたところまで（記録がなければ null）。合計：止まったところまで。ミス：本人がトップ・ダフり・シャンク・ミスショット・腹打ちと言った球は 1
 *   11/6 の計測シートはミスの記録がないので、当たりの割合は 11/7 からの分で数える
 */
const PRACTICE = [
  {
    d: "2026-11-06",
    name: "飛距離チェック",
    note: "計測シートの数字（合計）。キャリーとミスの記録なし",
    swing: "f",
    s: {
      "3W": [
        [null, 57, 0],
        [null, 118, 0],
        [null, 148, 0],
        [null, 151, 0],
        [null, 153, 0],
        [null, 177, 0],
      ],
      "5W": [[null, 159, 0]],
      "4U": [
        [null, 189, 0],
        [null, 189, 0],
      ],
      "6I": [
        [null, 106, 0],
        [null, 123, 0],
        [null, 136, 0],
        [null, 157, 0],
      ],
      "7I": [[null, 140, 0]],
      "8I": [[null, 120, 0]],
      "9I": [
        [null, 100, 0],
        [null, 106, 0],
      ],
      PW: [
        [null, 81, 0],
        [null, 94, 0],
        [null, 107, 0],
        [null, 111, 0],
        [null, 115, 0],
      ],
      AW: [
        [null, 76, 0],
        [null, 76, 0],
        [null, 83, 0],
        [null, 83, 0],
        [null, 87, 0],
        [null, 89, 0],
        [null, 94, 0],
        [null, 99, 0],
      ],
      SW: [[null, 63, 0]],
    },
  },
  {
    d: "2026-11-06",
    name: "飛距離チェック（肩まで）",
    note: "肩までのスイング",
    swing: "p",
    s: {
      "6I": [[null, 97, 0]],
      "7I": [[null, 108, 0]],
      "8I": [
        [null, 80, 0],
        [null, 96, 0],
        [null, 97, 0],
      ],
      SW: [
        [null, 58, 0],
        [null, 58, 0],
        [null, 60, 0],
      ],
    },
  },
  {
    d: "2026-11-07",
    name: "室内練習",
    note: "軽く・肩まで・ゆっくりの小さめのスイングが中心",
    swing: "p",
    s: {
      "6I": [
        [120, 121, 0],
        [30, 55, 1],
        [127, 129, 0],
        [96, 116, 1],
        [125, 136, 0],
        [93, 111, 1],
        [122, 137, 0],
        [120, 128, 0],
        [114, 126, 0],
        [125, 128, 0],
      ],
      "7I": [
        [114, 124, 0],
        [128, 129, 0],
        [121, 132, 0],
        [102, 116, 1],
        [95, 109, 1],
      ],
      "8I": [
        [84, 93, 0],
        [105, 119, 0],
        [103, 117, 0],
        [100, 116, 0],
        [98, 99, 0],
        [93, 103, 0],
        [90, 98, 1],
        [108, 109, 0],
        [100, 108, 0],
      ],
      "9I": [
        [81, 91, 0],
        [59, 71, 0],
        [102, 112, 0],
        [79, 104, 0],
        [81, 98, 0],
        [65, 76, 0],
        [59, 73, 1],
        [78, 79, 0],
        [66, 76, 0],
        [82, 88, 0],
        [67, 77, 0],
        [76, 86, 0],
        [85, 99, 0],
        [83, 100, 0],
      ],
      PW: [
        [38, 47, 0],
        [52, 60, 0],
        [74, 83, 0],
        [61, 70, 0],
        [52, 66, 1],
        [59, 70, 0],
        [52, 62, 1],
        [76, 81, 0],
        [69, 76, 1],
        [72, 79, 0],
      ],
      AW: [
        [44, 55, 0],
        [20, 33, 1],
        [37, 41, 0],
        [4, 27, 1],
        [29, 35, 0],
        [30, 36, 0],
        [38, 44, 0],
        [29, 41, 1],
        [30, 35, 0],
        [38, 44, 0],
        [34, 40, 0],
        [24, 30, 0],
        [23, 28, 0],
        [4, 24, 1],
        [15, 31, 1],
        [41, 51, 0],
        [47, 60, 0],
        [16, 31, 1],
        [35, 67, 1],
        [7, 30, 1],
        [40, 50, 0],
        [24, 39, 1],
        [47, 63, 0],
        [38, 40, 0],
        [43, 54, 0],
      ],
      SW: [
        [38, 42, 0],
        [34, 37, 0],
        [42, 46, 0],
        [45, 50, 0],
        [39, 43, 0],
        [65, 69, 0],
        [45, 53, 0],
        [56, 60, 0],
        [7, 41, 1],
        [43, 49, 0],
        [52, 68, 0],
      ],
    },
  },
  {
    d: "2026-11-21",
    name: "室内練習",
    note: "レッスンを踏まえたフルスイング（77球）",
    swing: "f",
    s: {
      "5W": [
        [100, 109, 1],
        [6, 31, 1],
        [121, 143, 0],
        [124, 146, 0],
        [143, 152, 0],
        [176, 191, 0],
        [166, 187, 0],
        [181, 199, 0],
      ],
      "4U": [
        [81, 111, 1],
        [155, 174, 0],
        [137, 150, 0],
        [176, 192, 0],
        [114, 137, 1],
        [153, 174, 0],
        [155, 175, 0],
        [27, 52, 1],
        [104, 126, 1],
        [148, 167, 0],
      ],
      "5U": [
        [146, 164, 0],
        [156, 175, 0],
        [125, 145, 0],
        [35, 59, 1],
        [125, 142, 0],
        [116, 137, 0],
        [172, 185, 0],
        [128, 148, 0],
        [137, 158, 0],
        [132, 153, 0],
        [149, 168, 0],
        [138, 156, 0],
        [157, 171, 0],
        [107, 125, 1],
        [134, 155, 0],
        [134, 153, 0],
        [169, 186, 0],
        [157, 173, 0],
      ],
      "6I": [
        [150, 165, 0],
        [148, 159, 0],
        [109, 127, 1],
        [128, 146, 0],
        [130, 130, 0],
        [6, 48, 1],
        [155, 169, 0],
        [156, 170, 0],
        [86, 108, 0],
        [74, 91, 0],
        [132, 140, 0],
        [20, 30, 1],
        [97, 114, 1],
        [159, 174, 0],
        [122, 140, 0],
        [147, 162, 0],
        [161, 174, 0],
        [148, 162, 0],
        [null, 55, 1],
        [146, 161, 0],
        [129, 141, 0],
      ],
      "7I": [
        [134, 147, 0],
        [130, 144, 0],
        [130, 142, 0],
        [119, 135, 0],
        [138, 148, 0],
        [131, 142, 0],
        [140, 151, 0],
        [49, 64, 1],
        [146, 157, 0],
        [146, 157, 0],
      ],
      AW: [
        [59, 69, 0],
        [80, 90, 0],
        [65, 73, 1],
        [59, 68, 0],
        [86, 96, 0],
        [78, 88, 0],
        [64, 72, 0],
        [88, 98, 0],
        [64, 72, 1],
        [82, 90, 0],
      ],
    },
  },
];

/** 1球ずつの記録にならべる（練習とコース）。k："練習"／"コース"、full：フルスイングか、miss：ミスと言った球か */
function clubShots() {
  const o = [];
  PRACTICE.forEach((p) =>
    Object.keys(p.s).forEach((c) =>
      p.s[c].forEach((x) =>
        o.push({
          d: p.d,
          k: "練習",
          c,
          carry: x[0],
          tot: x[1],
          miss: !!x[2],
          full: p.swing === "f",
          known: p.d >= "2026-11-07",
        }),
      ),
    ),
  );
  // コース：GPSで測った実測のうち、FWから「普通」に打った打。残りより40Y以上長い実測は、到着の押し忘れとみて外す
  allShots().forEach((s) => {
    if (!s.dist || s.r !== "ok" || (s.lie || "fw") !== "fw" || !s.c || s.c === "-") return;
    if (s.before != null && s.dist > s.before + 40) return;
    o.push({
      d: s.date === "今回" ? R.rdate || ymd() : s.date,
      k: "コース",
      c: s.c,
      tot: s.dist,
      miss: false,
      full: true,
      known: false,
    });
  });
  return o;
}

/** 並べた数の p 分位（0〜1。間は直線でつなぐ） */
function quant(v, p) {
  const s = v.slice().sort((a, b) => a - b),
    i = (s.length - 1) * p,
    lo = Math.floor(i);
  return s.length ? s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo) : null;
}

/** 番手 c の、日ごと・種類ごとのまとまり（ミスを除いた合計の真ん中と、真ん中の半分が入る幅） */
function clubSessions(L, c) {
  const g = {};
  L.filter((x) => x.c === c && !x.miss).forEach((x) => {
    const key = x.d + "|" + x.k + "|" + (x.full ? "f" : "p");
    (g[key] = g[key] || { d: x.d, k: x.k, full: x.full, v: [] }).v.push(x.tot);
  });
  return Object.values(g)
    .map((s) =>
      Object.assign(s, { n: s.v.length, med: quant(s.v, 0.5), q1: quant(s.v, 0.25), q3: quant(s.v, 0.75) }),
    )
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.k < b.k ? -1 : 1));
}

/** +30Y・−15Y の形 */
function signY(n) {
  return (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n) + "Y";
}

/** 「11/21」の形 */
function md(d) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || "");
  return m ? Number(m[1]) + "/" + Number(m[2]) : d;
}

/** 飛距離の伸びの小さな図。横＝記録した日（等間隔に並べる）、縦＝合計の距離。点＝真ん中、縦の線＝真ん中の半分が入る幅 */
function trendSvg(ss, c) {
  if (!ss.length) return "";
  const W = 320,
    H = 100,
    L = 40,
    Rr = 26,
    T = 18,
    B = 20;
  const dates = [...new Set(ss.map((s) => s.d))].sort();
  const lo = Math.min(...ss.map((s) => s.q1)),
    hi = Math.max(...ss.map((s) => s.q3)),
    pad = Math.max(5, (hi - lo) * 0.1),
    y0 = Math.floor((lo - pad) / 10) * 10,
    y1 = Math.ceil((hi + pad) / 10) * 10;
  const step = dates.length > 1 ? (W - L - Rr - 16) / (dates.length - 1) : 0,
    X = (d) => (dates.length > 1 ? L + 16 + dates.indexOf(d) * step : (L + W - Rr) / 2),
    Y = (v) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  const side = (s) => (s.k === "コース" ? 8 : s.full ? 0 : -8); // 同じ日の練習・コースは少し左右にずらす
  let g =
    '<line class="ax" x1="' +
    L +
    '" y1="' +
    Y(y0) +
    '" x2="' +
    (W - Rr + 12) +
    '" y2="' +
    Y(y0) +
    '"/>' +
    '<text class="lb" x="' +
    (L - 6) +
    '" y="' +
    (Y(y1) + 4) +
    '" text-anchor="end">' +
    y1 +
    "</text>" +
    '<text class="lb" x="' +
    (L - 6) +
    '" y="' +
    (Y(y0) + 4) +
    '" text-anchor="end">' +
    y0 +
    "</text>";
  // 練習のフルスイングの真ん中を線でつなぐ（伸びの流れ）
  const fp = ss.filter((s) => s.k === "練習" && s.full);
  if (fp.length > 1)
    g +=
      '<polyline class="tl" points="' +
      fp.map((s) => X(s.d).toFixed(1) + "," + Y(s.med).toFixed(1)).join(" ") +
      '"/>';
  ss.forEach((s) => {
    const x = X(s.d) + side(s),
      cls = s.k === "コース" ? "co" : s.full ? "pf" : "pp";
    g +=
      '<line class="rg ' +
      cls +
      '" x1="' +
      x +
      '" y1="' +
      Y(s.q1) +
      '" x2="' +
      x +
      '" y2="' +
      Y(s.q3) +
      '"/>';
    g +=
      s.k === "コース"
        ? '<rect class="mk co" x="' +
          (x - 4) +
          '" y="' +
          (Y(s.med) - 4) +
          '" width="8" height="8" transform="rotate(45 ' +
          x +
          " " +
          Y(s.med) +
          ')"/>'
        : '<circle class="mk ' + cls + '" cx="' + x + '" cy="' + Y(s.med) + '" r="4.5"/>';
    if (s.k === "練習" && s.full)
      g +=
        '<text class="vl" x="' +
        x +
        '" y="' +
        (Math.min(Y(s.q3), Y(s.med) - 6) - 3) +
        '" text-anchor="middle">' +
        Math.round(s.med) +
        "</text>";
  });
  dates.forEach(
    (d) =>
      (g +=
        '<text class="lb" x="' + X(d) + '" y="' + (H - 5) + '" text-anchor="middle">' + md(d) + "</text>"),
  );
  return (
    '<svg class="trend" viewBox="0 0 ' +
    W +
    " " +
    H +
    '" role="img" aria-label="' +
    c +
    'の飛距離の伸び">' +
    g +
    "</svg>"
  );
}

/** 「番手の距離」画面の、番手ごとの記録（累計）と飛距離の伸び */
function clubLogCard() {
  const L = clubShots(),
    pr = L.filter((x) => x.k === "練習"),
    co = L.filter((x) => x.k === "コース"),
    nP = new Set(PRACTICE.map((p) => p.d)).size,
    nC = new Set(co.map((x) => x.d)).size;
  const rows = R.clubs
    .map((club) => {
      const c = club.name,
        a = L.filter((x) => x.c === c);
      if (!a.length) return "";
      const p = a.filter((x) => x.k === "練習"),
        kn = p.filter((x) => x.known),
        ms = kn.filter((x) => x.miss).length,
        cs = a.filter((x) => x.k === "コース"),
        ss = clubSessions(L, c),
        fp = ss.filter((s) => s.k === "練習" && s.full),
        last = fp[fp.length - 1],
        first = fp[0];
      let t =
        '<div class="cl"><div class="clh"><b>' +
        c +
        "</b><span>設定 " +
        club.dist +
        "Y</span></div>" +
        '<p class="note">' +
        (p.length ? "練習 " + p.length + "球" : "練習の記録なし") +
        (kn.length
          ? "（当たり " +
            (kn.length - ms) +
            "/" +
            kn.length +
            "球＝" +
            Math.round(((kn.length - ms) / kn.length) * 100) +
            "%）"
          : "") +
        (cs.length
          ? "・コースの実測 " +
            cs.length +
            "球（真ん中 " +
            Math.round(
              quant(
                cs.map((x) => x.tot),
                0.5,
              ),
            ) +
            "Y）"
          : "") +
        "</p>";
      if (last)
        t +=
          '<p class="note">いちばん新しいフルスイング（' +
          md(last.d) +
          "・" +
          last.n +
          "球）：真ん中 " +
          Math.round(last.med) +
          "Y、真ん中の半分は " +
          Math.round(last.q1) +
          "〜" +
          Math.round(last.q3) +
          "Y（幅 " +
          Math.round(last.q3 - last.q1) +
          "Y）" +
          (first && first !== last
            ? "。" +
              md(first.d) +
              "（" +
              first.n +
              "球）の " +
              Math.round(first.med) +
              "Y から " +
              signY(Math.round(last.med) - Math.round(first.med))
            : "") +
          "</p>";
      return t + trendSvg(ss, c) + "</div>";
    })
    .join("");
  return (
    '<section class="card" id="clublog"><div class="h">番手ごとの記録（累計）と飛距離の伸び</div>' +
    '<p class="note">練習 ' +
    nP +
    "回・" +
    pr.length +
    "球と、コース " +
    nC +
    "回のGPSの実測 " +
    co.length +
    "球をためています。距離はどれも合計（キャリー＋転がり）。ミスと言った球は、真ん中と幅の計算から外しています。</p>" +
    '<p class="note legend"><span class="pf">●</span> 練習（フルスイング）　<span class="pp">●</span> 練習（小さめのスイング）　<span class="co">◆</span> コース（GPS）。縦の線は、真ん中の半分が入る幅（短いほど距離がそろっている）。</p>' +
    rows +
    '<p class="note">新しい練習の録音を Claude に送ると、ここに足して版を上げます。コースの実測は、ラウンドの記録から自動で入ります。</p></section>'
  );
}
