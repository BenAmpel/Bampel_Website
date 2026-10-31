// The Analyze tab's statistics (static/lab/engine/stats.js) against values computed in R 4 on the mtcars data:
// distribution tails, Welch's t-test, one-way ANOVA, and least squares with classical, HC1 and clustered (CR1) errors.
// R: 2*pt(-2,10); pf(3.5,2,20,lower.tail=FALSE); qt(.975,7); t.test(mpg~am); aov(mpg~factor(cyl)); lm(mpg~factor(cyl)+wt)
// with HC1 and CR1 (clusters: gear) computed from the sandwich formula.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const S = createRequire(import.meta.url)(fileURLToPath(new URL('../../static/lab/engine/stats.js', import.meta.url)));
const near = (a, b, tol, what) => assert(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs R ${b}`);

const R = { pt: 0.0733880347707404, pf: 0.0497350220760971, qt: 2.36462425159278, welch_t: -3.76712314514493, welch_df: 18.3322516384005, welch_p: 0.00137363833307103,
  anova_f: 39.697515255869, anova_p: 4.97891917440024e-09, b: [33.99079400913246, -4.25558240197129, -6.07085968049088, -3.20561325619286],
  se: [1.887793424567265, 1.386072847540691, 1.652287831535243, 0.753895654956412], hc1: [1.933193379769465, 1.205518444080186, 1.508570321694178, 0.657591879868045],
  cr1: [2.779735808816513, 0.551601087783056, 0.980929723327790, 0.899618760312595], r2: 0.837432525296922 };
const cars = [[21, 6, 2.62, 1, 4], [21, 6, 2.875, 1, 4], [22.8, 4, 2.32, 1, 4], [21.4, 6, 3.215, 0, 3], [18.7, 8, 3.44, 0, 3], [18.1, 6, 3.46, 0, 3], [14.3, 8, 3.57, 0, 3], [24.4, 4, 3.19, 0, 4],
  [22.8, 4, 3.15, 0, 4], [19.2, 6, 3.44, 0, 4], [17.8, 6, 3.44, 0, 4], [16.4, 8, 4.07, 0, 3], [17.3, 8, 3.73, 0, 3], [15.2, 8, 3.78, 0, 3], [10.4, 8, 5.25, 0, 3], [10.4, 8, 5.424, 0, 3],
  [14.7, 8, 5.345, 0, 3], [32.4, 4, 2.2, 1, 4], [30.4, 4, 1.615, 1, 4], [33.9, 4, 1.835, 1, 4], [21.5, 4, 2.465, 0, 3], [15.5, 8, 3.52, 0, 3], [15.2, 8, 3.435, 0, 3], [13.3, 8, 3.84, 0, 3],
  [19.2, 8, 3.845, 0, 3], [27.3, 4, 1.935, 1, 4], [26, 4, 2.14, 1, 5], [30.4, 4, 1.513, 1, 5], [15.8, 8, 3.17, 1, 5], [19.7, 6, 2.77, 1, 5], [15, 8, 3.57, 1, 5], [21.4, 4, 2.78, 1, 4]]
  .map(([mpg, cyl, wt, am, gear]) => ({ mpg, cyl: String(cyl), wt, am, gear: String(gear) }));

// distributions
near(S.tP(2, 10), R.pt, 1e-9, 'two-sided t p');
near(S.fP(3.5, 2, 20), R.pf, 1e-9, 'F upper tail');
near(S.tCrit(7), R.qt, 1e-8, 't critical value');
near(S.tP(0, 5), 1, 1e-12, 't = 0');

// Welch (am = 0 minus am = 1, as t.test orders the groups)
const w = S.welch(cars.filter(c => c.am === 0).map(c => c.mpg), cars.filter(c => c.am === 1).map(c => c.mpg));
near(w.t, R.welch_t, 1e-9, 'Welch t'); near(w.df, R.welch_df, 1e-9, 'Welch df'); near(w.p, R.welch_p, 1e-8, 'Welch p');

// one-way ANOVA
const g = S.groups(cars, 'mpg', 'cyl');
assert.deepEqual(g.map(x => x.level), ['4', '6', '8'], 'levels in numeric order');
const a = S.anova(g.map(x => x.values));
near(a.f, R.anova_f, 1e-9, 'ANOVA F'); near(a.p, R.anova_p, 1e-6, 'ANOVA p'); assert.equal(a.df1, 2); assert.equal(a.df2, 29);

// least squares: design() builds the same columns as R's model.matrix (reference = first level)
const spec = { dv: 'mpg', iv: 'cyl', ivAs: 'category', covs: [{ name: 'wt', as: 'number' }], cluster: 'gear' };
const d = S.design(cars, spec);
assert.deepEqual(d.names, ['(Intercept)', 'cyl = 6', 'cyl = 8', 'wt']); assert.equal(d.refs.cyl, '4'); assert.equal(d.dropped, 0);
for (const [mode, ref] of [['classical', R.se], ['hc1', R.hc1], ['cluster', R.cr1]]) {
  const m = S.ols(d.y, d.X, d.names, { se: mode, cluster: d.cluster });
  m.coef.forEach((c, j) => { near(c.b, R.b[j], 1e-9, `${mode} b ${c.name}`); near(c.se, ref[j], 1e-8, `${mode} SE ${c.name}`); });
  near(m.r2, R.r2, 1e-10, 'R squared');
  if (mode === 'cluster') { assert.equal(m.clusters, 3); assert.equal(m.df, 2); }
}

// edges: missing values are dropped, a constant predictor is reported, not crashed on
const messy = cars.slice(0, 10).map((c, i) => (i === 3 ? { ...c, mpg: '' } : i === 5 ? { ...c, wt: 'n/a' } : c));
const dm = S.design(messy, { dv: 'mpg', iv: 'am', ivAs: 'category', covs: [{ name: 'wt', as: 'number' }] });
assert.equal(dm.y.length, 8); assert.equal(dm.dropped, 2);
assert.equal(S.ols([1, 2, 3], [[1, 5], [1, 5], [1, 5]], ['(Intercept)', 'x']).error, 'collinear');
const cols = S.columns([{ a: '1', b: 'x', c: 1 }, { a: '2', b: 'y', c: 0 }, { a: '', b: 'x', c: 1 }]);
const col = n => cols.find(x => x.name === n);
assert(col('a').numeric && !col('b').numeric && col('c').binary && col('b').category, 'column kinds');
console.log('stats: ok');
