/* CCAIR Behavioral Lab: the survey designer. A start- or end-of-session survey drawn exactly as participants see it
   (the participant page's own markup and stylesheets, in a shadow root so the admin styles cannot reach it) and edited
   in place: type into any question, option, or label; "+" between questions inserts one of every question type or a
   page break; drag the handle, or press Option and an arrow key, to reorder; Command-Z undoes. It edits the same draft
   as the question list (admin.js), so saving, versions, and validation are unchanged. The participant markup is
   mirrored from participant.js (questionHtml); tests/lab/canvas.test.mjs checks that the two stay the same.
   Loaded by admin.js when a survey tab is shown in Design view. */
(function (root) {
  'use strict';

  var AGREE7 = ['Strongly disagree', 'Disagree', 'Somewhat disagree', 'Neither agree nor disagree', 'Somewhat agree', 'Agree', 'Strongly agree'];
  var AGREE5 = ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'];
  // What the "+" menu offers, in the order people reach for them. Two entries share the text type (short and long answer).
  var KINDS = [
    { id: 'choice', type: 'choice', label: 'Multiple choice', hint: 'One answer from a list' },
    { id: 'multi', type: 'multi', label: 'Checkboxes', hint: 'Select all that apply' },
    { id: 'scale', type: 'scale', label: 'Rating scale', hint: 'Agree to disagree, 2 to 11 points' },
    { id: 'matrix', type: 'matrix', label: 'Matrix', hint: 'Several statements, same answers' },
    { id: 'short', type: 'text', long: false, label: 'Short answer', hint: 'One line of text' },
    { id: 'long', type: 'text', long: true, label: 'Paragraph', hint: 'A longer written answer' },
    { id: 'number', type: 'number', label: 'Number', hint: 'A typed number' },
    { id: 'select', type: 'select', label: 'Dropdown', hint: 'One answer from a long list' },
    { id: 'slider', type: 'slider', label: 'Slider', hint: 'Any range, no starting point' },
    { id: 'confidence', type: 'confidence', label: 'Confidence line', hint: '0 to 100, no starting point' },
    { id: 'rank', type: 'rank', label: 'Ranking', hint: 'Put options in order' },
    { id: 'info', type: 'info', label: 'Text block', hint: 'Instructions, no answer' }
  ];
  // Small line icons (24-unit grid, drawn with currentColor), in the spirit of SF Symbols.
  var P = {
    choice: '<circle cx="7" cy="8" r="2.5"/><path d="M12 8h8"/><circle cx="7" cy="16" r="2.5"/><path d="M12 16h8"/>',
    multi: '<rect x="4.5" y="5.5" width="5" height="5" rx="1.2"/><path d="m5.8 8 1.2 1.2 2-2.4M13 8h7"/><rect x="4.5" y="13.5" width="5" height="5" rx="1.2"/><path d="M13 16h7"/>',
    scale: '<circle cx="5" cy="12" r="1.8"/><circle cx="10" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="20" cy="12" r="1.8" fill="currentColor"/>',
    matrix: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M3.5 14.5h17M10 4.5v15"/>',
    short: '<rect x="3.5" y="8.5" width="17" height="7" rx="2"/><path d="M7 12h5"/>',
    long: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M7 9h10M7 12.5h10M7 16h6"/>',
    number: '<path d="M9 4 7 20M17 4l-2 16M4.5 9h15M3.5 15h15"/>',
    select: '<rect x="3.5" y="7.5" width="17" height="9" rx="2.5"/><path d="m14 11 2 2 2-2M7 12h4"/>',
    slider: '<path d="M4 12h16"/><circle cx="14" cy="12" r="3" fill="currentColor"/>',
    confidence: '<path d="M4 15h16M4 12.5v5M20 12.5v5"/><path d="M9 9.5h6"/>',
    rank: '<path d="M4 6.5h3M4 12h3M4 17.5h3M10 6.5h10M10 12h10M10 17.5h10"/>',
    info: '<path d="M5 6h14M5 10.5h14M5 15h9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>',
    dup: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4.5 7h15M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M6.5 7l.8 11.3c.1 1 .9 1.7 1.9 1.7h5.6c1 0 1.8-.7 1.9-1.7L17.5 7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    chev: '<path d="m8 10 4 4 4-4"/>', up: '<path d="m7 14 5-5 5 5"/>', down: '<path d="m7 10 5 5 5-5"/>',
    brk: '<path d="M4 12h3M10.5 12h3M17 12h3"/><path d="M8 7.5V4.5h8v3M8 16.5v3h8v-3"/>',
    undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H12"/>', redo: '<path d="m15 7 4.5 4.5L15 16"/><path d="M19 11.5H9.5a5 5 0 0 0 0 10H12"/>',
    desktop: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>', phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M11 18.5h2"/>',
    x: '<path d="m7 7 10 10M17 7 7 17"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>', eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    play: '<path d="M7.5 5.5v13l11-6.5z"/>', alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>'
  };
  function icon(name, size) {
    return '<svg class="lc-ic" viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || '') + '</svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // A whole number in range. The draft can hold content the server has not validated yet (an imported file loaded
  // into the editor), so numbers drawn into markup or loops are coerced here, never trusted.
  function int(v, lo, hi, d) { v = Math.floor(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  var MAXTEXT = 5000;   // the longest text kept from a field (the server's own limits are lower); also bounds the regexes
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function kindOf(it) { return it.type === 'text' ? (it.long === false ? 'short' : 'long') : it.type; }
  function kindLabel(it) { var k = kindOf(it); return (KINDS.filter(function (x) { return x.id === k; })[0] || { label: it.type }).label; }

  // ---------- the model: pages ----------
  // Questions with the same "page" number are shown together, pages in ascending order (participant.js surveyPage).
  // The designer keeps the list in that order and numbers pages 1..n, writing "page" only from page 2 on.
  function toPages(list) {
    var keys = [], by = Object.create(null);
    list.forEach(function (it) { var k = int(it.page, 1, 1e6, 1); if (!by[k]) { by[k] = []; keys.push(k); } by[k].push(it); });
    keys.sort(function (a, b) { return a - b; });
    return keys.map(function (k) { return by[k]; });
  }
  function fromPages(list, pages) {
    var flat = [];
    pages.filter(function (p) { return p.length; }).forEach(function (p, n) { p.forEach(function (it) { if (n) it.page = n + 1; else delete it.page; flat.push(it); }); });
    list.splice.apply(list, [0, list.length].concat(flat));
    return list;
  }
  function inOrder(list) { var flat = [].concat.apply([], toPages(list)); return flat.every(function (it, i) { return it === list[i]; }); }
  function locate(pages, i) { for (var p = 0; p < pages.length; p++) { if (i < pages[p].length) return [p, i]; i -= pages[p].length; } return null; }
  function indexOf(pages, p, k) { var n = 0; for (var x = 0; x < p; x++) n += pages[x].length; return n + k; }
  function uniqueId(list, base) {
    var taken = Object.create(null); list.forEach(function (it) { taken[it.id] = 1; (it.rows || []).forEach(function (r) { taken[r.id] = 1; }); });
    base = String(base || 'q').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z]+/, '').slice(0, 30) || 'q';
    if (!taken[base] && base !== 'q') return base;
    for (var n = 1; ; n++) if (!taken[base + n]) return base + n;
  }
  // The defaults a question gets when it becomes a type (admin.js applyEdit does the same for the Type dropdown).
  function convert(it, kind) {
    var k = KINDS.filter(function (x) { return x.id === kind; })[0] || { type: kind };
    it.type = k.type;
    if (k.type === 'text') it.long = k.long; else delete it.long;
    if (it.type === 'info') it.required = false;
    if (it.type === 'scale' && !it.n) { it.n = 7; it.lo = AGREE7[0]; it.hi = AGREE7[6]; it.labels = AGREE7.slice(); }
    if (/^(choice|select|multi|rank)$/.test(it.type) && !(it.options && it.options.length)) it.options = [1, 2, 3].map(function (n) { return { value: 'Option ' + n, label: 'Option ' + n }; });
    if (it.type === 'slider' && it.min == null) { it.min = 0; it.max = 100; it.step = 1; }
    if (it.type === 'matrix') {
      if (!(it.rows && it.rows.length)) it.rows = [{ id: it.id + '_1', text: 'Statement 1' }, { id: it.id + '_2', text: 'Statement 2' }];
      if (!(it.options && it.options.length)) it.options = AGREE5.map(function (l, n) { return { value: String(n + 1), label: l }; });
    }
    return it;
  }
  function newQuestion(list, kind, survey) {
    var it = { id: uniqueId(list, 'q'), text: '', type: 'choice', required: false, showIf: 'always', sessions: survey === 'pre' ? [1] : [], conditions: [] };
    return convert(it, kind);
  }
  // Text the designer itself puts in a new option, statement, column, or point label.
  var PLACEHOLDER = /^(Option|Statement|Answer|Point) \d+$/;
  // A variable name from a question's words ("How did you hear about this study?" → hear_study): up to three words
  // that are not filler, whole words only, at most 28 characters.
  var FILLER = /^(a|an|the|and|or|of|to|in|on|at|for|with|by|from|about|this|that|these|those|is|are|was|were|be|been|do|does|did|have|has|had|you|your|yours|i|me|my|we|our|it|its|how|what|which|who|whom|when|where|why|please|would|could|should|will|can|much|many|any|some|there|their|they|if|than|then|as|into|over|per|each|following|below|above|rate|indicate|select|choose|statement|statements|extent|agree|disagree)$/;
  function nameFrom(text) {
    var words = String(text || '').slice(0, 500).toLowerCase().replace(/\{\{[^}]*\}\}/g, ' ').split(/[^a-z0-9]+/).filter(function (w) { return w && !FILLER.test(w) && !/^\d/.test(w); }), out = [];
    words.forEach(function (w) { if (out.length < 3 && out.concat(w).join('_').length <= 28) out.push(w); });
    return (out.length ? out.join('_') : (words[0] || '').slice(0, 28)).replace(/^[^a-z]+/, '');
  }
  // How many other questions use this one in a display rule or piped text ({{q:id}}). A question that is used keeps
  // its name, and deleting it says so.
  function refsTo(list, id) {
    var pipe = '{{q:' + id + '}}', key = '"' + id + '"';
    return list.filter(function (x) {
      if (x.id === id) return false;
      var texts = [x.text, x.groupText, x.lo, x.hi].concat(x.labels || [], (x.options || []).map(function (o) { return o.label; }), (x.rows || []).map(function (r) { return r.text; }));
      return (x.displayIf && JSON.stringify(x.displayIf).indexOf(key) >= 0) || texts.some(function (t) { return typeof t === 'string' && t.indexOf(pipe) >= 0; });
    }).length;
  }
  // Rename a question the designer created (its rows follow), unless participants have started or another question
  // already refers to it.
  function rename(list, it, text) {
    var base = nameFrom(text); if (!base || it.id.indexOf(base) === 0 || refsTo(list, it.id)) return false;
    var id = uniqueId(list.filter(function (x) { return x !== it; }), base);
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(id)) return false;
    (it.rows || []).forEach(function (r, k) { if (r.id === it.id + '_' + (k + 1)) r.id = id + '_' + (k + 1); });
    it.id = id; return true;
  }
  // Every point labeled, or only the ends (content.mjs refuses a partial set).
  function scaleLabels(it, on) {
    if (!on) { delete it.labels; return; }
    var n = it.n || 7, std = n === 7 ? AGREE7 : n === 5 ? AGREE5 : null, out = [];
    for (var k = 0; k < n; k++) out.push(std ? std[k] : k === 0 ? (it.lo || 'Lowest') : k === n - 1 ? (it.hi || 'Highest') : 'Point ' + (k + 1));
    it.labels = out;
  }
  function setPoints(it, n) {
    n = int(n, 2, 11, 7);
    var had = it.labels && it.labels.length === it.n;
    it.n = n;
    if (had) scaleLabels(it, true);
    if (n === 7) { it.lo = it.lo || AGREE7[0]; it.hi = it.hi || AGREE7[6]; }
    return it;
  }

  // ---------- styles: the participant page's own stylesheets, scoped to the canvas ----------
  // :root and body become .lp-root and .lp-body, width media queries become container queries (so the phone frame
  // lays out exactly as a phone does), vw becomes cqi, and @font-face is left to the admin page (study.css loads Lato
  // there; fonts declared inside a shadow root are ignored).
  function scopeCss(css) {
    return String(css)
      .replace(/@font-face\s*\{[^}]*\}/g, '')
      .replace(/@media\s*(\((?:max|min)-width:\s*[\d.]+(?:px|em|rem)\)(?:\s*and\s*\((?:max|min)-width:\s*[\d.]+(?:px|em|rem)\))*)\s*\{/g, '@container lp $1 {')
      .replace(/:root/g, '.lp-root')
      .replace(/(^|[\s,{};>~+(])html(?=[\s,{:.#[>~+)])/g, '$1.lp-root')
      .replace(/(^|[\s,{};>~+(])body(?=[\s,{:.#[>~+)])/g, '$1.lp-body')
      .replace(/(\d)vw\b/g, '$1cqi');
  }

  // ---------- rendering: participant markup, with editable text ----------
  // Mirrors participant.js questionHtml. Each editable piece carries data-ed: text, opt:k, lab:k, lo, hi, row:k, group,
  // or T:key (screen text shared by the whole study). Answer controls are inert.
  function R(o) {
    var editable = !o.readOnly && !o.preview, live = !!o.preview;
    // Editable text (edit mode), or plain text; in Preview, piped text ({{q:x}}) is filled in from the answers so far.
    function ed(key, s, ph, label, tag) {
      tag = tag || 'span';
      if (!editable) {
        s = String(s == null ? '' : s);
        return live && s.indexOf('{{') >= 0 ? '<span data-tpl="' + esc(s) + '">' + esc(o.fill ? o.fill(s) : s) + '</span>' : esc(s);
      }
      return '<' + tag + ' class="lc-ed" data-ed="' + key + '" data-ph="' + esc(ph || '') + '" contenteditable="' + o.ce + '" spellcheck="true" role="textbox" aria-label="' + esc(label) + '">' + esc(s) + '</' + tag + '>';
    }
    // An answer control: inert while editing, real in Preview (named like the participant page's, so logic can read it).
    function ctl(type, name, value) {
      return live ? '<input type="' + type + '" name="' + esc(name) + '" value="' + esc(value) + '">' : '<input type="' + type + '" tabindex="-1" aria-hidden="true" disabled>';
    }
    var opt = live ? 'label' : 'div';
    function addBtn(act, label, ic) { return editable ? '<button type="button" class="lc-add" data-act="' + act + '">' + icon(ic || 'plus', 16) + '<span>' + label + '</span></button>' : ''; }
    function opts(it, kind, n) {
      return (it.options || []).map(function (op, k) {
        return '<' + opt + ' class="option" data-k="' + k + '">' + ctl(kind === 'multi' ? 'checkbox' : 'radio', it.id, op.value) + (editable ? '' : '<span>') + ed('opt:' + k, op.label, 'Option ' + (k + 1), 'Option ' + (k + 1) + ' of question ' + n) + (editable ? '' : '</span>') + '</' + opt + '>';
      }).join('');
    }
    function legend(it, n) { return '<legend class="q">' + ed('text', it.text, 'Type a question', 'Question ' + n) + '</legend>'; }
    function label(it, n) { return '<label class="q">' + ed('text', it.text, 'Type a question', 'Question ' + n) + '</label>'; }
    function field(tag, cls, it, extra) { return live ? '<' + tag + (cls ? ' class="' + cls + '"' : '') + ' name="' + esc(it.id) + '" autocomplete="off"' + (extra || '') + '>' + (tag === 'textarea' ? '</textarea>' : '') : '<' + tag + (cls ? ' class="' + cls + '"' : '') + ' tabindex="-1" aria-hidden="true" readonly' + (extra || '') + '>' + (tag === 'textarea' ? '</textarea>' : ''); }
    function vasBody(loEd, hiEd) {
      return '<div class="vas" aria-hidden="true"><div class="vas-track"><div class="vas-fill"></div><div class="vas-thumb" hidden></div></div>' +
        '<div class="vas-ends"><span>' + loEd + '</span><output class="vas-val">–</output><span>' + hiEd + '</span></div></div>';
    }
    function q(it, n) {
      var id = esc(it.id), t = it.type;
      if (t === 'info') {
        return '<div class="q-group q-info" data-name="' + id + '">' + (editable ? ed('text', it.text, 'Type instructions or any text. Leave a blank line between paragraphs.', 'Text block ' + n, 'div') :
          String(it.text == null ? '' : it.text).split(/\n\s*\n/).map(function (para) { return '<p>' + para.split('\n').map(function (l) { return ed('text', l); }).join('<br>') + '</p>'; }).join('')) + '</div>';
      }
      if (t === 'scale') {
        var N = int(it.n, 2, 11, 7), labels = it.labels && it.labels.length === N ? it.labels : null, first = typeof it.start === 'number' && isFinite(it.start) ? int(it.start, -10, 100, 1) : 1, cells = '';
        for (var k = 1; k <= N; k++) {
          var lab = labels ? ed('lab:' + (k - 1), labels[k - 1], 'Label', 'Label of point ' + (first + k - 1)) : k === 1 ? ed('lo', it.lo || '', 'Low label', 'Label of the first point') : k === N ? ed('hi', it.hi || '', 'High label', 'Label of the top point') : '';
          cells += '<' + opt + ' class="option scale-pt">' + ctl('radio', it.id, first + k - 1) + '<span class="pt-num">' + (first + k - 1) + '</span>' + (lab ? '<span class="pt-lab">' + lab + '</span>' : '') + '</' + opt + '>';
        }
        return '<fieldset class="q-group" data-name="' + id + '">' + legend(it, n) + '<div class="likert' + (labels ? ' labeled' : '') + '" style="--n:' + N + '">' + cells + '</div></fieldset>';
      }
      if (t === 'confidence' || t === 'slider') {
        var help = '<p class="muted help">' + esc(o.T('conf_help')) + '</p>';
        if (t === 'confidence') return '<fieldset class="q-group" data-name="' + id + '">' + legend(it, n) + vasBody(esc(o.T('conf_low')), esc(o.T('conf_high'))) + help + '</fieldset>';
        return '<fieldset class="q-group" data-name="' + id + '">' + legend(it, n) + vasBody(esc(it.min) + ' ' + ed('lo', it.lo || '', 'label', 'Label at the low end'), esc(it.max) + ' ' + ed('hi', it.hi || '', 'label', 'Label at the high end')) + help + '</fieldset>';
      }
      if (t === 'rank') {
        return '<fieldset class="q-group rank" data-name="' + id + '">' + legend(it, n) + '<ol class="rank-list">' + (it.options || []).map(function (op, k) {
          return '<li data-k="' + k + '"><span class="rank-label">' + ed('opt:' + k, op.label, 'Option ' + (k + 1), 'Option ' + (k + 1) + ' of question ' + n) + '</span><span class="rank-btns"><button type="button" class="secondary small" tabindex="-1" aria-hidden="true">Up</button><button type="button" class="secondary small" tabindex="-1" aria-hidden="true">Down</button></span></li>';
        }).join('') + '</ol>' + addBtn('addopt', 'Add option') + '<div class="row"><button type="button" class="secondary small" tabindex="-1" aria-hidden="true">This order is right</button></div><p class="sr"></p></fieldset>';
      }
      if (t === 'matrix') {
        var cols = it.options || [];
        return '<fieldset class="q-group matrix" data-name="' + id + '">' + legend(it, n) + (it.rows || []).map(function (r, k) {
          return '<fieldset class="q-group mx-row" data-name="' + esc(r.id) + '"><legend>' + ed('row:' + k, r.text, 'Statement', 'Statement ' + (k + 1) + ' of question ' + n) + '</legend><div class="likert labeled" style="--n:' + cols.length + '">' + cols.map(function (op, j) {
            return '<' + opt + ' class="option scale-pt">' + ctl('radio', r.id, op.value) + '<span class="pt-lab">' + (k === 0 || !editable ? ed('opt:' + j, op.label, 'Answer', 'Answer column ' + (j + 1) + ' of question ' + n) : '<span data-mirror="' + j + '">' + esc(op.label) + '</span>') + '</span></' + opt + '>';
          }).join('') + '</div></fieldset>';
        }).join('') + (editable ? '<div class="lc-adds">' + addBtn('addrow', 'Add statement') + addBtn('addcol', 'Add answer column') + (cols.length > 2 ? addBtn('delcol', 'Remove last column', 'minus') : '') + '</div>' : '') + '</fieldset>';
      }
      if (t === 'choice' || (t === 'select' && (it.options || []).length <= 10)) return '<fieldset class="q-group" data-name="' + id + '">' + legend(it, n) + '<div class="options">' + opts(it, 'choice', n) + '</div>' + addBtn('addopt', 'Add option') + '</fieldset>';
      if (t === 'multi') return '<fieldset class="q-group" data-name="' + id + '">' + legend(it, n) + '<div class="checks">' + opts(it, 'multi', n) + '</div>' + addBtn('addopt', 'Add option') + '</fieldset>';
      if (t === 'number') {
        var range = it.min != null && it.max != null ? 'Enter a number from ' + it.min + ' to ' + it.max + '.' : it.min != null ? 'Enter a number, ' + it.min + ' or more.' : it.max != null ? 'Enter a number, ' + it.max + ' or less.' : '';
        return '<div class="q-group" data-name="' + id + '">' + label(it, n) + field('input', 'num', it, ' type="text" inputmode="decimal"') + (range ? '<p class="muted help">' + esc(range) + '</p>' : '') + '</div>';
      }
      if (t === 'select') {
        return '<div class="q-group" data-name="' + id + '">' + label(it, n) + (live ? '<select name="' + id + '"><option value="">Select…</option>' + it.options.map(function (op) { return '<option value="' + esc(op.value) + '">' + esc(op.label) + '</option>'; }).join('') + '</select>' : '<select tabindex="-1" aria-hidden="true" disabled><option>Select…</option></select>') +
          (editable ? '<div class="lc-tray"><p class="lc-tray-h">Dropdown list, ' + it.options.length + ' options (lists of 10 or fewer show as buttons)</p>' + it.options.map(function (op, k) {
            return '<div class="lc-tray-opt" data-k="' + k + '">' + ed('opt:' + k, op.label, 'Option ' + (k + 1), 'Option ' + (k + 1) + ' of question ' + n) + '</div>';
          }).join('') + addBtn('addopt', 'Add option') + '</div>' : '') + '</div>';
      }
      if (it.long === false) return '<div class="q-group" data-name="' + id + '">' + label(it, n) + field('input', 'line', it, ' type="text"') + '</div>';
      return '<div class="q-group" data-name="' + id + '">' + label(it, n) + field('textarea', '', it, it.long ? ' rows="7"' : '') + '</div>';
    }
    return { q: q, ed: ed };
  }
  // A short note on what limits a question, shown on its tag (who sees it is set in the inspector).
  function limits(it) {
    var out = [];
    if (it.displayIf) out.push('Conditional');
    if (it.showIf && it.showIf !== 'always') out.push('Some sessions');
    if ((it.conditions || []).length) out.push(it.conditions.length === 1 ? it.conditions[0] + ' only' : it.conditions.length + ' groups');
    if (it.shuffle) out.push('Shuffled');
    return out;
  }
  // What the server would refuse on Save, shown on the question as soon as it happens: a display rule or piped text
  // that uses a question coming later (participants have not answered it yet) or one that does not exist.
  function refsOf(it) {
    var out = [], texts = [it.text, it.groupText, it.lo, it.hi].concat(it.labels || [], (it.options || []).map(function (o) { return o.label; }), (it.rows || []).map(function (r) { return r.text; }));
    if (it.displayIf) String(JSON.stringify(it.displayIf)).replace(/"q":"([a-z][a-z0-9_]{0,40})"/g, function (m, id) { out.push(id); return m; });
    texts.forEach(function (t) { if (typeof t === 'string') t.slice(0, MAXTEXT).replace(/\{\{q:([a-z][a-z0-9_]{0,40})\}\}/g, function (m, id) { out.push(id); return m; }); });
    return out;
  }
  function problems(list, it) {
    var at = {}, mine = list.indexOf(it), bad = [];
    list.forEach(function (x, n) { at[x.id] = n; (x.rows || []).forEach(function (r) { at[r.id] = n; }); });
    refsOf(it).forEach(function (id) {
      var msg = !(id in at) ? 'Uses ' + id + ', which is not in this survey' : at[id] >= mine ? 'Uses ' + id + ', which comes later' : null;
      if (msg && bad.indexOf(msg) < 0) bad.push(msg);
    });
    return bad;
  }
  function gap(p, k, last) {
    return '<div class="lc-gap' + (last ? ' lc-gap-last' : '') + '" data-p="' + p + '" data-k="' + k + '"><button type="button" class="lc-gapbtn" data-act="insert" data-p="' + p + '" data-k="' + k + '" aria-label="Insert a question here" title="Insert here">' + icon('plus', 16) + '</button></div>';
  }
  function canvasHtml(list, o, st) {
    var r = R(o), pages = toPages(list), n = 0, h = '', editable = !o.readOnly && !o.preview;
    var title = function () { return '<h1>' + r.ed('T:' + o.kind + '_title', o.T(o.kind + '_title'), 'Survey title', 'Survey title (the same in every session)') + '</h1>'; };
    if (!list.length) {
      return '<div class="lp-body"><div class="wrap"><section class="lc-screen"><div class="card lc-empty">' + title() +
        '<p class="muted">No questions yet. Participants skip this survey until it has one.</p>' +
        (editable ? '<button type="button" class="lc-first" data-act="insert" data-p="0" data-k="0">' + icon('plus', 22) + '<span>Add the first question</span></button>' : '') + '</div></section></div></div>';
    }
    var cur = o.preview ? int(st.page, 0, pages.length - 1, 0) : -1;
    h += '<div class="lp-body"><div class="wrap">';
    pages.forEach(function (page, p) {
      if (o.preview && p !== cur) { n += page.length; return; }   // Preview shows one page at a time, as participants see it
      if (p && !o.preview) h += '<div class="lc-break"><span class="lc-break-line"></span><span class="lc-break-tag">' + icon('brk', 16) + 'Page ' + (p + 1) + '</span>' + (editable ? '<button type="button" class="lc-icobtn" data-act="unbreak" data-p="' + p + '" aria-label="Remove the page break before page ' + (p + 1) + '" title="Join with the page above">' + icon('x', 15) + '</button>' : '') + '<span class="lc-break-line"></span></div>';
      h += '<section class="lc-screen" data-p="' + p + '" aria-label="Page ' + (p + 1) + ' of ' + pages.length + '">' + (pages.length > 1 ? '<p class="progress">' + esc((o.T('survey_page') || 'Page {i} of {n}').replace('{i}', p + 1).replace('{n}', pages.length)) + '</p>' : '') + '<div class="card">' + title();
      var grp = null;
      page.forEach(function (it, k) {
        var g = it.group || null, i = list.indexOf(it);
        if (grp && g !== grp) { h += '</div>'; grp = null; }
        if (editable) h += gap(p, k);
        if (g && g !== grp) { h += '<div class="q-groupwrap" role="group" data-group="' + esc(g) + '">' + (it.groupText != null ? '<p class="q-grouphead">' + r.ed('group', it.groupText, 'Group heading', 'Heading of group ' + g) + '</p>' : ''); grp = g; }
        var lim = limits(it), sel = !o.preview && st.sel === i;
        h += '<div class="lc-q' + (sel ? ' lc-sel' : '') + '" data-i="' + i + '" data-id="' + esc(it.id) + '" tabindex="-1" aria-label="Question ' + (n + 1) + ', ' + esc(kindLabel(it)) + '"' + (sel ? ' aria-current="true"' : '') + '>' +
          (o.preview ? (it.displayIf ? '<div class="lc-why" contenteditable="false"></div>' : '') : '<div class="lc-tag" contenteditable="false"><span class="lc-var">' + esc(it.id) + '</span>' + (it.required && it.type !== 'info' ? '<span class="lc-req">Required</span>' : '') + lim.map(function (x) { return '<span class="lc-lim">' + esc(x) + '</span>'; }).join('') + '</div>' +
            problems(list, it).map(function (x) { return '<p class="lc-warn" contenteditable="false" role="note">' + icon('alert', 14) + esc(x) + '. Saving will fail until it comes earlier.</p>'; }).join('')) +
          r.q(it, n + 1) + (sel && editable ? tools(it, i, list.length) : '') + '</div>';
        n++;
      });
      if (grp) h += '</div>';
      if (editable) h += gap(p, page.length, true);
      // A span drawn as the participant's button: browsers do not let people type inside a real <button>. In Preview it is real.
      h += '<div class="actions">' + (o.preview ? '<button type="button" data-act="next">' + esc(o.T('continue_button') || 'Continue') + '</button>' : '<span class="lc-continue">' + r.ed('T:continue_button', o.T('continue_button'), 'Continue', 'Continue button text (the same on every page)') + '</span>') + '</div></div></section>';
    });
    if (o.preview && cur === pages.length - 1) h += '<p class="lc-end" data-end="1" hidden>End of the survey. Participants would go on from here.</p>';
    if (editable) h += '<div class="lc-tail"><button type="button" class="lc-pill" data-act="insert" data-p="' + (pages.length - 1) + '" data-k="' + pages[pages.length - 1].length + '">' + icon('plus', 16) + 'Add question</button><button type="button" class="lc-pill" data-act="newpage">' + icon('brk', 16) + 'Add page</button></div>';
    return h + '</div></div>';
  }
  function tools(it, i, count) {
    var on = !!(it.labels && it.labels.length === int(it.n, 2, 11, 7));
    var N = int(it.n, 2, 11, 7);
    var pts = it.type === 'scale' ? '<span class="lc-sep"></span><span class="lc-step" role="group" aria-label="Points on the scale"><button type="button" data-act="pts" data-d="-1" aria-label="Fewer points"' + (N <= 2 ? ' disabled' : '') + '>' + icon('minus', 15) + '</button><span class="lc-stepval">' + N + ' points</span><button type="button" data-act="pts" data-d="1" aria-label="More points"' + (N >= 11 ? ' disabled' : '') + '>' + icon('plus', 15) + '</button></span>' +
      '<button type="button" class="lc-switch" role="switch" data-act="labels" aria-checked="' + on + '" aria-label="Label every point" title="Label every point, or only the ends"><span class="lc-knob"></span>Labels</button>' : '';
    return '<div class="lc-tools" contenteditable="false" role="toolbar" aria-label="Question ' + (i + 1) + ' tools">' +
      '<button type="button" class="lc-grip" data-act="grip" aria-label="Drag to move. Option and the arrow keys also move it." title="Drag to move">' + icon('grip', 16) + '</button>' +
      '<button type="button" class="lc-kind" data-act="kind" aria-haspopup="menu" aria-label="Question type: ' + esc(kindLabel(it)) + '. Change">' + icon(kindOf(it), 17) + '<span>' + esc(kindLabel(it)) + '</span>' + icon('chev', 14) + '</button>' + pts +
      (it.type !== 'info' ? '<span class="lc-sep"></span><button type="button" class="lc-switch" role="switch" data-act="req" aria-checked="' + !!it.required + '"><span class="lc-knob"></span>Required</button>' : '') +
      '<span class="lc-sep"></span>' +
      '<button type="button" class="lc-icobtn" data-act="up" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + ' title="Move up (⌥↑)">' + icon('up', 17) + '</button>' +
      '<button type="button" class="lc-icobtn" data-act="down" aria-label="Move down"' + (i === count - 1 ? ' disabled' : '') + ' title="Move down (⌥↓)">' + icon('down', 17) + '</button>' +
      '<button type="button" class="lc-icobtn" data-act="dup" aria-label="Duplicate" title="Duplicate (⌘D)">' + icon('dup', 17) + '</button>' +
      '<button type="button" class="lc-icobtn lc-danger" data-act="del" aria-label="Delete" title="Delete (⌫)">' + icon('trash', 17) + '</button>' +
      '<button type="button" class="lc-icobtn" data-act="settings" aria-label="Settings: variable name, logic, who sees it" title="Settings">' + icon('gear', 17) + '</button></div>';
  }
  // The "+" menu and the type menu share one popover.
  function menuHtml(mode, o, current) {
    var kinds = KINDS.filter(function (k) { return o.qtypes.indexOf(k.type) >= 0; });
    return '<div class="lc-menu-h">' + (mode === 'kind' ? 'Change to' : 'Insert') + '</div><div class="lc-menu-grid">' + kinds.map(function (k) {
      return '<button type="button" role="' + (mode === 'kind' ? 'menuitemradio' : 'menuitem') + '"' + (mode === 'kind' ? ' aria-checked="' + (k.id === current) + '"' : '') + ' data-kind="' + k.id + '"><span class="lc-mi-ic">' + icon(k.id, 18) + '</span><span class="lc-mi-t"><b>' + esc(k.label) + '</b><small>' + esc(k.hint) + '</small></span></button>';
    }).join('') + '</div>' + (mode === 'insert-break' ? '<div class="lc-menu-sep"></div><button type="button" role="menuitem" data-kind="break" class="lc-mi-wide"><span class="lc-mi-ic">' + icon('brk', 18) + '</span><span class="lc-mi-t"><b>Page break</b><small>Start a new page here</small></span></button>' : '');
  }

  // ---------- the designer ----------
  var STATE = {}, cssText = null;
  function loadCss() {
    if (cssText) return cssText;
    cssText = Promise.all(['/lab/assets/study.css', '/lab/engine/participant.css', '/lab/engine/canvas-page.css'].map(function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.text(); }); }))
      .then(function (t) { return scopeCss(t[0] + '\n' + t[1]) + '\n' + t[2]; }, function (e) { cssText = null; throw e; });
    return cssText;
  }
  var CE = (function () { try { var d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'; } catch (e) { return 'true'; } })();

  function mount(host, opts) {
    var o = {
      kind: opts.kind, readOnly: !!opts.readOnly, qtypes: opts.qtypes || KINDS.map(function (k) { return k.type; }), ce: CE,
      T: function (k) { var t = opts.text || {}; return (t[k] != null ? t[k] : (opts.defaults || {})[k]) || ''; }
    };
    var list = opts.list, st = STATE[o.kind] || (STATE[o.kind] = { sel: -1, device: 'desktop', mode: 'edit', page: 0 });
    // A new draft (after Save, Discard, a restored version, or someone else's save) starts a new undo history: undoing
    // into a snapshot of an older draft would overwrite newer content.
    if (st.list !== list) { st.list = list; st.undo = []; st.redo = []; st.fresh = {}; st.answers = {}; }
    if (!o.readOnly && !inOrder(list)) fromPages(list, toPages(list));   // the same pages, now in the order they are shown (viewers' drafts are never touched)
    if (st.sel >= list.length) st.sel = list.length - 1;
    function started() { return typeof opts.started === 'function' ? opts.started() : opts.started || 0; }   // read live: participants can start while the page is open
    o.preview = st.mode === 'preview';
    o.fill = function (s) {   // piped text in Preview: an answer's label (or what was typed), embedded data as [name]
      return window.LabLogic ? window.LabLogic.fillPipes(s, function (kind, name) {
        if (kind === 'ed') return '[' + name + ']';
        var v = st.answers[name], it = list.filter(function (x) { return x.id === name; })[0];
        if (v == null) return '';
        var lab = function (x) { var op = it && it.options ? it.options.filter(function (q) { return q.value === String(x); })[0] : null; return op ? op.label : x; };
        return Array.isArray(v) ? v.map(lab).join(', ') : lab(v);
      }) : s;
    };
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    host.innerHTML = '<div class="lc" data-device="' + st.device + '">' +
      '<div class="lc-bar" role="toolbar" aria-label="Designer">' +
        '<div class="lc-seg" role="radiogroup" aria-label="Preview size"><button type="button" role="radio" data-dev="desktop">' + icon('desktop', 17) + '<span>Desktop</span></button><button type="button" role="radio" data-dev="phone">' + icon('phone', 17) + '<span>Phone</span></button></div>' +
        '<div class="lc-seg" role="radiogroup" aria-label="Mode"><button type="button" role="radio" data-mode="edit">' + icon(o.readOnly ? 'eye' : 'pencil', 16) + '<span>' + (o.readOnly ? 'View' : 'Edit') + '</span></button><button type="button" role="radio" data-mode="preview">' + icon('play', 16) + '<span>Preview</span></button></div>' +
        '<nav class="lc-pages" aria-label="Pages"></nav>' +
        '<span class="lc-count" aria-live="polite"></span>' +
        (o.readOnly ? '' : '<span class="lc-barbtns"><button type="button" class="lc-icobtn" data-bar="undo" aria-label="Undo" title="Undo (⌘Z)">' + icon('undo', 18) + '</button><button type="button" class="lc-icobtn" data-bar="redo" aria-label="Redo" title="Redo (⇧⌘Z)">' + icon('redo', 18) + '</button></span>') +
      '</div>' +
      '<div class="lc-body"><div class="lc-stage"><div class="lc-frame"><div class="lc-chrome" aria-hidden="true"><i></i><i></i><i></i><span>' + esc(location.host + '/lab/s/' + (opts.studyId || '')) + '</span></div><div class="lc-phonebar" aria-hidden="true"><span>9:41</span><b></b></div><div class="lc-scroll"><div class="lc-canvas"></div></div></div></div>' +
        '<aside class="lc-insp" aria-label="Question settings"></aside></div>' +
      '<div class="lc-toast" role="status" aria-live="polite" hidden></div></div>';
    var shell = host.firstChild, canvasHost = shell.querySelector('.lc-canvas'), insp = shell.querySelector('.lc-insp'), toastEl = shell.querySelector('.lc-toast');
    var sr = canvasHost.attachShadow({ mode: 'open' });
    sr.innerHTML = '<div class="lp-root"><p class="lc-loading">Loading the participant view…</p></div>';
    var rootEl = sr.firstChild, menu = null, typing = null;
    if (o.readOnly) rootEl.classList.add('lc-ro');

    // Undo keeps snapshots of the list and of the screen texts the canvas edits.
    var TKEYS = [o.kind + '_title', 'continue_button'];
    function snap() { return JSON.stringify({ list: list, t: TKEYS.map(function (k) { return opts.text ? opts.text[k] : undefined; }), sel: st.sel }); }
    function restore(s) {
      var x = JSON.parse(s); list.splice.apply(list, [0, list.length].concat(x.list));
      if (opts.text) TKEYS.forEach(function (k, n) { if (x.t[n] === undefined) delete opts.text[k]; else opts.text[k] = x.t[n]; });
      st.sel = Math.min(x.sel, list.length - 1); changed(); render(st.sel >= 0 ? { i: st.sel } : null);
    }
    function record() { st.undo.push(snap()); if (st.undo.length > 200) st.undo.shift(); st.redo = []; }
    function undo() { settleTyping(); if (!st.undo.length) return; st.redo.push(snap()); restore(st.undo.pop()); say('Undone'); }
    function redo() { if (!st.redo.length) return; st.undo.push(snap()); restore(st.redo.pop()); say('Redone'); }
    function changed() { if (opts.onChange) opts.onChange(); bar(); }

    function bar() {
      var pages = toPages(list).length, qs = list.filter(function (it) { return it.type !== 'info'; }).length;
      shell.querySelector('.lc-count').textContent = qs + (qs === 1 ? ' question' : ' questions') + (pages > 1 ? ' on ' + pages + ' pages' : '');
      shell.querySelectorAll('[data-dev]').forEach(function (b) { var on = b.getAttribute('data-dev') === st.device; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      shell.setAttribute('data-device', st.device);
      shell.querySelectorAll('[data-mode]').forEach(function (b) { var on = b.getAttribute('data-mode') === st.mode; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      shell.setAttribute('data-mode', st.mode);
      var nav = shell.querySelector('.lc-pages'), cur = o.preview ? int(st.page, 0, pages - 1, 0) : st.view || 0;
      nav.innerHTML = pages > 1 ? '<span class="lc-pages-l">Page</span>' + Array.apply(null, Array(pages)).map(function (x, p) {
        return '<button type="button" data-page="' + p + '"' + (p === cur ? ' aria-current="page"' : '') + ' aria-label="Page ' + (p + 1) + '">' + (p + 1) + '</button>'; }).join('') : '';
      var u = shell.querySelector('[data-bar="undo"]'), r = shell.querySelector('[data-bar="redo"]');
      if (u) { u.disabled = !st.undo.length || o.preview; r.disabled = !st.redo.length || o.preview; }
    }
    // The page navigator follows scrolling in Edit (the page at the top third of the view is the current one).
    function trackPage() {
      if (o.preview) return;
      var line = st.device === 'phone' ? shell.querySelector('.lc-scroll').getBoundingClientRect().top + 120 : window.innerHeight / 3, now = 0;
      rootEl.querySelectorAll('.lc-screen').forEach(function (s) { if (s.getBoundingClientRect().top <= line) now = Number(s.getAttribute('data-p')); });
      if (now !== st.view) { st.view = now; shell.querySelectorAll('.lc-pages [data-page]').forEach(function (b) { if (Number(b.getAttribute('data-page')) === now) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); }
    }
    function onScroll() { if (!onScroll.raf) onScroll.raf = requestAnimationFrame(function () { onScroll.raf = 0; if (shell.isConnected) trackPage(); else window.removeEventListener('scroll', onScroll); }); }
    window.addEventListener('scroll', onScroll, { passive: true });
    shell.querySelector('.lc-scroll').addEventListener('scroll', onScroll, { passive: true });
    function goPage(p) {
      if (o.preview) { st.page = p; render(null); var top = shell.querySelector('.lc-stage'); if (top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); return; }
      var sec = rootEl.querySelector('.lc-screen[data-p="' + p + '"]'); if (!sec) return;
      if (st.device === 'phone') { var sc = shell.querySelector('.lc-scroll'); sc.scrollTo({ top: sc.scrollTop + sec.getBoundingClientRect().top - sc.getBoundingClientRect().top - 12, behavior: reduce ? 'auto' : 'smooth' }); }
      else window.scrollTo({ top: window.scrollY + sec.getBoundingClientRect().top - 84, behavior: reduce ? 'auto' : 'smooth' });
      st.view = p; bar();
    }
    function focusInfo() {
      var a = sr.activeElement; if (!a || !a.getAttribute) return null;
      var q = a.closest('.lc-q'), key = a.getAttribute('data-ed');
      if (key) return { i: q ? Number(q.getAttribute('data-i')) : -1, ed: key };
      return q && a === q ? { i: Number(q.getAttribute('data-i')) } : null;
    }
    function edEl(i, key) {
      var scope = i < 0 ? rootEl : rootEl.querySelector('.lc-q[data-i="' + i + '"]');
      return scope ? scope.querySelector('[data-ed="' + key + '"]') : null;
    }
    // Focus a field with the caret at its end; a placeholder the designer wrote ("Option 2") is selected instead, so
    // typing replaces it.
    function caret(el, atStart) {
      if (!el) return; el.focus({ preventScroll: true });
      if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
      if (PLACEHOLDER.test(el.textContent)) return selectAllIn(el);
      try { var r = document.createRange(); r.selectNodeContents(el); r.collapse(!!atStart); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
    }
    function selectAllIn(el) { if (!el) return; try { var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} }
    function render(focus) {
      var f = focus === undefined ? focusInfo() : focus;
      o.preview = st.mode === 'preview';
      rootEl.classList.toggle('lc-preview', o.preview);
      rootEl.innerHTML = canvasHtml(list, o, st);
      bar(); inspector();
      if (o.preview) { restoreAnswers(); applyLogic(); return; }
      if (f) {
        if (f.ed) caret(edEl(f.i, f.ed), f.start);
        else { var q = rootEl.querySelector('.lc-q[data-i="' + f.i + '"]'); if (q) { q.focus({ preventScroll: true }); q.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); } }
      }
    }
    function inspector() {
      if (o.preview) {
        insp.innerHTML = '<div class="lc-insp-empty"><h3>Preview</h3><ul><li>Answer like a participant. Questions with display logic appear and disappear as you go, and piped text fills in.</li>' +
          '<li><b>Continue</b> goes to the next page that has a question to show. The page numbers above jump anywhere.</li>' +
          '<li>Nothing is saved. Sliders, confidence lines, and ranking questions are shown, not answered.</li></ul>' +
          '<p><button type="button" class="secondary small" data-bar="clear">Clear answers</button></p></div>';
        return;
      }
      if (st.sel < 0 || !list[st.sel]) {
        insp.innerHTML = o.readOnly ? '' : '<div class="lc-insp-empty"><h3>Edit it the way participants will see it</h3><ul>' +
          '<li><b>Click any text</b> to change it: questions, options, labels, the title, even the Continue button.</li>' +
          '<li><b>Point between two questions</b> and click <span class="lc-kbd">+</span> to add a question or a page break.</li>' +
          '<li><b>Drag</b> a question by its handle, or press <span class="lc-kbd">⌥</span><span class="lc-kbd">↑</span> / <span class="lc-kbd">⌥</span><span class="lc-kbd">↓</span>.</li>' +
          '<li><b>Return</b> in an option adds the next one. <b>Paste a list</b> to add many at once.</li>' +
          '<li><b>Type /</b> in an empty question to change its type.</li>' +
          '<li><span class="lc-kbd">⌘</span><span class="lc-kbd">Z</span> undoes anything. Nothing reaches participants until you click <b>Save changes</b>.</li></ul>' +
          '<p class="muted">Select a question to set its variable name, display logic, and who sees it.</p></div>';
        return;
      }
      var it = list[st.sel];
      var body = opts.inspector ? opts.inspector(st.sel) : '';
      insp.innerHTML = '<div class="lc-insp-head"><span class="lc-mi-ic">' + icon(kindOf(it), 18) + '</span><div><b>Question ' + (st.sel + 1) + '</b><small>' + esc(kindLabel(it)) + ' · ' + esc(it.id) + '</small></div></div>' +
        (o.readOnly ? '<fieldset disabled class="lc-ro-fs">' + body + '</fieldset>' : body);
    }
    function select(i, focusIt) {
      if (o.preview) return;
      if (i !== st.sel) {
        st.sel = i;
        var old = rootEl.querySelector('.lc-q.lc-sel');
        if (old) { old.classList.remove('lc-sel'); old.removeAttribute('aria-current'); var ot = old.querySelector('.lc-tools'); if (ot) ot.remove(); }
        var el = rootEl.querySelector('.lc-q[data-i="' + i + '"]');
        if (el) { el.classList.add('lc-sel'); el.setAttribute('aria-current', 'true'); if (!o.readOnly) el.insertAdjacentHTML('beforeend', tools(list[i], i, list.length)); }
        inspector();
      }
      if (focusIt) { var q = rootEl.querySelector('.lc-q[data-i="' + i + '"]'); if (q) q.focus({ preventScroll: true }); }
    }
    function say(m, undoable) {
      toastEl.innerHTML = '<span>' + esc(m) + '</span>' + (undoable ? '<button type="button" data-bar="undo">Undo</button>' : '');
      toastEl.hidden = false; toastEl.classList.remove('lc-out');
      clearTimeout(say.t); say.t = setTimeout(function () { toastEl.classList.add('lc-out'); setTimeout(function () { toastEl.hidden = true; }, 220); }, undoable ? 5000 : 1800);
    }

    // ---------- Preview: answers, display logic, piped text ----------
    // The same rules the participant page runs (logic.js, LabLogic.resolve): a question whose rule fails is hidden and
    // its answer dropped; Continue skips a page with nothing left to show.
    function answerFrom(el) {
      var name = el.name; if (!name) return;
      if (el.type === 'checkbox') {
        var vals = [].slice.call(rootEl.querySelectorAll('input[type=checkbox]')).filter(function (x) { return x.name === name && x.checked; }).map(function (x) { return x.value; });
        if (vals.length) st.answers[name] = vals; else delete st.answers[name];
      } else if (el.type === 'radio') { if (el.checked) st.answers[name] = el.value; }
      else if (String(el.value).trim() === '') delete st.answers[name];
      else st.answers[name] = el.type === 'text' && el.classList.contains('num') && isFinite(Number(el.value)) ? Number(el.value) : String(el.value).slice(0, MAXTEXT);
    }
    function restoreAnswers() {
      rootEl.querySelectorAll('input[name], textarea[name], select[name]').forEach(function (el) {
        var v = st.answers[el.name];
        if (el.type === 'radio') el.checked = v != null && String(v) === el.value;
        else if (el.type === 'checkbox') el.checked = Array.isArray(v) && v.indexOf(el.value) >= 0;
        else el.value = v == null ? '' : v;
      });
    }
    function hiddenNow() { return window.LabLogic ? window.LabLogic.resolve(list, st.answers, { ed: {} }) : { hidden: {}, answers: st.answers }; }
    function applyLogic() {
      var res = hiddenNow();
      st.answers = res.answers;
      rootEl.querySelectorAll('.lc-q').forEach(function (q) {
        var id = q.getAttribute('data-id'), it = list[Number(q.getAttribute('data-i'))], off = !!res.hidden[id];
        if (off && !q.hidden) q.querySelectorAll('input, textarea, select').forEach(function (x) { if (x.type === 'radio' || x.type === 'checkbox') x.checked = false; else x.value = ''; });
        q.hidden = off;
        var why = q.querySelector('.lc-why');
        if (why && it && it.displayIf) why.textContent = 'Shown because ' + (window.LabLogic ? window.LabLogic.describe(it.displayIf, list) : 'its display rule is met');
      });
      rootEl.querySelectorAll('[data-tpl]').forEach(function (el) { el.textContent = o.fill(el.getAttribute('data-tpl')); });
    }
    function nextPage() {
      var pages = toPages(list), hidden = hiddenNow().hidden, p = int(st.page, 0, pages.length - 1, 0) + 1;
      while (p < pages.length && pages[p].every(function (it) { return hidden[it.id]; })) p++;
      if (p >= pages.length) return say('End of the survey. Participants would go on from here.');
      goPage(p);
    }

    // ---------- edits ----------
    function itemFor(el) { var q = el.closest('.lc-q'); return q ? list[Number(q.getAttribute('data-i'))] : null; }
    function groupHead(el) {   // a group's heading belongs to the first question of the group
      var w = el.closest('.q-groupwrap'), q = w && w.querySelector('.lc-q'); return q ? list[Number(q.getAttribute('data-i'))] : null;
    }
    function multiLine(el) { return el.getAttribute('data-ed') === 'text' && el.tagName === 'DIV'; }
    function readEd(el) {
      var t = String(el.innerText != null ? el.innerText : el.textContent || '').slice(0, MAXTEXT).replace(/\r/g, '').replace(/\u00a0/g, ' ');
      return multiLine(el) ? t.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') : t.replace(/\s*\n\s*/g, ' ');
    }
    function write(el) {
      var key = el.getAttribute('data-ed'), v = readEd(el), it, m;
      if (typing !== el) { record(); typing = el; }
      if ((m = /^T:(.+)$/.exec(key))) {
        if (opts.text) opts.text[m[1]] = v;
        rootEl.querySelectorAll('[data-ed="' + key + '"]').forEach(function (x) { if (x !== el) x.textContent = v; });
        return changed();
      }
      if (key === 'group') { it = groupHead(el); if (it) it.groupText = v; return changed(); }
      it = itemFor(el); if (!it) return;
      if (key === 'text') it.text = v;
      else if (key === 'lo' || key === 'hi') it[key] = v;
      else if ((m = /^opt:(\d+)$/.exec(key))) {
        var op = it.options[Number(m[1])], fresh = op.value === op.label || op.value === '' || /^Option \d+$/.test(op.value) && !op.label;
        // A new option's saved value follows its text, until participants have started (then values are data).
        if (fresh && !started() && v.trim() && !it.options.some(function (x) { return x !== op && x.value === v.trim(); })) op.value = v.trim();
        op.label = v;
        el.closest('.lc-q').querySelectorAll('[data-mirror="' + m[1] + '"]').forEach(function (x) { x.textContent = v; });
      } else if ((m = /^lab:(\d+)$/.exec(key))) { var k = Number(m[1]); it.labels[k] = v; if (k === 0) it.lo = v; if (k === it.n - 1) it.hi = v; }
      else if ((m = /^row:(\d+)$/.exec(key))) it.rows[Number(m[1])].text = v;
      changed(); refreshInspector();
    }
    // Keep the inspector's fields (options as text, variable name) in step with typing on the canvas, but never while
    // someone is typing in the inspector itself.
    function refreshInspector() {
      clearTimeout(refreshInspector.t);
      refreshInspector.t = setTimeout(function () { if (!insp.contains(document.activeElement)) inspector(); }, 300);
    }
    // Leaving a field: an empty option or statement goes (when others remain); an emptied point label gets a default.
    function settle(el) {
      var key = el.getAttribute('data-ed'), it = itemFor(el), m, v = readEd(el).trim();
      if (typing === el) typing = null;
      if ((el.textContent || '').length > MAXTEXT) { el.textContent = readEd(el); say('Text is limited to ' + MAXTEXT.toLocaleString() + ' characters; the rest was left out.'); }
      if (it && v && key === 'text' && st.fresh[it.id] && !started() && it.type !== 'info') {   // a new question takes its name from its words
        var was = it.id;
        if (rename(list, it, v)) {
          delete st.fresh[was]; st.fresh[it.id] = 1; changed(); inspector();
          var qe = el.closest('.lc-q'), tag = qe.querySelector('.lc-var'); qe.setAttribute('data-id', it.id); if (tag) tag.textContent = it.id;
        }
      }
      if (v && v.indexOf('{{q:') >= 0) return render();   // piped text: redraw so a reference to a later question is flagged
      if (!it || v) return;
      if ((m = /^opt:(\d+)$/.exec(key)) && it.options.length > 1 && it.type !== 'matrix') { it.options.splice(Number(m[1]), 1); changed(); render(); }
      else if ((m = /^row:(\d+)$/.exec(key)) && it.rows.length > 1) { it.rows.splice(Number(m[1]), 1); changed(); render(); }
      else if ((m = /^lab:(\d+)$/.exec(key))) { it.labels[Number(m[1])] = 'Point ' + (Number(m[1]) + 1); changed(); render(); }
    }
    function settleTyping() { if (typing) { var t = typing; typing = null; if (t.isConnected) settle(t); } }
    function insertAt(p, k, kind) {
      var pages = toPages(list); record();
      if (kind === 'break') { pages.splice(p + 1, 0, pages[p].splice(k)); fromPages(list, pages); changed(); render(); return say('Page break added. Questions below it are on page ' + (p + 2) + '.'); }
      var q = newQuestion(list, kind, o.kind); st.fresh[q.id] = 1;
      if (!pages.length) pages = [[]];
      pages[p].splice(k, 0, q); fromPages(list, pages); st.sel = indexOf(pages, p, k); changed();
      render({ i: st.sel, ed: 'text', start: true });
    }
    function act(name, btn) {
      var i = st.sel, it = list[i], pages, at;
      if (name === 'next') return nextPage();
      if (o.preview || o.readOnly) return;
      if (name === 'insert') {
        var p = Number(btn.getAttribute('data-p')), k = Number(btn.getAttribute('data-k')), pg = toPages(list)[p];
        return openMenu(btn, pg && k > 0 && k < pg.length ? 'insert-break' : 'insert', function (kind) { insertAt(p, k, kind); });
      }
      if (name === 'newpage') { record(); pages = toPages(list); var nq = newQuestion(list, 'choice', o.kind); st.fresh[nq.id] = 1; pages.push([nq]); fromPages(list, pages); st.sel = list.length - 1; changed(); render({ i: st.sel, ed: 'text', start: true }); return say('Page ' + pages.length + ' added'); }
      if (name === 'unbreak') { record(); pages = toPages(list); var b = Number(btn.getAttribute('data-p')); pages[b - 1] = pages[b - 1].concat(pages[b]); pages.splice(b, 1); fromPages(list, pages); changed(); render(); return say('Pages ' + b + ' and ' + (b + 1) + ' joined'); }
      if (!it) return;
      if (name === 'kind') return openMenu(btn, 'kind', function (kind) { if (kind === kindOf(it)) return; record(); convert(it, kind); changed(); render({ i: i }); say('Now a ' + kindLabel(it).toLowerCase() + ' question'); }, kindOf(it));
      if (name === 'req') { record(); it.required = !it.required; changed(); render({ i: i }); return say(it.required ? 'Required: a skipped answer is asked for once more' : 'Optional'); }
      if (name === 'pts') { record(); setPoints(it, it.n + Number(btn.getAttribute('data-d'))); changed(); render({ i: i }); return; }
      if (name === 'labels') { record(); scaleLabels(it, !(it.labels && it.labels.length === it.n)); changed(); render({ i: i }); return; }
      if (name === 'addopt') {
        record(); var nx = it.options.length + 1, lab = 'Option ' + nx;
        while (it.options.some(function (x) { return x.value === lab; })) lab = 'Option ' + (++nx);
        it.options.push({ value: lab, label: lab }); changed(); render({ i: i, ed: 'opt:' + (it.options.length - 1) }); selectAllIn(edEl(i, 'opt:' + (it.options.length - 1))); return;
      }
      if (name === 'addrow') { record(); it.rows.push({ id: uniqueId(list, it.id + '_' + (it.rows.length + 1)), text: 'Statement ' + (it.rows.length + 1) }); changed(); render({ i: i, ed: 'row:' + (it.rows.length - 1) }); selectAllIn(edEl(i, 'row:' + (it.rows.length - 1))); return; }
      if (name === 'addcol') {
        record(); var v = it.options.length + 1; while (it.options.some(function (x) { return x.value === String(v); })) v++;
        it.options.push({ value: String(v), label: 'Answer ' + (it.options.length + 1) }); changed(); render({ i: i, ed: 'opt:' + (it.options.length - 1) }); selectAllIn(edEl(i, 'opt:' + (it.options.length - 1))); return;
      }
      if (name === 'delcol') { record(); it.options.pop(); changed(); render({ i: i }); return; }
      if (name === 'up' || name === 'down') return move(i, name === 'up' ? -1 : 1);
      if (name === 'dup') {
        record(); var c = clone(it); c.id = uniqueId(list, it.id + '_copy'); (c.rows || []).forEach(function (r, k) { r.id = c.id + '_' + (k + 1); });
        pages = toPages(list); at = locate(pages, i); pages[at[0]].splice(at[1] + 1, 0, c); fromPages(list, pages); st.sel = i + 1; changed(); render({ i: i + 1 });
        return say('Duplicated as ' + c.id);
      }
      if (name === 'del') {
        var used = refsTo(list, it.id);
        record(); list.splice(i, 1); st.sel = Math.min(i, list.length - 1); changed(); render(st.sel >= 0 ? { i: st.sel } : null);
        return say(used ? 'Deleted ' + it.id + '. ' + used + (used === 1 ? ' question uses' : ' questions use') + ' it in display logic or piped text, so saving will fail until you change ' + (used === 1 ? 'it' : 'them') + '.' : 'Question deleted', true);
      }
      if (name === 'settings') {
        var f = insp.querySelector('input:not([type=checkbox]), select, textarea');
        insp.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); insp.classList.add('lc-flash'); setTimeout(function () { insp.classList.remove('lc-flash'); }, 700);
        if (f) f.focus({ preventScroll: true });
      }
    }
    function move(i, d) {
      var pages = toPages(list), at = locate(pages, i), p = at[0], k = at[1], it = pages[p][k];
      if (d < 0 && p === 0 && k === 0) return; if (d > 0 && p === pages.length - 1 && k === pages[p].length - 1) return;
      record(); pages[p].splice(k, 1);
      // Within a page, trade places; at the top or bottom of a page, cross the page break (a page left empty disappears).
      if (d < 0) { if (k > 0) pages[p].splice(k - 1, 0, it); else pages[p - 1].push(it); }
      else if (k < pages[p].length) pages[p].splice(k + 1, 0, it); else pages[p + 1].unshift(it);
      fromPages(list, pages); st.sel = list.indexOf(it); changed(); render({ i: st.sel });
      say('Moved to position ' + (st.sel + 1));
    }

    // ---------- the popover menu ----------
    function closeMenu(refocus) { if (!menu) return; var a = menu.anchor; menu.el.remove(); menu = null; if (refocus && a && a.isConnected) a.focus(); }
    function openMenu(anchor, mode, pick, current) {
      closeMenu();
      var el = document.createElement('div'); el.className = 'lc-menu'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', mode === 'kind' ? 'Question type' : 'Insert');
      el.innerHTML = menuHtml(mode, o, current); rootEl.appendChild(el);
      var a = anchor.getBoundingClientRect(), r = rootEl.getBoundingClientRect(), mw = el.offsetWidth, mh = el.offsetHeight;
      var left = Math.max(8, Math.min(a.left - r.left + a.width / 2 - mw / 2, rootEl.clientWidth - mw - 8));
      var below = a.bottom + mh + 12 < window.innerHeight || a.top - mh - 12 < 0;
      el.style.left = left + 'px'; el.style.top = (below ? a.bottom - r.top + 8 : a.top - r.top - mh - 8) + 'px';
      el.classList.add(below ? 'lc-from-top' : 'lc-from-bottom');
      menu = { el: el, anchor: anchor, pick: pick };
      var first = el.querySelector('[aria-checked="true"]') || el.querySelector('button'); if (first) first.focus({ preventScroll: true });
    }

    // ---------- events ----------
    rootEl.addEventListener('mousedown', function (e) {   // keep focus in a field when its own buttons are pressed
      if (e.target.closest('.lc-tools button, .lc-add, .lc-gapbtn') && !e.target.closest('[data-act="grip"]')) e.preventDefault();
    });
    rootEl.addEventListener('click', function (e) {
      var mi = e.target.closest('.lc-menu [data-kind]');
      if (mi && menu) { var pick = menu.pick; closeMenu(); pick(mi.getAttribute('data-kind')); return; }
      if (menu && !e.target.closest('.lc-menu')) { closeMenu(); return; }
      var b = e.target.closest('[data-act]');
      if (b && !b.disabled) { e.preventDefault(); var q = b.closest('.lc-q'); if (q) select(Number(q.getAttribute('data-i'))); settleTyping(); act(b.getAttribute('data-act'), b); return; }
      var qq = e.target.closest('.lc-q');
      if (qq) select(Number(qq.getAttribute('data-i')), !e.target.closest('[data-ed]'));
      else if (!e.target.closest('[data-ed]') && st.sel >= 0) { select(-1); }
    });
    rootEl.addEventListener('focusin', function (e) { var q = e.target.closest && e.target.closest('.lc-q'); if (q) select(Number(q.getAttribute('data-i'))); });
    rootEl.addEventListener('focusout', function (e) { var el = e.target; if (el.hasAttribute && el.hasAttribute('data-ed') && !menu) settle(el); });
    rootEl.addEventListener('input', function (e) {
      e.stopPropagation();   // the admin page's own field handlers never see the canvas
      if (o.preview) { answerFrom(e.target); return applyLogic(); }
      if (e.target.hasAttribute && e.target.hasAttribute('data-ed')) write(e.target);
    });
    rootEl.addEventListener('change', function (e) { e.stopPropagation(); if (o.preview) { answerFrom(e.target); applyLogic(); } });
    // Plain text only, even where the browser has no plain-text editing (contenteditable="true"): no formatting
    // commands, and a drop inserts the dragged text, never its markup.
    rootEl.addEventListener('beforeinput', function (e) {
      if (/^format/.test(e.inputType) || e.inputType === 'insertFromDrop' || e.inputType === 'insertFromPasteAsQuotation' || e.inputType === 'insertLink') e.preventDefault();
    });
    rootEl.addEventListener('dragover', function (e) { if (e.target.closest && e.target.closest('[data-ed]')) e.preventDefault(); });
    rootEl.addEventListener('drop', function (e) {
      var el = e.target.closest && e.target.closest('[data-ed]'); e.preventDefault();
      if (!el || o.readOnly || o.preview) return;
      var t = ((e.dataTransfer && e.dataTransfer.getData('text/plain')) || '').slice(0, MAXTEXT); if (!t) return;
      caret(el); if (!multiLine(el)) t = t.replace(/\s*\r?\n\s*/g, ' ');
      if (!(document.execCommand && document.execCommand('insertText', false, t))) { el.textContent += t; write(el); }
    });
    rootEl.addEventListener('paste', function (e) {
      var el = e.target.closest && e.target.closest('[data-ed]'); if (!el) return;
      e.preventDefault();
      var t = ((e.clipboardData || window.clipboardData).getData('text/plain') || '').slice(0, 4 * MAXTEXT), key = el.getAttribute('data-ed'), m = /^opt:(\d+)$/.exec(key);
      var lines = t.split(/\r?\n/).slice(0, 200).map(function (x) { return x.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim().slice(0, 300); }).filter(Boolean);
      var it = itemFor(el);
      // A pasted list in an option becomes one option per line (bullets and numbers dropped).
      if (m && it && it.type !== 'matrix' && lines.length > 1) {
        record(); typing = null; var k = Number(m[1]), keep = readEd(el).trim();
        if (PLACEHOLDER.test(keep)) keep = '';   // a placeholder ("Option 3") is replaced, as typing over it would
        var add = lines.map(function (l) { return { value: l, label: l }; });
        it.options.splice.apply(it.options, [keep ? k + 1 : k, keep ? 0 : 1].concat(add));
        changed(); render({ i: st.sel, ed: 'opt:' + (k + lines.length - (keep ? 0 : 1)) });
        return say(lines.length + ' options added');
      }
      if (!multiLine(el)) t = t.replace(/\s*\r?\n\s*/g, ' ');
      if (!(document.execCommand && document.execCommand('insertText', false, t))) {
        var s = window.getSelection(); if (s.rangeCount) { var r = s.getRangeAt(0); r.deleteContents(); r.insertNode(document.createTextNode(t)); r.collapse(false); }
        write(el);
      }
    });
    rootEl.addEventListener('keydown', function (e) {
      if (menu) {
        if (!menu.el.contains(e.target)) return;
        var items = [].slice.call(menu.el.querySelectorAll('button')), n = items.indexOf(e.target), cols = 2;
        var step = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (step) { e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, n + step))].focus(); }
        else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1].focus(); }
        else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(true); }
        return;
      }
      if (e.isComposing || e.keyCode === 229) return;   // an input method (Japanese, Chinese, Korean) is still composing: its Return is not ours
      var mod = e.metaKey || e.ctrlKey, el = e.target, key = el.getAttribute && el.getAttribute('data-ed'), q = el.closest && el.closest('.lc-q'), i = q ? Number(q.getAttribute('data-i')) : -1, m;
      if (o.preview) return;
      if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
      if (o.readOnly) return;
      if (mod && (e.key === 'd' || e.key === 'D') && i >= 0) { e.preventDefault(); settleTyping(); select(i); act('dup'); return; }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && i >= 0) { e.preventDefault(); settleTyping(); select(i); move(i, e.key === 'ArrowUp' ? -1 : 1); return; }
      if (key) {
        if (e.key === 'Escape') { e.preventDefault(); el.blur(); if (q) q.focus({ preventScroll: true }); return; }
        if (e.key === '/' && key === 'text' && q && !readEd(el).trim()) { e.preventDefault(); act('kind', q.querySelector('[data-act="kind"]')); return; }
        if (e.key === 'Enter' && !e.shiftKey && !multiLine(el)) {
          e.preventDefault();
          var it = list[i];
          if ((m = /^opt:(\d+)$/.exec(key)) && it && it.type !== 'matrix') {
            record(); typing = null; var k = Number(m[1]) + 1, nx = it.options.length + 1, lab = 'Option ' + nx;
            while (it.options.some(function (x) { return x.value === lab; })) lab = 'Option ' + (++nx);
            it.options.splice(k, 0, { value: lab, label: '' }); changed(); render({ i: i, ed: 'opt:' + k }); return;
          }
          if ((m = /^row:(\d+)$/.exec(key)) && it) { record(); typing = null; it.rows.splice(Number(m[1]) + 1, 0, { id: uniqueId(list, it.id + '_' + (it.rows.length + 1)), text: '' }); changed(); render({ i: i, ed: 'row:' + (Number(m[1]) + 1) }); return; }
          // The question text: on to its first option or label; anything else: done.
          var next = key === 'text' && q ? [].slice.call(q.querySelectorAll('[data-ed]')).filter(function (x) { return x !== el; })[0] : null;
          if (next) caret(next); else { el.blur(); if (q) q.focus({ preventScroll: true }); }
          return;
        }
        if (e.key === 'Backspace' && !readEd(el) && (m = /^(opt|row):(\d+)$/.exec(key)) && i >= 0) {
          var arr = m[1] === 'opt' ? list[i].options : list[i].rows;
          if (arr.length > 1 && !(m[1] === 'opt' && list[i].type === 'matrix')) {
            e.preventDefault(); record(); typing = null; var at = Number(m[2]); arr.splice(at, 1); changed();
            render({ i: i, ed: m[1] + ':' + Math.max(0, at - 1) });
          }
        }
        return;
      }
      if (q && el === q) {   // a selected question, not one of its fields
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); select(Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))), true); }
        else if (e.key === 'Enter') { e.preventDefault(); caret(edEl(i, 'text')); }
        else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); act('del'); }
        else if (e.key === 'Escape') { e.preventDefault(); select(-1); }
      }
    });

    // Drag to reorder: the question lifts and follows the pointer; a line shows where it will land (the nearest gap,
    // including the end of each page, so it can cross a page break).
    rootEl.addEventListener('pointerdown', function (e) {
      var g = e.target.closest('[data-act="grip"]'); if (!g || e.button) return;
      var q = g.closest('.lc-q'), i = Number(q.getAttribute('data-i')), y0 = e.clientY, line = document.createElement('div'), target = null, moved = false;
      e.preventDefault(); settleTyping(); line.className = 'lc-dropline'; rootEl.appendChild(line);
      try { g.setPointerCapture(e.pointerId); } catch (x) {}
      var slots = [].slice.call(rootEl.querySelectorAll('.lc-gap')).map(function (gp) { return { p: Number(gp.getAttribute('data-p')), k: Number(gp.getAttribute('data-k')), el: gp }; });
      var sc = shell.querySelector('.lc-scroll'), sTop = sc.scrollTop, wTop = window.scrollY;
      function mv(ev) {
        var dy = ev.clientY - y0 + (sc.scrollTop - sTop) + (window.scrollY - wTop); if (!moved && Math.abs(dy) < 4) return;
        if (!moved) { moved = true; q.classList.add('lc-lift'); }
        q.style.transform = 'translateY(' + dy + 'px)';
        var best = null;
        slots.forEach(function (s) { var y = s.el.getBoundingClientRect().top, d = Math.abs(y - ev.clientY); if (!best || d < best.d) best = { s: s, d: d, y: y }; });
        target = best.s;
        var r = rootEl.getBoundingClientRect(), card = target.el.closest('.card').getBoundingClientRect();
        line.style.top = (best.y - r.top) + 'px'; line.style.left = (card.left - r.left + 12) + 'px'; line.style.width = (card.width - 24) + 'px'; line.classList.add('lc-on');
        if (st.device === 'phone') { var b = sc.getBoundingClientRect(); if (ev.clientY < b.top + 48) sc.scrollTop -= 14; else if (ev.clientY > b.bottom - 48) sc.scrollTop += 14; }
        else if (ev.clientY < 60) window.scrollBy(0, -14); else if (ev.clientY > window.innerHeight - 60) window.scrollBy(0, 14);
      }
      function up() {
        g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); line.remove();
        q.classList.remove('lc-lift'); q.style.transform = '';
        if (!moved || !target) return;
        var pages = toPages(list), at = locate(pages, i), it = pages[at[0]][at[1]], k = target.k;
        if (target.p === at[0] && (k === at[1] || k === at[1] + 1)) return;
        record(); pages[at[0]].splice(at[1], 1); if (target.p === at[0] && k > at[1]) k--;
        pages[target.p].splice(k, 0, it); fromPages(list, pages); st.sel = list.indexOf(it); changed(); render({ i: st.sel });
        say('Moved to position ' + (st.sel + 1));
      }
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });

    // The designer bar and the toast are outside the canvas, styled by canvas.css.
    shell.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || sr.contains(b)) return;
      var v;
      if ((v = b.getAttribute('data-dev'))) { e.stopPropagation(); st.device = v; bar(); return; }
      if ((v = b.getAttribute('data-mode'))) {
        e.stopPropagation(); if (v === st.mode) return;
        settleTyping(); closeMenu();
        if (v === 'preview') { var sq = list[st.sel]; st.page = sq ? locate(toPages(list), st.sel)[0] : st.view || 0; }
        st.mode = v; render(null); say(v === 'preview' ? 'Preview: answer like a participant' : (o.readOnly ? 'Viewing' : 'Editing'));
        return;
      }
      if ((v = b.getAttribute('data-page')) != null) { e.stopPropagation(); goPage(Number(v)); return; }
      if ((v = b.getAttribute('data-bar'))) { e.stopPropagation(); if (v === 'undo') undo(); else if (v === 'redo') redo(); else if (v === 'clear') { st.answers = {}; render(null); say('Answers cleared'); } }
    });
    shell.addEventListener('keydown', function (e) {
      var g = e.target.closest && e.target.closest('[role="radiogroup"]');
      if (g && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        var other = [].slice.call(g.querySelectorAll('[role="radio"]')).filter(function (b) { return b.getAttribute('aria-checked') !== 'true'; })[0];
        if (other) { other.click(); other.focus(); }
      }
    });
    // The inspector holds admin.js fields bound to the same draft: redraw the canvas once their handlers have run.
    function later() {
      clearTimeout(later.t);
      later.t = setTimeout(function () {
        var it = list[st.sel];
        if (!inOrder(list)) { fromPages(list, toPages(list)); st.sel = list.indexOf(it); inspector(); }   // the inspector's paths follow the new order
        Object.keys(st.fresh).forEach(function (id) { if (!list.some(function (x) { return x.id === id; })) delete st.fresh[id]; });   // a name typed in the inspector is kept
        rootEl.innerHTML = canvasHtml(list, o, st); bar();
      }, 120);
    }
    insp.addEventListener('input', later); insp.addEventListener('change', later);

    loadCss().then(function (css) {
      var style = document.createElement('style'); style.textContent = css; sr.insertBefore(style, rootEl);
      render(null);
    }, function () { rootEl.innerHTML = '<p class="lc-loading">The participant view could not be loaded. Switch to List, or reload the page.</p>'; });
    bar(); inspector();
    return { render: render, state: st };
  }

  root.LabCanvas = { mount: mount, KINDS: KINDS,
    _t: { problems: problems, refsTo: refsTo, toPages: toPages, fromPages: fromPages, inOrder: inOrder, locate: locate, convert: convert, newQuestion: newQuestion, uniqueId: uniqueId, nameFrom: nameFrom, rename: rename, scaleLabels: scaleLabels, setPoints: setPoints, scopeCss: scopeCss, canvasHtml: canvasHtml, render: R } };
})(typeof window !== 'undefined' ? window : globalThis);
