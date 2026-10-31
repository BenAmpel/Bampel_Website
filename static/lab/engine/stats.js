/* CCAIR Behavioral Lab: the statistics behind the Analyze tab (analyze.js), run in the researcher's browser on the
   exported rows. Group summaries with t-based 95% intervals, Welch's t-test with Cohen's d, one-way ANOVA with eta
   squared, and least squares with classical, HC1 (heteroskedasticity-robust) or participant-clustered (CR1) standard
   errors. p-values come from the regularized incomplete beta function. tests/lab/stats.test.mjs checks each against
   values from R. Exploratory: the exported R and Python code is what a paper should report. */
(function (root) {
  'use strict';

  // ---------- distributions ----------
  function lgamma(x) {   // Lanczos approximation (g = 7, n = 9)
    var c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1; var a = c[0], t = x + 7.5;
    for (var i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betacf(a, b, x) {   // continued fraction (modified Lentz), for the incomplete beta
    var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap, m, m2, aa, del, h;
    if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; h = d;
    for (m = 1; m <= 300; m++) {
      m2 = 2 * m; aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; del = d * c; h *= del;
      if (Math.abs(del - 1) < 3e-14) break;
    }
    return h;
  }
  function ibeta(x, a, b) {   // regularized incomplete beta I_x(a, b)
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function tP(t, df) { return isFinite(t) && df > 0 ? ibeta(df / (df + t * t), df / 2, 0.5) : NaN; }   // two-sided p
  function fP(f, d1, d2) { return f > 0 && d1 > 0 && d2 > 0 ? ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2) : f === 0 ? 1 : NaN; }   // upper tail
  function tCrit(df, level) {   // two-sided critical value, by bisection on tP
    var p = 1 - (level || 0.95), lo = 0, hi = 1000, mid, i;
    if (!(df > 0)) return NaN;
    for (i = 0; i < 200; i++) { mid = (lo + hi) / 2; if (tP(mid, df) > p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  // ---------- summaries ----------
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : NaN; }
  function variance(a) { if (a.length < 2) return NaN; var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return s / (a.length - 1); }
  function describe(a) {
    var n = a.length, m = mean(a), sd = Math.sqrt(variance(a)), se = sd / Math.sqrt(n), t = tCrit(n - 1);
    return { n: n, mean: m, sd: sd, se: se, lo: m - t * se, hi: m + t * se };
  }

  // ---------- tests ----------
  function welch(a, b) {
    var A = describe(a), B = describe(b), va = A.sd * A.sd / A.n, vb = B.sd * B.sd / B.n, se = Math.sqrt(va + vb), diff = A.mean - B.mean;
    var df = (va + vb) * (va + vb) / (va * va / (A.n - 1) + vb * vb / (B.n - 1)), t = diff / se, c = tCrit(df);
    var pooled = Math.sqrt(((A.n - 1) * A.sd * A.sd + (B.n - 1) * B.sd * B.sd) / (A.n + B.n - 2));
    return { diff: diff, se: se, t: t, df: df, p: tP(t, df), lo: diff - c * se, hi: diff + c * se, d: diff / pooled };
  }
  function anova(groups) {
    var all = [].concat.apply([], groups), gm = mean(all), ssb = 0, ssw = 0;
    groups.forEach(function (g) { var m = mean(g); ssb += g.length * (m - gm) * (m - gm); g.forEach(function (x) { ssw += (x - m) * (x - m); }); });
    var d1 = groups.length - 1, d2 = all.length - groups.length, f = (ssb / d1) / (ssw / d2);
    return { f: f, df1: d1, df2: d2, p: fP(f, d1, d2), eta2: ssb / (ssb + ssw) };
  }

  // ---------- least squares ----------
  function solve(A) {   // inverse of a symmetric positive (semi)definite matrix, Gauss-Jordan with partial pivoting
    var n = A.length, M = A.map(function (r, i) { return r.concat(A.map(function (x, j) { return i === j ? 1 : 0; })); }), i, j, k;
    for (i = 0; i < n; i++) {
      var p = i; for (k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
      if (Math.abs(M[p][i]) < 1e-12) return null;   // collinear: a predictor is constant or duplicates another
      var tmp = M[i]; M[i] = M[p]; M[p] = tmp;
      var piv = M[i][i]; for (j = 0; j < 2 * n; j++) M[i][j] /= piv;
      for (k = 0; k < n; k++) if (k !== i) { var f = M[k][i]; if (f) for (j = 0; j < 2 * n; j++) M[k][j] -= f * M[i][j]; }
    }
    return M.map(function (r) { return r.slice(n); });
  }
  // y: numbers, X: rows of predictors (first column the intercept), opts: { se: 'classical' | 'hc1' | 'cluster', cluster: ids }
  function ols(y, X, names, opts) {
    opts = opts || {};
    var n = y.length, k = X[0].length, XtX = [], Xty = [], i, j, l;
    for (i = 0; i < k; i++) { XtX.push(new Array(k).fill(0)); Xty.push(0); }
    for (l = 0; l < n; l++) for (i = 0; i < k; i++) { Xty[i] += X[l][i] * y[l]; for (j = 0; j < k; j++) XtX[i][j] += X[l][i] * X[l][j]; }
    var inv = solve(XtX); if (!inv) return { error: 'collinear' };
    var b = inv.map(function (r) { return sum(r.map(function (v, j) { return v * Xty[j]; })); });
    var e = y.map(function (v, l) { return v - sum(X[l].map(function (x, j) { return x * b[j]; })); });
    var ssr = sum(e.map(function (v) { return v * v; })), my = mean(y), sst = sum(y.map(function (v) { return (v - my) * (v - my); }));
    var df = n - k, V;
    var sandwich = function (meat, scale) { return inv.map(function (r) { return inv[0].map(function (x, c) { var s = 0; for (var a = 0; a < k; a++) for (var bb = 0; bb < k; bb++) s += r[a] * meat[a][bb] * inv[bb][c]; return s * scale; }); }); };
    var meat = function () { return Array.apply(null, Array(k)).map(function () { return new Array(k).fill(0); }); };
    var G = 0;
    if (opts.se === 'hc1') {
      var M = meat(); for (l = 0; l < n; l++) for (i = 0; i < k; i++) for (j = 0; j < k; j++) M[i][j] += X[l][i] * X[l][j] * e[l] * e[l];
      V = sandwich(M, n / df);
    } else if (opts.se === 'cluster' && opts.cluster) {
      var by = new Map(); for (l = 0; l < n; l++) { var c = opts.cluster[l], s = by.get(c); if (!s) { s = new Array(k).fill(0); by.set(c, s); } for (i = 0; i < k; i++) s[i] += X[l][i] * e[l]; }
      var MC = meat(); by.forEach(function (s) { for (i = 0; i < k; i++) for (j = 0; j < k; j++) MC[i][j] += s[i] * s[j]; });
      G = by.size; V = sandwich(MC, (G / (G - 1)) * ((n - 1) / df)); df = G - 1;   // CR1, with G - 1 degrees of freedom (as Stata and fixest do)
    } else { var s2 = ssr / df; V = inv.map(function (r) { return r.map(function (v) { return v * s2; }); }); }
    var c95 = tCrit(df);
    return {
      n: n, k: k, df: df, clusters: G || undefined, r2: 1 - ssr / sst, adjR2: 1 - (ssr / (n - k)) / (sst / (n - 1)),
      coef: b.map(function (v, j) { var se = Math.sqrt(V[j][j]), t = v / se; return { name: names[j], b: v, se: se, t: t, p: tP(t, df), lo: v - c95 * se, hi: v + c95 * se }; })
    };
  }

  // ---------- from exported rows to a model ----------
  function isNum(v) { return v !== '' && v != null && typeof v !== 'boolean' && !Array.isArray(v) && isFinite(Number(v)); }
  function order(a, b) { return isNum(a) && isNum(b) ? a - b : a < b ? -1 : a > b ? 1 : 0; }
  // Which columns can be an outcome (numeric) or a predictor (numeric, or a category with up to 10 levels).
  function columns(rows) {
    var cols = {}, out = [];
    rows.forEach(function (r) { Object.keys(r).forEach(function (c) { cols[c] = 1; }); });
    Object.keys(cols).forEach(function (c) {
      var vals = rows.map(function (r) { return r[c]; }).filter(function (v) { return v !== '' && v != null && !(Array.isArray(v) && !v.length); });
      if (!vals.length) return;
      var numeric = vals.every(isNum), levels = {}; vals.forEach(function (v) { levels[String(v)] = 1; });
      var nl = Object.keys(levels).length;
      out.push({ name: c, n: vals.length, numeric: numeric, levels: nl, binary: numeric && nl <= 2 && vals.every(function (v) { return Number(v) === 0 || Number(v) === 1; }), category: nl >= 2 && nl <= 10 });
    });
    return out;
  }
  // Rows with an outcome and every predictor present; categories become indicator columns against a reference level:
  // the first in sorted order (numbers in numeric order), as R's factor() and Python's C() choose it, so the exported
  // code gives the same estimates. spec: { dv, iv, ivAs: 'category' | 'number', covs: [{ name, as }], cluster }
  function design(rows, spec) {
    var preds = [{ name: spec.iv, as: spec.ivAs }].concat(spec.covs || []);
    var use = rows.filter(function (r) { return isNum(r[spec.dv]) && preds.every(function (p) { return p.as === 'number' ? isNum(r[p.name]) : r[p.name] !== '' && r[p.name] != null; }); });
    var names = ['(Intercept)'], cols = [function () { return 1; }], refs = {};
    preds.forEach(function (p) {
      if (p.as === 'number') { names.push(p.name); cols.push(function (r) { return Number(r[p.name]); }); return; }
      var seen = {}; use.forEach(function (r) { seen[String(r[p.name])] = 1; });
      var lv = Object.keys(seen).sort(order);
      refs[p.name] = lv[0];
      lv.slice(1).forEach(function (v) { names.push(p.name + ' = ' + v); cols.push(function (r) { return String(r[p.name]) === v ? 1 : 0; }); });
    });
    return { y: use.map(function (r) { return Number(r[spec.dv]); }), X: use.map(function (r) { return cols.map(function (f) { return f(r); }); }), names: names, refs: refs, rows: use,
      cluster: spec.cluster ? use.map(function (r) { return r[spec.cluster]; }) : null, dropped: rows.length - use.length };
  }
  // Group summaries of the outcome by a category, in level order (numbers in numeric order).
  function groups(rows, dv, iv) {
    var by = {};
    rows.forEach(function (r) { if (!isNum(r[dv]) || r[iv] === '' || r[iv] == null) return; var k = String(r[iv]); (by[k] = by[k] || []).push(Number(r[dv])); });
    var keys = Object.keys(by).sort(order);
    return keys.map(function (k) { var d = describe(by[k]); d.level = k; d.values = by[k]; return d; });
  }

  var api = { lgamma: lgamma, ibeta: ibeta, tP: tP, fP: fP, tCrit: tCrit, mean: mean, variance: variance, describe: describe, welch: welch, anova: anova, ols: ols, solve: solve, columns: columns, design: design, groups: groups, isNum: isNum };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LabStats = api;
})(typeof window !== 'undefined' ? window : this);
