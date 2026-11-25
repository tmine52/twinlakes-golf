/*
 * 番手の提案（残り距離と球の場所から、次に持つ番手を決める）
 */

/** 番手を、距離の短い順に並べる（選んでいるスイングの距離で） */
function byDist() {
  const o = (c) => R.clubs.indexOf(c);
  return R.clubs
    .filter((c) => c.dist > 0)
    .slice()
    .sort((a, b) => cd(a) - cd(b) || o(b) - o(a));
}

/** 球の場所（未設定ならFW） */
function lieOf(h) {
  return h.lie || "fw";
}

/** その球の場所で「使わない」番手か */
function ng(c, h) {
  const k = lieOf(h);
  if (k === "light") return /1W|3W|5W|6I/.test(c.name);
  if (k === "deep") return !/AW|SW/.test(c.name);
  if (k === "bunker") return c.name !== "SW";
  return false;
}

/** 球の場所を考えた目安の距離（選んでいるスイングの距離。浅いラフは1割引、深いラフとバンカーは半分） */
function eff(c, h) {
  const k = lieOf(h),
    f = k === "light" ? 0.9 : k === "deep" || k === "bunker" ? 0.5 : 1;
  return f === 1 ? cd(c) : Math.round((cd(c) * f) / 5) * 5;
}

/** 長い残り距離を、どの番手で何回に分けて運ぶかの計画 */
function planFw(r, l) {
  const a = l.filter((c) => !/1W|3W/.test(c.name));
  if (!a.length) return null;
  const seqOf = (u) => {
    const q = [];
    let x = r;
    while (x > 30 && q.length < 5) {
      const f = a.find((c) => cd(c) >= x && cd(c) <= cd(u));
      if (f) {
        q.push(f.name);
        x = 0;
        break;
      }
      q.push(u.name);
      x -= cd(u);
    }
    if (x > 0) q.push("寄せ");
    return q;
  };
  let best = null;
  ["7I", "5U"]
    .map((nm) => a.find((c) => c.name === nm))
    .filter(Boolean)
    .concat([a[Math.max(0, a.length - 3)]])
    .forEach((u) => {
      const q = seqOf(u);
      if (!best || q.length < best.q.length) best = { u, q };
    });
  return best;
}

/** n番で次に持つ番手の提案（ティーでは狙いと池越えの注意を添える） */
function suggest(n) {
  const s = suggest0(n),
    d = D[n - 1];
  if (!H(n).green && atTee(n)) {
    if (d.aim && s.n.indexOf(d.aim) < 0) s.n = d.aim + (s.n ? "　" + s.n : "");
    if (d.plus) s.n += " 池越えのため、" + d.plus + "Y足して選んでいます。";
  }
  return s;
}

