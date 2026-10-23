/* CCAIR Behavioral Lab: survey display logic and piped text for the browser.
   Mirrors netlify/lib/lab/logic.mjs (the server enforces the same rules when it saves answers);
   tests/lab/display-logic.test.mjs runs both against one table of cases. Exposes window.LabLogic.
   Rules are described in static/lab/README.md ("Survey logic"). */
(function (root) {
  'use strict';
  var PIPE_SRC = '\\{\\{(q|ed):([a-z][a-z0-9_]{0,40})\\}\\}';
  function isAnswered(v) { return Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== ''; }
  function own(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
  function num(v) { var t = String(v).trim().replace(/,/g, ''), n = Number(t); return t !== '' && isFinite(n) ? n : null; }
  function strs(a) { return a.map(String); }

  function test(op, have, want) {
    var ans = isAnswered(have), arr = Array.isArray(have);
    if (op === 'answered') return ans;
    if (op === 'notAnswered') return !ans;
    var h = !ans ? null : arr ? strs(have) : String(have);
    function inList() {
      var w = strs(Array.isArray(want) ? want : [want]);
      return ans && (arr ? h.some(function (x) { return w.indexOf(x) >= 0; }) : w.indexOf(h) >= 0);
    }
    switch (op) {
      case 'eq': return ans && (arr ? h.indexOf(String(want)) >= 0 : h === String(want));
      case 'neq': return !(ans && (arr ? h.indexOf(String(want)) >= 0 : h === String(want)));
      case 'in': return inList();
      case 'notIn': return !inList();
      case 'gt': case 'gte': case 'lt': case 'lte':
        if (!ans || arr) return false;
        var a = num(h), b = num(want);
        if (a == null || b == null) return false;
        return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
    }
    return false;
  }

  // env: { answers, ed, condition }
  function evalDisplay(node, env) {
    env = env || {};
    if (!node || typeof node !== 'object') return true;
    if (Array.isArray(node.all)) return node.all.every(function (n) { return evalDisplay(n, env); });
    if (Array.isArray(node.any)) return node.any.some(function (n) { return evalDisplay(n, env); });
    if ('const' in node) return !!node.const;
    if (node.q != null) return test(node.op, own(env.answers, node.q), node.value);
    if (node.ed != null) return test(node.op, own(env.ed, node.ed), node.value);
    if (node.condition != null) return node.op === 'neq' ? env.condition !== node.condition : env.condition === node.condition;
    return true;
  }

  function orderItems(items) {
    return (items || []).map(function (it, i) { return [it, i]; })
      .sort(function (a, b) { return ((a[0].page || 1) - (b[0].page || 1)) || (a[1] - b[1]); })
      .map(function (x) { return x[0]; });
  }

  // A hidden question loses its answer before later questions are evaluated. `seed`: answers from earlier pages.
  function resolve(items, answers, env, seed) {
    env = env || {};
    var kept = {}, hidden = {}, k;
    for (k in (seed || {})) kept[k] = seed[k];
    orderItems(items).forEach(function (it) {
      if (!evalDisplay(it.displayIf, { answers: kept, ed: env.ed, condition: env.condition })) { hidden[it.id] = true; return; }
      if (it.type !== 'info' && answers && own(answers, it.id) !== undefined) kept[it.id] = answers[it.id];
      if (it.type === 'matrix' && answers) (it.rows || []).forEach(function (r) { if (own(answers, r.id) !== undefined) kept[r.id] = answers[r.id]; });   // each row is a variable
    });
    return { hidden: hidden, answers: kept };
  }

  var WORD = { eq: 'is', neq: 'is not', 'in': 'is one of', notIn: 'is not one of', gt: 'is greater than', gte: 'is at least', lt: 'is less than', lte: 'is at most', answered: 'was answered', notAnswered: 'was not answered' };
  function describe(node, items) {
    var byId = {};
    (items || []).forEach(function (i) { byId[i.id] = i; });
    function one(q, x) {
      var it = q && byId[q], o = null;
      if (it && it.options) it.options.forEach(function (p) { if (p.value === String(x)) o = p; });
      return '"' + (o ? o.label : x) + '"';
    }
    function val(q, v) { return Array.isArray(v) ? v.map(function (x) { return one(q, x); }).join(', ') : one(q, v); }
    function leaf(n) {
      if (n.condition != null) return "the participant's condition " + (n.op === 'neq' ? 'is not' : 'is') + ' "' + n.condition + '"';
      if ('const' in n) return n.const ? 'always' : 'never';
      var subject = n.q != null ? n.q : 'embedded data ' + n.ed, it = n.q != null ? byId[n.q] : null, w = WORD[n.op] || n.op;
      if (it && it.type === 'multi') w = n.op === 'eq' ? 'includes' : n.op === 'neq' ? 'does not include' : n.op === 'in' ? 'includes any of' : n.op === 'notIn' ? 'includes none of' : w;
      if (n.op === 'answered' || n.op === 'notAnswered') return subject + ' ' + w;
      return subject + ' ' + w + ' ' + (n.q != null ? val(n.q, n.value) : Array.isArray(n.value) ? n.value.map(function (x) { return '"' + x + '"'; }).join(', ') : '"' + n.value + '"');
    }
    function walk(n, top) {
      if (!n) return 'always';
      var kids = n.all || n.any;
      if (!kids) return leaf(n);
      var s = kids.map(function (k) { return walk(k, false); }).join(n.all ? ' and ' : ' or ');
      return top || kids.length < 2 ? s : '(' + s + ')';
    }
    return walk(node, true);
  }

  function fillPipes(text, lookup) {
    return String(text == null ? '' : text).replace(new RegExp(PIPE_SRC, 'g'), function (m, kind, name) { var v = lookup(kind, name); return String(v == null ? '' : v); });
  }

  var api = { isAnswered: isAnswered, evalDisplay: evalDisplay, orderItems: orderItems, resolve: resolve, describe: describe, fillPipes: fillPipes };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LabLogic = api;
})(typeof window !== 'undefined' ? window : this);
