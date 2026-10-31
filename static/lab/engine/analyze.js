/* CCAIR Behavioral Lab: the Analyze tab. Pick an outcome (DV), what to compare it by (IV), covariates and a model; the
   numbers run in the browser (stats.js) on the same rows as the CSV downloads, real participants only, and come back as
   a sentence, tables, a chart, and R and Python code that reproduces them from the downloaded file. It is for looking,
   not for the paper: report the analysis you preregistered, run with the exported code. Loaded by admin.js. */
(function (root) {
  'use strict';
  var S = function () { return root.LabStats; };
  var SKIP_DV = /^(code|test|label|session|trial_index|self_signup|consented|finished|screened_out|returned|panel_.*|external_id|trace_version|.*_id)$/;

  function fmt(x, d) { if (x == null || !isFinite(x)) return '–'; var a = Math.abs(x); d = d == null ? (a >= 100 ? 1 : a >= 10 ? 2 : 3) : d; return Number(x).toFixed(d).replace(/^-0(\.0+)?$/, '0'); }
  function pfmt(p) { return !isFinite(p) ? '–' : p < 0.001 ? '< .001' : '= ' + p.toFixed(3).replace(/^0/, ''); }
  function rq(n) { return '`' + String(n).replace(/`/g, '') + '`'; }   // an R column name
  function pq(n) { return 'Q("' + String(n).replace(/"/g, '') + '")'; }   // a patsy column name

  // R and Python code that reproduces the analysis from the downloaded CSV.
  function code(spec, file) {
    var dv = spec.dv, iv = spec.iv, cat = spec.ivAs === 'category', covs = spec.covs || [], R = [], P = [];
    R.push('# ' + file + ', downloaded from the study admin (Participants → Download → ' + (spec.source === 'wide' ? 'Wide CSV' : 'Trials CSV') + ')');
    R.push('d <- read.csv("' + file + '")');
    R.push('d <- d[!(d$test %in% c(TRUE, 1, "true", "TRUE")), ]   # real participants only');
    if (spec.dqOnly) R.push('d <- d[is.na(d$dq_flags) | d$dq_flags == 0, ]   # leave out data-quality flags');
    P.push('# ' + file + ', downloaded from the study admin');
    P.push('import pandas as pd, statsmodels.formula.api as smf' + (spec.model === 'means' ? '\nfrom scipy import stats' : ''));
    P.push('d = pd.read_csv("' + file + '")');
    P.push('d = d[~d["test"].astype(str).str.lower().isin(["true", "1"])]  # real participants only');
    if (spec.dqOnly) P.push('d = d[d["dq_flags"].fillna(0) == 0]  # leave out data-quality flags');
    if (cat) R.push('d$' + rq(iv) + ' <- factor(d$' + rq(iv) + ')');
    covs.forEach(function (c) { if (c.as === 'category') R.push('d$' + rq(c.name) + ' <- factor(d$' + rq(c.name) + ')'); });
    var rhsR = [rq(iv)].concat(covs.map(function (c) { return rq(c.name); })).join(' + ');
    var rhsP = [cat ? 'C(' + pq(iv) + ')' : pq(iv)].concat(covs.map(function (c) { return c.as === 'category' ? 'C(' + pq(c.name) + ')' : pq(c.name); })).join(' + ');
    if (spec.model === 'means' && spec.levels === 2) {
      R.push('t.test(' + rq(dv) + ' ~ ' + rq(iv) + ', data = d)   # Welch');
      P.push('a, b = [g["' + dv + '"].dropna() for _, g in d.groupby("' + iv + '")]');
      P.push('print(stats.ttest_ind(a, b, equal_var=False))  # Welch');
    } else if (spec.model === 'means') {
      R.push('summary(aov(' + rq(dv) + ' ~ ' + rq(iv) + ', data = d))');
      P.push('print(stats.f_oneway(*[g["' + dv + '"].dropna() for _, g in d.groupby("' + iv + '")]))');
    } else {
      R.push('m <- lm(' + rq(dv) + ' ~ ' + rhsR + ', data = d)');
      P.push('m = smf.ols(\'' + pq(dv) + ' ~ ' + rhsP + '\', data=d)');
      if (spec.se === 'hc1') { R.push('lmtest::coeftest(m, vcov = sandwich::vcovHC(m, type = "HC1"))'); P.push('print(m.fit(cov_type="HC1").summary())'); }
      else if (spec.se === 'cluster') {
        R.push('lmtest::coeftest(m, vcov = sandwich::vcovCL(m, cluster = ~code, type = "HC1"))   # clustered by participant');
        P.push('print(m.fit(cov_type="cluster", cov_kwds={"groups": d.loc[m.data.row_labels, "code"]}).summary())');
        if (spec.source === 'trials') R.push('# A mixed model instead: lme4::lmer(' + rq(dv) + ' ~ ' + rhsR + ' + (1 | code)' + (spec.item ? ' + (1 | ' + rq(spec.item) + ')' : '') + ', data = d)');
      } else { R.push('summary(m)'); P.push('print(m.fit().summary())'); }
    }
    return { r: R.join('\n'), py: P.join('\n') };
  }

  // Means with 95% intervals over the raw points (a category), or a scatter with the fitted line (a number). SVG.
  function chart(data, spec, esc) {
    var W = 680, H = 340, L = 64, Rm = 18, T = 18, B = 56, w = W - L - Rm, h = H - T - B, out = [];
    var ys = data.points.map(function (p) { return p.y; }).concat(data.groups ? [].concat.apply([], data.groups.map(function (g) { return g.values.concat([g.lo, g.hi]); })) : []).filter(isFinite);
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys); if (lo === hi) { lo -= 1; hi += 1; }
    var tick = nice((hi - lo) / 5), y0 = Math.floor(lo / tick) * tick, y1 = Math.ceil(hi / tick) * tick, Y = function (v) { return T + h - (v - y0) / (y1 - y0) * h; };
    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="an-chart" role="img" aria-label="' + esc(spec.dv + ' by ' + spec.iv) + '" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, Segoe UI, Lato, sans-serif">');
    out.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>');
    for (var v = y0; v <= y1 + tick / 2; v += tick) out.push('<line x1="' + L + '" x2="' + (W - Rm) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#e6e9ef"/><text x="' + (L - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="12" fill="#5b6375">' + esc(fmt(v, tick < 1 ? 2 : 0)) + '</text>');
    out.push('<text transform="translate(16 ' + (T + h / 2) + ') rotate(-90)" text-anchor="middle" font-size="13" fill="#1d2230">' + esc(spec.dv) + '</text>');
    if (data.groups) {
      var n = data.groups.length, step = w / n;
      data.groups.forEach(function (g, i) {
        var cx = L + step * (i + 0.5), col = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#F0E442'][i % 8];
        g.values.forEach(function (y, k) { var jx = cx + ((k * 0.6180339887 % 1) - 0.5) * Math.min(60, step * 0.5); out.push('<circle cx="' + jx.toFixed(1) + '" cy="' + Y(y).toFixed(1) + '" r="3" fill="' + col + '" fill-opacity="' + (g.values.length > 200 ? 0.12 : 0.28) + '"/>'); });
        out.push('<line x1="' + cx + '" x2="' + cx + '" y1="' + Y(g.lo) + '" y2="' + Y(g.hi) + '" stroke="#1d2230" stroke-width="2.5"/><line x1="' + (cx - 10) + '" x2="' + (cx + 10) + '" y1="' + Y(g.lo) + '" y2="' + Y(g.lo) + '" stroke="#1d2230" stroke-width="2.5"/><line x1="' + (cx - 10) + '" x2="' + (cx + 10) + '" y1="' + Y(g.hi) + '" y2="' + Y(g.hi) + '" stroke="#1d2230" stroke-width="2.5"/>');
        out.push('<circle cx="' + cx + '" cy="' + Y(g.mean) + '" r="7" fill="' + col + '" stroke="#ffffff" stroke-width="2"/>');
        out.push('<text x="' + cx + '" y="' + (H - B + 20) + '" text-anchor="middle" font-size="13" fill="#1d2230">' + esc(g.level.length > 18 ? g.level.slice(0, 17) + '…' : g.level) + '</text><text x="' + cx + '" y="' + (H - B + 36) + '" text-anchor="middle" font-size="11" fill="#5b6375">n = ' + g.n + '</text>');
      });
      out.push('<text x="' + (L + w) + '" y="' + (H - 6) + '" text-anchor="end" font-size="11" fill="#5b6375">Mean and 95% CI; dots are ' + (spec.source === 'wide' ? 'participants' : 'trials') + '</text>');
    } else {
      var xs = data.points.map(function (p) { return p.x; }), xl = Math.min.apply(null, xs), xh = Math.max.apply(null, xs); if (xl === xh) { xl -= 1; xh += 1; }
      var X = function (v) { return L + (v - xl) / (xh - xl) * w; }, xt = nice((xh - xl) / 5);
      for (var u = Math.ceil(xl / xt) * xt; u <= xh; u += xt) out.push('<text x="' + X(u) + '" y="' + (H - B + 20) + '" text-anchor="middle" font-size="12" fill="#5b6375">' + esc(fmt(u, xt < 1 ? 2 : 0)) + '</text>');
      data.points.forEach(function (p) { out.push('<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="3" fill="#0072B2" fill-opacity="' + (data.points.length > 300 ? 0.15 : 0.35) + '"/>'); });
      if (data.line) out.push('<line x1="' + X(xl) + '" y1="' + Y(data.line.a + data.line.b * xl) + '" x2="' + X(xh) + '" y2="' + Y(data.line.a + data.line.b * xh) + '" stroke="#D55E00" stroke-width="3"/>');
      out.push('<text x="' + (L + w / 2) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="13" fill="#1d2230">' + esc(spec.iv) + '</text>');
    }
    out.push('</svg>');
    return out.join('');
  }
  function nice(x) { var e = Math.pow(10, Math.floor(Math.log10(x || 1))), f = x / e; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e; }

  // Run one specification: { source, dv, iv, ivAs, covs, model: 'means' | 'ols', se, dqOnly, item }.
  function run(rows, spec) {
    var st = S(), use = spec.dqOnly ? rows.filter(function (r) { return !(Number(r.dq_flags) > 0); }) : rows, out = { spec: spec, n: 0 };
    if (spec.ivAs === 'category') {
      out.groups = st.groups(use, spec.dv, spec.iv); spec.levels = out.groups.length;
      if (out.groups.length < 2) return { error: spec.iv + ' has only one level with an outcome. Choose another comparison.' };
      if (out.groups.some(function (g) { return g.n < 2; })) return { error: 'Every group needs at least two values of ' + spec.dv + '.' };
      out.points = [];
    }
    if (spec.model === 'means' && spec.ivAs === 'category' && !(spec.covs || []).length) {
      out.n = out.groups.reduce(function (n, g) { return n + g.n; }, 0);
      if (out.groups.length === 2) out.welch = st.welch(out.groups[0].values, out.groups[1].values); else out.anova = st.anova(out.groups.map(function (g) { return g.values; }));
      return out;
    }
    var d = st.design(use, { dv: spec.dv, iv: spec.iv, ivAs: spec.ivAs, covs: spec.covs, cluster: spec.se === 'cluster' ? 'code' : null });
    if (d.y.length < d.names.length + 2) return { error: 'Too few complete rows (' + d.y.length + ') for ' + d.names.length + ' estimates.' };
    var m = st.ols(d.y, d.X, d.names, { se: spec.se, cluster: d.cluster });
    if (m.error) return { error: 'Two predictors carry the same information (or one never varies). Drop a covariate.' };
    out.ols = m; out.refs = d.refs; out.n = d.y.length; out.dropped = d.dropped;
    if (spec.ivAs === 'number') {
      out.points = d.rows.map(function (r) { return { x: Number(r[spec.iv]), y: Number(r[spec.dv]) }; });
      var simple = st.ols(out.points.map(function (p) { return p.y; }), out.points.map(function (p) { return [1, p.x]; }), ['a', 'b']);
      if (!simple.error) out.line = { a: simple.coef[0].b, b: simple.coef[1].b };
    }
    return out;
  }
  // The result in one or two sentences.
  function sentence(res) {
    var s = res.spec, w = res.welch, a = res.anova, m = res.ols, g = res.groups;
    if (w) return 'Mean ' + s.dv + ' was ' + fmt(g[0].mean) + ' for ' + g[0].level + ' and ' + fmt(g[1].mean) + ' for ' + g[1].level + ': a difference of ' + fmt(w.diff) + ' (95% CI ' + fmt(w.lo) + ' to ' + fmt(w.hi) + '), Welch t(' + fmt(w.df, 1) + ') = ' + fmt(w.t, 2) + ', p ' + pfmt(w.p) + ', d = ' + fmt(w.d, 2) + '.';
    if (a) return 'Mean ' + s.dv + ' differed across the ' + g.length + ' levels of ' + s.iv + ' by F(' + a.df1 + ', ' + a.df2 + ') = ' + fmt(a.f, 2) + ', p ' + pfmt(a.p) + ', η² = ' + fmt(a.eta2, 3) + '. Group means are in the table.';
    var key = m.coef.filter(function (c) { return c.name === s.iv || c.name.indexOf(s.iv + ' = ') === 0; });
    var adj = (s.covs || []).length ? 'Holding ' + s.covs.map(function (c) { return c.name; }).join(', ') + ' constant, ' : '';
    if (s.ivAs === 'number' && key[0]) return adj + 'each one-unit increase in ' + s.iv + ' goes with a change of ' + fmt(key[0].b) + ' in ' + s.dv + ' (95% CI ' + fmt(key[0].lo) + ' to ' + fmt(key[0].hi) + ', p ' + pfmt(key[0].p) + ').';
    return (adj ? adj + 'compared' : 'Compared') + ' with ' + s.iv + ' = ' + res.refs[s.iv] + ': ' + key.map(function (c) { return c.name.slice(s.iv.length + 3) + ' ' + (c.b >= 0 ? '+' : '') + fmt(c.b) + ' (95% CI ' + fmt(c.lo) + ' to ' + fmt(c.hi) + ', p ' + pfmt(c.p) + ')'; }).join('; ') + '.';
  }

  function mountTab(sec, api) {
    var esc = api.esc, data = { wide: null, trials: null }, cols = [], last = null;
    sec.innerHTML = '<p class="muted">A first look at the data, in the browser: pick an outcome, what to compare it by, and a model. It uses the same rows as the downloads, real participants only. Use it to explore; for the paper, run the analysis you preregistered with the R or Python code below.</p>' +
      '<div class="an-grid"><div class="an-controls">' +
        '<div class="f"><span>Rows</span><div class="ptseg" role="radiogroup" aria-label="Rows" id="an-src"><button type="button" role="radio" data-src="wide" aria-checked="true">One per participant</button><button type="button" role="radio" data-src="trials" aria-checked="false" tabindex="-1">One per trial</button></div></div>' +
        '<div class="row"><button type="button" id="an-load">Load data</button><span class="muted" id="an-prog" role="status"></span></div>' +
        '<div id="an-form" hidden>' +
          '<label class="f">Outcome (DV)<select id="an-dv"></select></label>' +
          '<label class="f">Compare by (IV)<select id="an-iv"></select></label>' +
          '<label class="f check" id="an-ivnum-wrap"><input type="checkbox" id="an-ivnum"> Treat as a number (a slope), not as groups</label>' +
          '<div class="f"><span>Adjust for (covariates)</span><div class="an-covs" id="an-covs"></div></div>' +
          '<div class="f"><span>Model</span><div class="ptseg" role="radiogroup" aria-label="Model" id="an-model"><button type="button" role="radio" data-model="means" aria-checked="true">Compare means</button><button type="button" role="radio" data-model="ols" aria-checked="false" tabindex="-1">Regression</button></div></div>' +
          '<label class="f">Standard errors<select id="an-se"><option value="hc1">Robust (HC1)</option><option value="classical">Classical</option><option value="cluster">Clustered by participant</option></select></label>' +
          '<label class="f check" id="an-dq-wrap"><input type="checkbox" id="an-dq"> Leave out participants with data-quality flags</label>' +
        '</div></div>' +
        '<div class="an-results" id="an-out" aria-live="polite"><p class="muted">Load the data to start.</p></div></div>';
    var $ = function (id) { return sec.querySelector('#' + id); }, src = 'wide', model = 'means';
    function seg(id, attr, val) { $(id).querySelectorAll('[' + attr + ']').forEach(function (b) { var on = b.getAttribute(attr) === val; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); }
    $('an-src').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-src]'); if (!b) return; src = b.getAttribute('data-src'); seg('an-src', 'data-src', src); if (data[src]) setup(); else { $('an-form').hidden = true; $('an-out').innerHTML = '<p class="muted">Load the data to start.</p>'; } });
    $('an-model').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-model]'); if (!b) return; model = b.getAttribute('data-model'); seg('an-model', 'data-model', model); go(); });
    $('an-load').addEventListener('click', function () {
      $('an-load').disabled = true; api.err();
      api.getJSON('codes').then(function (list) {
        var codes = list.filter(function (p) { return !p.test; }).map(function (p) { return p.code; });
        if (!codes.length) throw new Error('No real participants yet.');
        return api.rowsFor(codes, src, function (f) { $('an-prog').textContent = 'Loading… ' + Math.round(f * 100) + '%'; });
      }).then(function (rows) { data[src] = rows.filter(function (r) { return !(r.test === true || r.test === 1 || r.test === 'true'); }); $('an-prog').textContent = data[src].length + ' rows.'; setup(); })
        .catch(function (e) { api.err(e.message); $('an-prog').textContent = ''; }).then(function () { $('an-load').disabled = false; });
    });
    function setup() {
      var rows = data[src]; cols = S().columns(rows);
      var dvs = cols.filter(function (c) { return c.numeric && !SKIP_DV.test(c.name) && c.levels > 1; }), ivs = cols.filter(function (c) { return (c.category || c.numeric) && c.name !== 'code' && c.name !== 'test' && c.levels > 1; });
      if (!dvs.length) { $('an-out').innerHTML = '<p class="muted">No numeric outcomes in these rows yet.</p>'; return; }
      var pref = ['correct', 'final_confidence', 'rt_ms', 'score', 'dq_flags'], dv0 = (pref.map(function (p) { return dvs.filter(function (c) { return c.name === p; })[0]; }).filter(Boolean)[0] || dvs[0]).name;
      $('an-dv').innerHTML = dvs.map(function (c) { return '<option' + (c.name === dv0 ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
      var iv0 = ivs.some(function (c) { return c.name === 'condition'; }) ? 'condition' : (ivs[0] || {}).name;
      $('an-iv').innerHTML = ivs.map(function (c) { return '<option' + (c.name === iv0 ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
      $('an-covs').innerHTML = ivs.slice(0, 60).map(function (c) { return '<label class="check"><input type="checkbox" data-cov="' + esc(c.name) + '"> ' + esc(c.name) + '</label>'; }).join('');
      $('an-se').value = src === 'trials' ? 'cluster' : 'hc1';
      $('an-dq-wrap').hidden = !cols.some(function (c) { return c.name === 'dq_flags'; });
      $('an-form').hidden = false; ivKind(); go();
    }
    function col(n) { return cols.filter(function (c) { return c.name === n; })[0] || {}; }
    function ivKind() { var c = col($('an-iv').value); $('an-ivnum-wrap').hidden = !(c.numeric && c.category); $('an-ivnum').checked = c.numeric && !c.category; }
    ['an-dv', 'an-se', 'an-dq', 'an-ivnum'].forEach(function (id) { $(id).addEventListener('change', go); });
    $('an-iv').addEventListener('change', function () { ivKind(); go(); });
    $('an-covs').addEventListener('change', go);
    function go() {
      if (!data[src]) return;
      var iv = $('an-iv').value, dv = $('an-dv').value;
      var covs = [].slice.call($('an-covs').querySelectorAll('[data-cov]:checked')).map(function (b) { var n = b.getAttribute('data-cov'), c = col(n); return { name: n, as: c.numeric && !c.category ? 'number' : 'category' }; })
        .filter(function (c) { return c.name !== iv && c.name !== dv; });
      var spec = { source: src, dv: dv, iv: iv, ivAs: $('an-ivnum').checked ? 'number' : 'category', covs: covs, model: model, se: $('an-se').value, dqOnly: $('an-dq').checked && !$('an-dq-wrap').hidden, item: src === 'trials' && cols.some(function (c) { return c.name === 'item_id'; }) ? 'item_id' : null };
      // Trials are nested in participants: comparing trial means as if they were independent overstates the evidence, so
      // trial rows are always compared by regression with participant-clustered standard errors.
      if (spec.ivAs === 'number' || covs.length || src === 'trials') spec.model = 'ols';
      if (src === 'trials' && spec.se !== 'cluster') { spec.se = 'cluster'; $('an-se').value = 'cluster'; }
      $('an-se').disabled = src === 'trials';
      $('an-model').querySelector('[data-model="means"]').disabled = src === 'trials';
      if (spec.model !== model) seg('an-model', 'data-model', spec.model);
      var res = iv === dv ? { error: 'The outcome and the comparison are the same column.' } : run(data[src], spec);
      last = res; render(res);
    }
    function render(res) {
      if (res.error) { $('an-out').innerHTML = '<p class="error">' + esc(res.error) + '</p>'; return; }
      var s = res.spec, file = api.studyId + '_' + (s.source === 'wide' ? 'wide' : 'trials') + '_' + api.day() + '.csv', c = code(s, file), h = '';
      h += '<p class="an-sentence">' + esc(sentence(res)) + '</p>';
      if (s.source === 'trials') h += '<p class="muted an-meta">Each participant gave several trials, so these are compared by regression with standard errors clustered by participant. For a mixed model, use the R code below.</p>';
      h += '<p class="muted an-meta">' + res.n + ' ' + (s.source === 'wide' ? 'participants' : 'trials') + (res.dropped ? ' (' + res.dropped + ' rows left out for missing values)' : '') +
        (res.ols && res.ols.clusters ? '; standard errors clustered by participant (' + res.ols.clusters + ' participants)' : res.ols ? '; ' + (s.se === 'hc1' ? 'robust (HC1)' : 'classical') + ' standard errors' : '') + (s.dqOnly ? '; flagged participants left out' : '') + '.</p>';
      h += '<div class="an-chartbox">' + chart(res, s, esc) + '</div>';
      if (res.groups) h += '<div class="table-wrap"><table class="an-tbl"><tr><th>' + esc(s.iv) + '</th><th>n</th><th>Mean</th><th>SD</th><th>95% CI</th></tr>' + res.groups.map(function (g) { return '<tr><td>' + esc(g.level) + '</td><td class="num">' + g.n + '</td><td class="num">' + fmt(g.mean) + '</td><td class="num">' + fmt(g.sd) + '</td><td class="num">' + fmt(g.lo) + ' to ' + fmt(g.hi) + '</td></tr>'; }).join('') + '</table></div>';
      if (res.ols) h += '<div class="table-wrap"><table class="an-tbl"><tr><th>Term</th><th>Estimate</th><th>SE</th><th>t</th><th>p</th><th>95% CI</th></tr>' + res.ols.coef.map(function (k) { return '<tr><td>' + esc(k.name) + '</td><td class="num">' + fmt(k.b) + '</td><td class="num">' + fmt(k.se) + '</td><td class="num">' + fmt(k.t, 2) + '</td><td class="num">' + esc(pfmt(k.p).replace('= ', '')) + '</td><td class="num">' + fmt(k.lo) + ' to ' + fmt(k.hi) + '</td></tr>'; }).join('') + '</table></div><p class="muted an-meta">R² = ' + fmt(res.ols.r2, 3) + ', adjusted ' + fmt(res.ols.adjR2, 3) + '.' + (Object.keys(res.refs).length ? ' Reference levels: ' + Object.keys(res.refs).map(function (k) { return k + ' = ' + res.refs[k]; }).join(', ') + '.' : '') + '</p>';
      h += '<div class="row"><button type="button" class="secondary small" id="an-png">Save chart (PNG)</button><button type="button" class="secondary small" id="an-csv">Download results (CSV)</button></div>';
      h += '<details class="an-code" open><summary>Reproduce it</summary><div class="an-codes"><div><div class="an-codehead"><b>R</b><button type="button" class="secondary small" data-copy="r">Copy</button></div><pre><code>' + esc(c.r) + '</code></pre></div><div><div class="an-codehead"><b>Python</b><button type="button" class="secondary small" data-copy="py">Copy</button></div><pre><code>' + esc(c.py) + '</code></pre></div></div></details>';
      $('an-out').innerHTML = h; res.code = c;
    }
    $('an-out').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b || !last || last.error) return;
      var which = b.getAttribute('data-copy');
      if (which) { var txt = last.code[which]; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); }, function () { api.err('Copy did not work here; select the code and copy it.'); }); return; }
      var base = api.studyId + '_' + last.spec.dv + '_by_' + last.spec.iv;
      if (b.id === 'an-png') {
        var svg = $('an-out').querySelector('svg'), img = new Image(), url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
        img.onload = function () { var cv = document.createElement('canvas'); cv.width = 1360; cv.height = 680; cv.getContext('2d').drawImage(img, 0, 0, 1360, 680); URL.revokeObjectURL(url); cv.toBlob(function (bl) { api.saveFile(bl, base + '.png'); }, 'image/png'); };
        img.src = url;
      }
      if (b.id === 'an-csv') {
        var lines = [['section', 'term', 'n', 'estimate', 'se', 'stat', 'df', 'p', 'ci_low', 'ci_high']];
        (last.groups || []).forEach(function (g) { lines.push(['group mean', g.level, g.n, g.mean, g.sd, '', '', '', g.lo, g.hi]); });
        if (last.welch) lines.push(['welch t', last.groups[0].level + ' - ' + last.groups[1].level, last.n, last.welch.diff, last.welch.se, last.welch.t, last.welch.df, last.welch.p, last.welch.lo, last.welch.hi]);
        if (last.anova) lines.push(['anova F', last.spec.iv, last.n, last.anova.eta2, '', last.anova.f, last.anova.df1 + ';' + last.anova.df2, last.anova.p, '', '']);
        if (last.ols) last.ols.coef.forEach(function (k) { lines.push(['ols ' + last.spec.se, k.name, last.ols.n, k.b, k.se, k.t, last.ols.df, k.p, k.lo, k.hi]); });
        api.saveFile(lines.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n') + '\n', base + '_results.csv', 'text/csv');
      }
    });
  }

  root.LabAnalyze = { mountTab: mountTab, run: run, code: code, sentence: sentence, chart: chart };
})(typeof window !== 'undefined' ? window : this);