/** 提案の本体。{c: 大きく出す番手, n: 説明, rec: 番手ボタンに印を付ける番手} */
function suggest0(n) {
  const h = H(n),
    d = D[n - 1],
    r = rem(n) + (d.plus && !h.green && atTee(n) ? d.plus : 0);
  if (h.green) return { c: "パター", n: "カップをオーバーしない強さで。", rec: null };
  if (atTee(n) && d.club && !(R.tee !== CO.base && d.p === 3))
    return {
      c: d.club,
      n: (d.aim || "") + (R.tee === CO.base ? "" : " ※攻略文は" + TN[CO.base] + "基準です。"),
      rec: d.club,
    };
  if (atTee(n) && !d.club && d.p >= 4 && R.clubs.some((c) => c.name === "1W"))
    return { c: "1W", n: d.aim ? "" : "フェアウェイの広いほうへ。曲げないことを優先します。", rec: "1W" };
  const l = byDist();
  if (!l.length) return { c: "番手を登録", n: "「番手の距離」で登録してください。", rec: null };
  const k = lieOf(h);
  if (k === "bunker") return { c: "SWで出す", n: "距離より、1回で出すことを優先します。", rec: "SW" };
  if (k === "deep")
    return { c: "SWかAWで出す", n: "距離は考えません。フェアウェイへ戻せれば成功です。", rec: "SW" };
  if (r <= 30) return { c: "SWかAWで寄せる", n: "グリーン中央へ。ピンは狙いません。", rec: "SW" };
  if (k === "light") {
    const a = l.filter((c) => !ng(c, h)),
      fit = a.find((c) => eff(c, h) >= r);
    if (fit)
      return {
        c: fit.name,
        n: "ラフのため目安" + eff(fit, h) + "Y。短く持って、コンパクトに振ります。",
        rec: fit.name,
      };
    const u = a.find((c) => c.name === "7I") || a[a.length - 1];
    return {
      c: "7Iか8Iで花道へ",
      n:
        "ラフから無理に届かせません。7Iは目安" + eff(u, h) + "Yで残り約" + Math.max(0, r - eff(u, h)) + "Y。",
      rec: "7I",
    };
  }
  const fit = l.find((c) => cd(c) >= r && !/1W|3W/.test(c.name));
  if (fit)
    return { c: fit.name, n: "目安" + cd(fit) + "Y。池とバンカーを避ける番手を優先します。", rec: fit.name };
  if (d.p === 3 && atTee(n)) {
    const u3 = l.filter((c) => c.name !== "1W").pop();
    if (u3)
      return {
        c: u3.name,
        n: "届く番手がありません。いちばん飛ぶ番手で、危険の少ない側を狙います。",
        rec: u3.name,
      };
  }
  const pl = planFw(r, l),
    u = pl ? pl.u : l.find((c) => c.name === "5U") || l[Math.max(0, l.length - 3)];
  return {
    c: u.name + "で運ぶ",
    n:
      (pl ? "計画：" + pl.q.join(" → ") + "（" + pl.q.length + "回でグリーンへ）。" : "") +
      "目安" +
      cd(u) +
      "Yで残り約" +
      Math.max(0, r - cd(u)) +
      "Y。曲げないことを優先します。",
    rec: u.name,
  };
}

/** 残り距離ごとの番手の表（アドバイス画面用） */
function bands(k) {
  const h0 = { lie: k },
    a = byDist().filter((c) => !/1W|3W/.test(c.name) && !ng(c, h0));
  let p = 0;
  const o = [];
  a.forEach((c) => {
    const d = eff(c, h0);
    if (d > p) {
      o.push([p ? p + 1 + "〜" + d + "Y" : d + "Y以内", c.name]);
      p = d;
    }
  });
  o.push([p + 1 + "Y以上", k === "light" ? "7Iか8Iで花道へ" : "5Uで刻む"]);
  return o;
}

/** 球の場所ごとの一言 */
function lieTip(n, h) {
  if (R.simple || h.green || atTee(n)) return "";
  return LIE_TIPS[lieOf(h)];
}

/* ---- 番手の距離の見直し ---- */

/**
 * 実測（GPS）から、番手の距離の見直し案を作る。
 * 対象は「FWから打って、結果が普通」の打だけ（ラフやミスの距離で計画を短くしすぎないため）。
 * 3回以上の実測があり、中央値を5Y単位に丸めた値が今の設定と10Y以上ちがう番手だけを出す。
 * 戻り値: [{ name: 番手, n: 回数, med: 中央値, min, max, from: 今の設定, to: 見直し案 }]
 */
function distProposals() {
  const L = allShots().filter((s) => s.dist && s.r === "ok" && (s.lie || "fw") === "fw");
  return R.clubs
    .map((c) => {
      const v = L.filter((s) => s.c === c.name)
        .map((s) => s.dist)
        .sort((a, b) => a - b);
      if (v.length < 3) return null;
      const med = Math.round(median(v)),
        to = Math.round(med / 5) * 5;
      if (Math.abs(to - c.dist) < 10) return null;
      return { name: c.name, n: v.length, med, min: v[0], max: v[v.length - 1], from: c.dist, to };
    })
    .filter(Boolean);
}
