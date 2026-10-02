/* Study type "vignettes": admin editors (Conditions & sessions, Items, Item questions) and the
   per-item pilot report. Loaded by static/lab/engine/admin.js. */
(function () {
  'use strict';
  var itemSel = null;
  var VFIELDS = [['title', 'Title'], ['from', 'Email sender'], ['subject', 'Email subject'], ['body', 'Text'], ['image', 'Image address'], ['imageAlt', 'Image description']];
  function items(A) { return A.draft.items; }
  function itemById(A, id) { return id === 'practice' ? A.draft.practice : items(A).filter(function (x) { return x.id === id; })[0]; }
  function sessionsUsing(A, id) { var out = []; A.draft.design.sessions.forEach(function (s, i) { if (s.items.indexOf(id) >= 0) out.push(i + 1); }); return out; }
  function conds(draft) { return (draft.design.conditions || []).map(function (c) { return c.id; }); }
  function blankItem(id, title) { return { id: id, title: title, kind: 'text', from: '', subject: '', body: '', image: '', imageAlt: '', variants: {} }; }
  // Renames a condition everywhere it is referenced (item wording, question and survey filters).
  function renameCondition(A, from, to) {
    var all = items(A).concat(A.draft.practice ? [A.draft.practice] : []);
    all.forEach(function (it) { if (it.variants && it.variants[from]) { it.variants[to] = it.variants[from]; delete it.variants[from]; } });
    var lists = [A.draft.questions || [], A.draft.survey.pre || [], A.draft.survey.post || []];
    lists.forEach(function (l) { l.forEach(function (q) { q.conditions = (q.conditions || []).map(function (c) { return c === from ? to : c; }); }); });
  }
  function dropCondition(A, id) {
    items(A).concat(A.draft.practice ? [A.draft.practice] : []).forEach(function (it) { if (it.variants) delete it.variants[id]; });
    [A.draft.questions || [], A.draft.survey.pre || [], A.draft.survey.post || []].forEach(function (l) { l.forEach(function (q) { q.conditions = (q.conditions || []).filter(function (c) { return c !== id; }); }); });
  }

  function renderDesign(A) {
    var d = A.draft.design, esc = A.esc, btn = A.btn;
    var h = '<h3 style="margin:0 0 8px">Conditions</h3><p class="muted">Each participant is assigned one condition, keeping the groups balanced. An item can have different wording per condition (Items tab), and questions can be limited to some conditions. The ID is saved in the <code>condition</code> column; keep it short.</p>' +
      d.conditions.map(function (c, i) {
        return '<div class="row" style="margin-bottom:6px"><label>ID <input type="text" class="mono" data-condid="' + i + '" value="' + esc(c.id) + '" style="width:160px"></label>' +
          '<label style="flex:1;min-width:200px">Label ' + A.inp('design.conditions.' + i + '.label', c.label, ' style="width:100%"') + '</label>' +
          btn('data-condrm="' + i + '"', 'Remove', 'danger secondary', d.conditions.length === 1) + '</div>';
      }).join('') + (d.conditions.length < 8 ? btn('data-condadd="1"', 'Add a condition') : '') +
      '<h3 style="margin:20px 0 8px">Sessions</h3><p class="muted">The study runs these sessions in order, each opening after the participant\'s gap days. A session with no items is survey-only (start- and end-of-session surveys).</p>' +
      A.checkbox('data-path="design.randomize" data-bool="1"', d.randomize, 'Show each session\'s items in a random order (otherwise in the order listed)') +
      A.checkbox('data-path="design.practice" data-bool="1"', d.practice, 'Start session 1 with the practice item (Items tab)');
    d.sessions.forEach(function (s, i) {
      var rest = items(A).filter(function (x) { return s.items.indexOf(x.id) < 0; });
      h += '<div class="qcard"><div class="bar"><strong>Session ' + (i + 1) + '</strong><div class="btns">' +
        btn('data-smove="' + i + '|-1"', '↑', null, i === 0) + btn('data-smove="' + i + '|1"', '↓', null, i === d.sessions.length - 1) +
        btn('data-sdup="' + i + '"', 'Duplicate') + btn('data-sremove="' + i + '"', 'Remove', 'danger secondary', d.sessions.length === 1) + '</div></div>' +
        (s.items.length ? '<ol class="order">' + s.items.map(function (id, j) {
          var it = itemById(A, id);
          return '<li><span>' + (j + 1) + '. ' + esc(it ? it.title : id) + ' <span class="muted mono">' + esc(id) + '</span></span><span class="btns">' +
            btn('data-imove="' + i + '|' + j + '|-1"', '↑', null, j === 0) + btn('data-imove="' + i + '|' + j + '|1"', '↓', null, j === s.items.length - 1) + btn('data-iremove="' + i + '|' + j + '"', 'Remove') + '</span></li>';
        }).join('') + '</ol>' : '<p class="muted">No items: survey-only session.</p>') +
        (rest.length ? '<div class="row"><label>Add item <select data-iadd="' + i + '"><option value="">Choose…</option>' + rest.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.title) + ' · ' + esc(x.id) + '</option>'; }).join('') + '</select></label>' +
          btn('data-iaddall="' + i + '"', 'Add all remaining (' + rest.length + ')') + '</div>' : '') + '</div>';
    });
    return h + '<button type="button" class="secondary" data-saddsession="1">Add a session</button>';
  }

  function renderItems(A) {
    var draft = A.draft, esc = A.esc, btn = A.btn, field = A.field, inp = A.inp, area = A.area;
    var list = [draft.practice].concat(items(A));
    var it = itemById(A, itemSel) || items(A)[0] || draft.practice, isP = it === draft.practice;
    var base = isP ? 'practice' : 'items.' + items(A).indexOf(it), used = isP ? [] : sessionsUsing(A, it.id), cs = draft.design.conditions;
    var h = '<div class="row" style="margin-bottom:8px"><label style="flex:1;min-width:240px">Item <select id="itemsel" style="width:100%">' + list.map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x === it ? ' selected' : '') + '>' + (x === draft.practice ? 'Practice item' : esc(x.title) + ' · ' + esc(x.id)) + '</option>';
      }).join('') + '</select></label>' + btn('data-additem="1"', 'Add item') + btn('data-dupitem="1"', 'Duplicate') + btn('data-delitem="1"', 'Delete', 'danger secondary', isP) + '</div>' +
      '<p class="muted">' + (isP ? 'Shown once at the start of session 1 when "practice item" is on (Conditions & sessions tab). Not analyzed.' : used.length ? 'Used in session' + (used.length > 1 ? 's ' : ' ') + used.join(', ') + '.' : '<strong>Not used in any session yet.</strong> Add it on the Conditions & sessions tab.') +
      ' Write a link as <code>[text](https://address)</code>: participants see a link that shows its address when pointed at but does not open, and hovers and clicks are recorded. Leave a blank line between paragraphs.</p>' +
      '<div class="grid3">' + field('Title (shown above the item)', inp(base + '.title', it.title)) + field('Shown as', A.sel(base + '.kind', it.kind, [['text', 'Plain text'], ['email', 'Email']])) +
      (isP ? '' : field('ID (in the CSV)', '<input type="text" class="mono" data-itemid="' + base + '" value="' + esc(it.id) + '">')) + '</div>' +
      (it.kind === 'email' ? '<div class="grid3">' + field('Sender', inp(base + '.from', it.from)) + field('Subject', inp(base + '.subject', it.subject)) + '</div>' : '') +
      field('Text', area(base + '.body', it.body, 8)) +
      '<div class="grid3">' + field('Image (optional: https:// address or /lab/ path)', inp(base + '.image', it.image)) + field('Image description (for screen readers)', inp(base + '.imageAlt', it.imageAlt)) + '</div>';
    if (cs.length > 1) {
      h += '<h3 style="margin:20px 0 8px">Wording per condition</h3><p class="muted">Leave a field blank to show the wording above. Fill it in to show different wording to that condition (for example, a warning banner in the body, or a different sender). Each answer records which wording was shown (<code>item_variant</code>).</p>';
      cs.forEach(function (c) {
        var v = (it.variants || {})[c.id] || {}, n = Object.keys(v).length;
        h += '<details class="vcard"' + (n ? ' open' : '') + '><summary><strong>' + esc(c.label) + '</strong> <span class="muted mono">' + esc(c.id) + '</span>' + (n ? ' · ' + n + ' field' + (n > 1 ? 's' : '') + ' changed' : ' · same as above') + '</summary>' +
          VFIELDS.filter(function (f) { return it.kind === 'email' || (f[0] !== 'from' && f[0] !== 'subject'); }).map(function (f) {
            var tag = f[0] === 'body' ? '<textarea rows="6" data-variant="' + base + '|' + esc(c.id) + '|' + f[0] + '">' + esc(v[f[0]] || '') + '</textarea>' : '<input type="text" data-variant="' + base + '|' + esc(c.id) + '|' + f[0] + '" value="' + esc(v[f[0]] || '') + '">';
            return field(f[1], tag);
          }).join('') + '</details>';
      });
    }
    return h;
  }

  LabAdmin.registerType('vignettes', {
    subtabs: [['design', 'Conditions & sessions'], ['items', 'Items'], ['questions', 'Item questions']],
    conditions: conds,
    onLoad: function (A) { if (!itemById(A, itemSel)) itemSel = (items(A)[0] || { id: 'practice' }).id; },
    render: function (sub, A) {
      if (sub === 'design') return renderDesign(A);
      if (sub === 'items') return renderItems(A);
      return '<p class="muted">Asked after every item (practice included). Tick conditions to ask a question only in those conditions. The variable name becomes the CSV column <code>a_&lt;name&gt;</code>: keep it if you only reword a question, and use a new name if it now measures something different.</p>' +
        A.qlist('questions', { sessions: false, rules: [], conditions: conds(A.draft) });
    },
    select: function (t, A) {
      if (t.id === 'itemsel') { itemSel = t.value; return true; }
      return false;
    },
    applyEdit: function (t, A) {
      var v, d = A.draft.design;
      if ((v = t.getAttribute('data-condid'))) {
        var c = d.conditions[Number(v)], to = t.value.trim();
        if (to && to !== c.id && !d.conditions.some(function (x) { return x.id === to; })) { renameCondition(A, c.id, to); c.id = to; }
        return false;
      }
      if ((v = t.getAttribute('data-itemid'))) {
        var it = A.getPath(v), nid = t.value.trim();
        if (!nid || nid === it.id || items(A).some(function (x) { return x.id === nid; })) return false;
        d.sessions.forEach(function (s) { s.items = s.items.map(function (x) { return x === it.id ? nid : x; }); });
        it.id = nid; itemSel = nid;
        return false;
      }
      if ((v = t.getAttribute('data-variant'))) {
        var p = v.split('|'), target = A.getPath(p[0]);
        target.variants = target.variants || {};
        var vv = target.variants[p[1]] || {};
        if (t.value.trim()) vv[p[2]] = t.value; else delete vv[p[2]];
        if (Object.keys(vv).length) target.variants[p[1]] = vv; else delete target.variants[p[1]];
        return false;
      }
      if ((v = t.getAttribute('data-iadd'))) {
        if (!t.value) return false;
        d.sessions[Number(v)].items.push(t.value);
        return true;
      }
      return undefined;
    },
    click: function (t, A) {
      var v, draft = A.draft, d = draft.design;
      if (t.hasAttribute('data-condadd')) {
        var n = d.conditions.length + 1, id = 'cond' + n;
        while (d.conditions.some(function (x) { return x.id === id; })) id = 'cond' + (++n);
        d.conditions.push({ id: id, label: 'Condition ' + n });
      } else if ((v = t.getAttribute('data-condrm'))) {
        var gone = d.conditions[Number(v)];
        if (!confirm('Remove condition "' + gone.label + '"? Its item wording is deleted too. Participants already assigned to it keep it.')) return false;
        d.conditions.splice(Number(v), 1); dropCondition(A, gone.id);
      } else if ((v = t.getAttribute('data-smove'))) { var sm = v.split('|'), si = Number(sm[0]), sj = si + Number(sm[1]), st = d.sessions[si]; d.sessions[si] = d.sessions[sj]; d.sessions[sj] = st; }
      else if ((v = t.getAttribute('data-sdup'))) d.sessions.splice(Number(v) + 1, 0, A.clone(d.sessions[Number(v)]));
      else if ((v = t.getAttribute('data-sremove'))) { if (!confirm('Remove session ' + (Number(v) + 1) + '?')) return false; d.sessions.splice(Number(v), 1); }
      else if (t.hasAttribute('data-saddsession')) d.sessions.push({ items: [] });
      else if ((v = t.getAttribute('data-imove'))) { var im = v.split('|'), arr = d.sessions[Number(im[0])].items, i = Number(im[1]), j = i + Number(im[2]), tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; }
      else if ((v = t.getAttribute('data-iremove'))) { var ir = v.split('|'); d.sessions[Number(ir[0])].items.splice(Number(ir[1]), 1); }
      else if ((v = t.getAttribute('data-iaddall'))) { var s = d.sessions[Number(v)]; items(A).forEach(function (x) { if (s.items.indexOf(x.id) < 0) s.items.push(x.id); }); }
      else if (t.hasAttribute('data-additem') || t.hasAttribute('data-dupitem')) {
        var nid = 'item-' + Date.now().toString(36), src = itemById(A, itemSel);
        var ni = t.hasAttribute('data-dupitem') && src ? A.clone(src) : blankItem(nid, 'New item');
        ni.id = nid; if (t.hasAttribute('data-dupitem')) ni.title += ' (copy)';
        draft.items.push(ni); itemSel = nid;
      } else if (t.hasAttribute('data-delitem')) {
        var del = itemById(A, itemSel), usedIn = sessionsUsing(A, del.id);
        if (!confirm('Delete "' + del.title + '"?' + (usedIn.length ? ' It will also be removed from session' + (usedIn.length > 1 ? 's ' : ' ') + usedIn.join(', ') + '.' : ''))) return false;
        d.sessions.forEach(function (s) { s.items = s.items.filter(function (x) { return x !== del.id; }); });
        draft.items.splice(draft.items.indexOf(del), 1); itemSel = (draft.items[0] || { id: 'practice' }).id;
      } else return false;
      return true;
    },

    reportIntro: 'How each item is answered, by condition, for tuning the study after a pilot. Look for items everyone answers the same way (no variance to study), items that take much longer than the rest, and conditions whose wording made no difference.',
    report: function (rows, content, R) {
      var esc = R.esc, mean = R.mean, num = R.num, qs = content.questions || [];
      var numeric = qs.filter(function (q) { return q.type === 'scale' || q.type === 'confidence'; }), choice = qs.filter(function (q) { return q.type === 'choice' || q.type === 'select'; });
      var titles = {}; (content.items || []).forEach(function (it) { titles[it.id] = it.title; });
      var g = {};
      rows.forEach(function (r) {
        var k = r.item_id + '|' + r.condition, x = g[k] = g[k] || { item: r.item_id, condition: r.condition, n: 0, secs: [], hov: [], clk: [], vals: {}, picks: {} };
        x.n++; var s = num(r.rt_ms); if (s != null) x.secs.push(s / 1000);
        x.hov.push(+r.link_hovers > 0 ? 1 : 0); x.clk.push(+r.link_clicks > 0 ? 1 : 0);
        numeric.forEach(function (q) { var v = num(r['a_' + q.id]); if (v != null) (x.vals[q.id] = x.vals[q.id] || []).push(v); });
        choice.forEach(function (q) { var v = r['a_' + q.id]; if (v !== '' && v != null) { var p = x.picks[q.id] = x.picks[q.id] || {}; p[v] = (p[v] || 0) + 1; } });
      });
      var table = Object.keys(g).sort().map(function (k) {
        var x = g[k], row = { item_id: x.item, title: titles[x.item] || '', condition: x.condition, answers: x.n, median_seconds: R.median(x.secs), hovered_a_link: mean(x.hov), clicked_a_link: mean(x.clk) };
        numeric.forEach(function (q) { row['mean_' + q.id] = x.vals[q.id] ? mean(x.vals[q.id]) : null; });
        choice.forEach(function (q) {
          var p = x.picks[q.id] || {}, top = Object.keys(p).sort(function (a, b) { return p[b] - p[a]; })[0], tot = Object.keys(p).reduce(function (s, v) { return s + p[v]; }, 0);
          row['top_' + q.id] = top ? top + ' (' + Math.round(p[top] / tot * 100) + '%)' : '';
        });
        return row;
      });
      var cols = ['item_id', 'title', 'condition', 'answers', 'median_seconds'].concat(numeric.map(function (q) { return 'mean_' + q.id; }), choice.map(function (q) { return 'top_' + q.id; }), ['hovered_a_link', 'clicked_a_link']);
      var f = function (c, v) { return v == null || v === '' ? '–' : /^(hovered|clicked)/.test(c) ? Math.round(v * 100) + '%' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(1) : esc(v); };
      var h = '<h2>By item and condition</h2><p class="muted">Means for rating scales and confidence; the most common answer for multiple choice; share of answers where a link in the item was pointed at or clicked.</p>' +
        '<div class="table-wrap"><table><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>' +
        table.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td' + (c === 'title' ? ' class="wrap-cell"' : '') + '>' + f(c, r[c]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
      return { html: h, table: { name: 'item_report', rows: table, cols: cols } };
    }
  });
})();
