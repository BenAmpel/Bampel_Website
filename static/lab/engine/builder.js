/* CCAIR Behavioral Lab: the study builder canvas (docs/designs/study-builder.md). One lane per session, each with its
   start questions, task blocks and end questions; the arms along the top; assignment marked where it happens.
   Every edit is a pure operation from builder-model.js: it is refused if it breaks a rule it did not already break,
   or (once real participants have signed up) if it changes what the structure lock freezes. Otherwise the canvas is
   compiled back into the study content in place, so Save in admin.js posts it as it posts any other tab.
   Loaded by multimodal-admin.js for builder studies; mount(host, opts) draws it. */
(function () {
  'use strict';
  var M = window.LabBuilderModel;
  var ui = { open: {}, msg: '', msgBad: false };   // which "Differs by arm" panels are open; the last message
  var VLABEL = { decisionPrompt: 'Decision question', body: 'Text', media: 'Media file (address)', mediaAlt: 'Image or video description' };
  var LOCKED = 'Not changed: real participants have signed up, so the arms, sessions, blocks, assignment session and who sees which question are fixed. You can still change wording, titles and what differs by arm.';

  function mount(host, o) {
    var esc = o.esc, draft = o.draft, canvas = M.decompile(draft), editable = !o.readOnly;

    function qById(id) { return (draft.survey.pre || []).concat(draft.survey.post || []).filter(function (q) { return q.id === id; })[0]; }
    function itById(id) { return (draft.items || []).filter(function (x) { return x.id === id; })[0]; }
    function short(s, n) { s = String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function qLabel(id) { var q = qById(id); return q ? short(q.text, 70) || '(no wording yet)' : id; }
    function itLabel(id) { var it = itById(id); return it ? short(it.title, 60) || id : id + ' (missing)'; }
    function armLabel(id) { var a = canvas.arms.filter(function (x) { return x.id === id; })[0]; return a ? a.label : id; }
    function say(m, bad) { ui.msg = m || ''; ui.msgBad = !!bad; var el = host.querySelector('.bd-msg'); if (el) { el.textContent = ui.msg; el.classList.toggle('bad', ui.msgBad); } }

    // Applies an edit. base is the content the edit starts from (the draft, or a copy with a new item added).
    function commit(next, base) {
      base = base || draft;
      var bad = M.introduced(canvas, next);
      if (bad.length) { say(bad.map(function (r) { return r.message; }).join(' '), true); return false; }
      var c = M.compile(next, base);
      if (o.locked && JSON.stringify(M.structure(c)) !== JSON.stringify(M.structure(draft))) { say(LOCKED, true); return false; }
      Object.keys(draft).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(c, k)) delete draft[k]; });
      Object.keys(c).forEach(function (k) { draft[k] = c[k]; });   // in place: admin.js saves this object
      canvas = M.decompile(draft); ui.msg = ''; o.onChange(); draw(); return true;
    }
    function uid(prefix, taken) { var k = 1; while (taken(prefix + k)) k++; return prefix + k; }

    // ---------- drawing ----------
    function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(label) + '</option>'; }
    function ibtn(b, label, data, extra) { return '<button type="button" class="bd-ib" data-b="' + b + '" ' + (data || '') + ' aria-label="' + esc(label) + '" title="' + esc(label) + '"' + (extra || '') + '>' + ({ up: '↑', down: '↓', del: '×' }[b.split('-')[1]] || '') + '</button>'; }

    function armsBar() {
      var n = canvas.arms.length, sizes = [], k;
      for (k = 2; k * n <= 100 && sizes.length < 8; k++) sizes.push(k * n);
      if (canvas.blockSize && sizes.indexOf(canvas.blockSize) < 0) sizes.push(canvas.blockSize);
      return '<section class="bd-arms" aria-label="Arms"><div class="bd-armlist">' + canvas.arms.map(function (a, i) {
        return '<div class="bd-arm"><span class="bd-dot" style="--i:' + i + '"></span><label class="sr-only" for="bd-arm-' + esc(a.id) + '">Name of arm ' + (i + 1) + '</label>' +
          '<input type="text" id="bd-arm-' + esc(a.id) + '" data-k="arm-' + esc(a.id) + '" data-b="arm-label" data-arm="' + esc(a.id) + '" value="' + esc(a.label) + '" maxlength="80">' +
          (n > M.MIN_ARMS ? ibtn('arm-del', 'Remove arm ' + a.label, 'data-arm="' + esc(a.id) + '"') : '') + '</div>';
      }).join('') + (n < M.MAX_ARMS ? '<button type="button" class="secondary small" data-b="arm-add" data-k="arm-add">Add an arm</button>' : '') + '</div>' +
        '<div class="bd-settings"><label>Assign to arms at <select data-b="assign" data-k="assign">' + canvas.sessions.map(function (s) { return opt(s.n, 'session ' + s.n, canvas.assignAt); }).join('') + '</select></label>' +
        '<label>Block size <select data-b="bsize" data-k="bsize">' + sizes.map(function (v) { return opt(v, v + ' (' + v / n + ' per arm)', canvas.blockSize); }).join('') + '</select></label></div></section>';
    }

    function questionChip(id, s, zone, i, list) {
      var arms = canvas.armOnly[id] || [], all = !arms.length, multi = arms.length > 1;
      var shown = '<select data-b="q-shown" data-q="' + esc(id) + '" data-k="qs-' + esc(id) + '-' + s.n + '" aria-label="Who sees ' + esc(qLabel(id)) + '">' + opt('', 'Every arm', all ? '' : 'x') +
        (multi ? opt('multi', arms.length + ' arms: ' + arms.map(armLabel).join(', '), 'multi') : '') +
        canvas.arms.map(function (a) { return opt(a.id, 'Only ' + a.label, !multi && arms[0] === a.id ? a.id : ''); }).join('') + '</select>';
      var move = '<select data-b="q-move" data-q="' + esc(id) + '" data-n="' + s.n + '" data-z="' + zone + '" data-k="qm-' + esc(id) + '-' + s.n + '" aria-label="Move or copy ' + esc(qLabel(id)) + '"><option value="">Move or copy…</option><optgroup label="Move to">' +
        canvas.sessions.map(function (t) { return ['start', 'end'].filter(function (z) { return t.n !== s.n || z !== zone; }).map(function (z) { return opt('m|' + t.n + '|' + z, 'Session ' + t.n + ', ' + (z === 'start' ? 'start' : 'end'), ''); }).join(''); }).join('') +
        '</optgroup><optgroup label="Also ask in">' + canvas.sessions.filter(function (t) { return t.n !== s.n && t.zones[zone].indexOf(id) < 0; }).map(function (t) { return opt('c|' + t.n + '|' + zone, 'Session ' + t.n, ''); }).join('') + '</optgroup></select>';
      var d = 'data-q="' + esc(id) + '" data-n="' + s.n + '" data-z="' + zone + '"';
      return '<li class="bd-chip bd-q' + (all ? '' : ' bd-armonly') + '" data-drag="q|' + esc(id) + '|' + s.n + '|' + zone + '">' +
        '<span class="bd-ct"' + (editable ? ' draggable="true" title="Drag to move"' : '') + '>' + esc(qLabel(id)) + ' <code>' + esc(id) + '</code></span><span class="bd-cc">' + shown + move +
        (i > 0 ? ibtn('q-up', 'Move up', d) : '') + (i < list.length - 1 ? ibtn('q-down', 'Move down', d) : '') + ibtn('q-del', 'Remove from session ' + s.n, d) + '</span></li>';
    }
    function qZone(s, zone) {
      var list = s.zones[zone], kind = zone === 'start' ? 'pre' : 'post';
      var others = canvas.order[kind].filter(function (id) { return list.indexOf(id) < 0; });
      return '<div class="bd-zone bd-' + zone + '"><h4>' + (zone === 'start' ? 'Start questions' : 'End questions') + '</h4>' +
        '<ul class="bd-list" data-dropq="' + s.n + '|' + zone + '">' + (list.length ? list.map(function (id, i) { return questionChip(id, s, zone, i, list); }).join('') : '<li class="bd-empty">None</li>') + '</ul>' +
        (editable ? '<div class="bd-add">' + (others.length ? '<select data-b="q-add" data-n="' + s.n + '" data-z="' + zone + '" data-k="qa-' + s.n + zone + '" aria-label="Add an existing question to session ' + s.n + '"><option value="">Add an existing question…</option>' + others.map(function (id) { return opt(id, qLabel(id), ''); }).join('') + '</select>' : '') +
          '<span class="bd-new"><input type="text" data-k="qn-' + s.n + zone + '" placeholder="New question" aria-label="Wording of a new ' + zone + ' question for session ' + s.n + '"><button type="button" class="secondary small" data-b="q-new" data-n="' + s.n + '" data-z="' + zone + '">Add</button></span></div>' : '') + '</div>';
    }

    function variants(id) {
      var it = itById(id) || {}, v = canvas.variants[id] || {}, nv = Object.keys(v).length;
      return '<details class="bd-var" data-open="' + esc(id) + '"' + (ui.open[id] ? ' open' : '') + '><summary>Differs by arm' + (nv ? ' (' + nv + ')' : '') + '</summary>' +
        M.VARIANT_FIELDS.map(function (f) {
          return '<fieldset class="bd-vf"><legend>' + VLABEL[f] + '</legend>' + canvas.arms.map(function (a) {
            var val = (v[f] || {})[a.id] || '', ph = short(it[f], 80) || '(empty)', big = f === 'body';
            return '<label><span>' + esc(a.label) + '</span>' + (big ? '<textarea rows="2"' : '<input type="text"') + ' data-b="var" data-it="' + esc(id) + '" data-f="' + f + '" data-arm="' + esc(a.id) + '" data-k="v-' + esc(id) + f + a.id + '" placeholder="Same as the item: ' + esc(ph) + '"' + (big ? '>' + esc(val) + '</textarea>' : ' value="' + esc(val) + '">') + '</label>';
          }).join('') + '</fieldset>';
        }).join('') + '<p class="muted">Leave a box empty and that arm sees the item\'s own wording (edit it on the Items tab).</p></details>';
    }
    function taskZone(s) {
      var blocks = s.zones.task;
      return '<div class="bd-zone bd-task"><h4>Task</h4>' + blocks.map(function (b, bi) {
        var d = 'data-n="' + s.n + '" data-blk="' + bi + '"', placed = {};
        canvas.sessions.forEach(function (t) { t.zones.task.forEach(function (x) { x.items.forEach(function (id) { placed[id] = true; }); }); });
        var spare = (draft.items || []).filter(function (it) { return b.items.indexOf(it.id) < 0; });
        return '<div class="bd-block"><div class="bd-bh"><input type="text" data-b="blk-title" ' + d + ' data-k="bt-' + s.n + '-' + bi + '" value="' + esc(b.title || '') + '" placeholder="Block ' + (bi + 1) + '" aria-label="Title of block ' + (bi + 1) + ' in session ' + s.n + '">' +
          '<label class="bd-rand"><input type="checkbox" data-b="blk-rand" ' + d + ' data-k="br-' + s.n + '-' + bi + '"' + (b.randomize ? ' checked' : '') + '> Shuffle</label>' +
          (bi > 0 ? ibtn('blk-up', 'Move block up', d) : '') + (bi < blocks.length - 1 ? ibtn('blk-down', 'Move block down', d) : '') + ibtn('blk-del', 'Remove block ' + (bi + 1), d) + '</div>' +
          '<ul class="bd-list" data-dropi="' + s.n + '|' + bi + '">' + (b.items.length ? b.items.map(function (id, i) {
            var it = itById(id) || {}, di = 'data-it="' + esc(id) + '" ' + d;
            return '<li class="bd-chip bd-item" data-drag="i|' + esc(id) + '|' + s.n + '|' + bi + '"><span class="bd-ct"' + (editable ? ' draggable="true" title="Drag to move"' : '') + '>' + esc(itLabel(id)) + ' <span class="bd-kind">' + esc(it.kind || '') + '</span></span><span class="bd-cc">' +
              '<button type="button" class="secondary small" data-b="it-edit" data-it="' + esc(id) + '">Edit</button>' +
              (i > 0 ? ibtn('it-up', 'Move up', di) : '') + (i < b.items.length - 1 ? ibtn('it-down', 'Move down', di) : '') + ibtn('it-del', 'Take out of this block', di) + '</span>' + variants(id) + '</li>';
          }).join('') : '<li class="bd-empty">No items yet</li>') + '</ul>' +
          (editable ? '<div class="bd-add"><select data-b="it-add" ' + d + ' data-k="ia-' + s.n + '-' + bi + '" aria-label="Add an item to block ' + (bi + 1) + '"><option value="">Add an item…</option>' +
            (spare.length ? '<optgroup label="Existing items">' + spare.map(function (it) { return opt(it.id, itLabel(it.id) + (placed[it.id] ? '' : ' (not placed)'), ''); }).join('') + '</optgroup>' : '') +
            '<optgroup label="New item">' + o.kinds.map(function (k) { return opt('new:' + k[0], 'New ' + k[1].toLowerCase(), ''); }).join('') + '</optgroup></select></div>' : '') + '</div>';
      }).join('') + (editable ? '<button type="button" class="secondary small" data-b="blk-add" data-n="' + s.n + '">Add a block</button>' : '') + '</div>';
    }

    function draw() {
      var focus = document.activeElement && host.contains(document.activeElement) ? document.activeElement.getAttribute('data-k') : null;
      var probs = M.check(canvas), h = '<div class="bd">';
      if (probs.length) h += '<div class="warn">Fix before saving: ' + probs.map(function (r) { return esc(r.message); }).join(' ') + '</div>';
      h += '<p class="muted bd-intro">Lay out the study: what each session asks at the start, the task blocks, and what it asks at the end. Drag a card to move it, or use its menu. Wording is edited on the Items and survey tabs.</p>';
      h += '<fieldset class="bd-fs"' + (editable ? '' : ' disabled') + '>' + armsBar() + '<div class="bd-msg" role="status" aria-live="polite"></div><div class="bd-lanes">' + canvas.sessions.map(function (s) {
        return '<section class="bd-sess" aria-label="Session ' + s.n + '"><header><h3>Session ' + s.n + '</h3>' + (canvas.sessions.length > 1 && editable ? ibtn('sess-del', 'Remove session ' + s.n, 'data-n="' + s.n + '"') : '') + '</header>' +
          qZone(s, 'start') + (s.n === canvas.assignAt ? '<div class="bd-band">Participants are assigned to an arm here, in blocks of ' + esc(canvas.blockSize) + '</div>' : '') +
          taskZone(s) + qZone(s, 'end') + '</section>';
      }).join('') + (editable ? '<button type="button" class="bd-addsess secondary" data-b="sess-add">Add a session</button>' : '') + '</div></fieldset>';
      h += '<details class="bd-gloss"><summary>What the words mean</summary><dl>' +
        '<dt>Arm</dt><dd>One version of the study (a condition). Each participant is in one arm for the whole study.</dd>' +
        '<dt>Assignment</dt><dd>The session where participants are put in an arm. Questions before it are the same for everyone.</dd>' +
        '<dt>Block size</dt><dd>Arms are dealt out in shuffled blocks so the arms stay the same size as people sign up. A block of 6 with 3 arms puts 2 people in each arm.</dd>' +
        '<dt>Start and end questions</dt><dd>Survey questions shown before and after the task in a session. "Every arm" or "Only" sets who sees one.</dd>' +
        '<dt>Task block</dt><dd>A group of items shown in order (or shuffled). Every arm sees the same items; what differs is set under "Differs by arm".</dd>' +
        '<dt>Structure lock</dt><dd>After the first real participant signs up, the parts above that decide assignment cannot change, so every participant is in the same design.</dd></dl></details></div>';
      host.innerHTML = h; say(ui.msg, ui.msgBad);
      if (focus) { var f = host.querySelector('[data-k="' + focus + '"]'); if (f) f.focus(); }
    }

    // ---------- events (stopped here, so admin.js's own editor handlers never see them) ----------
    function data(t, k) { return t.getAttribute('data-' + k); }
    function num(t, k) { return Number(data(t, k)); }
    function onChange(e) {
      e.stopPropagation(); var t = e.target, b = data(t, 'b'), O = M.ops; if (!b) return;
      if (b === 'arm-label') { if (t.value.trim()) commit(O.renameArm(canvas, data(t, 'arm'), t.value.trim())); else draw(); }
      else if (b === 'assign') commit(O.setAssignAt(canvas, Number(t.value))) || draw();
      else if (b === 'bsize') commit(O.setBlockSize(canvas, Number(t.value))) || draw();
      else if (b === 'q-shown') { if (t.value === 'multi') return; commit(O.setShownTo(canvas, data(t, 'q'), t.value ? [t.value] : [])) || draw(); }
      else if (b === 'q-move' && t.value) {
        var m = t.value.split('|'), id = data(t, 'q');
        commit(m[0] === 'm' ? O.placeQuestion(canvas, id, Number(m[1]), m[2], null, num(t, 'n')) : O.placeQuestion(canvas, id, Number(m[1]), m[2])) || draw();
      }
      else if (b === 'q-add' && t.value) commit(O.placeQuestion(canvas, t.value, num(t, 'n'), data(t, 'z'))) || draw();
      else if (b === 'blk-title') commit(O.setBlock(canvas, num(t, 'n'), num(t, 'blk'), { title: t.value.trim() }));
      else if (b === 'blk-rand') commit(O.setBlock(canvas, num(t, 'n'), num(t, 'blk'), { randomize: t.checked })) || draw();
      else if (b === 'it-add' && t.value) {
        var n = num(t, 'n'), bk = num(t, 'blk');
        if (t.value.indexOf('new:') === 0) {
          var base = JSON.parse(JSON.stringify(draft)), nid = uid('item', function (x) { return base.items.some(function (i) { return i.id === x; }); });
          base.items.push(o.newItem(nid, t.value.slice(4)));
          if (commit(O.placeItem(M.decompile(base), nid, n, bk), base)) say('Added "' + nid + '". Write its content on the Items tab.');
        } else commit(O.placeItem(canvas, t.value, n, bk)) || draw();
      }
      else if (b === 'var') commit(O.setVariant(canvas, data(t, 'it'), data(t, 'f'), data(t, 'arm'), t.value.trim()));
    }
    function onClick(e) {
      var t = e.target.closest ? e.target.closest('button') : null; if (!t || !host.contains(t)) return;
      e.stopPropagation(); var b = data(t, 'b'), O = M.ops; if (!b || t.disabled) return;
      var id = data(t, 'q'), n = num(t, 'n'), z = data(t, 'z'), bk = num(t, 'blk'), it = data(t, 'it');
      if (b === 'arm-add') commit(O.addArm(canvas, 'Arm ' + (canvas.arms.length + 1)));
      else if (b === 'arm-del') { if (confirm('Remove the arm "' + armLabel(data(t, 'arm')) + '" and its wording? Questions shown only to it are then shown to everyone.')) commit(O.removeArm(canvas, data(t, 'arm'))); }
      else if (b === 'sess-add') commit(O.addSession(canvas));
      else if (b === 'sess-del') { if (confirm('Remove session ' + n + '? Questions asked only in it are deleted; its items stay on the Items tab.')) commit(O.removeSession(canvas, n)); }
      else if (b === 'q-up' || b === 'q-down') {
        var l = canvas.sessions[n - 1].zones[z], i = l.indexOf(id), before = b === 'q-up' ? l[i - 1] : l[i + 2] || null;
        commit(O.placeQuestion(canvas, id, n, z, before, n));
      }
      else if (b === 'q-del') {
        if (O.lastPlacement(canvas, id) && !confirm('This is the only place "' + qLabel(id) + '" is asked, so it will be deleted from the survey. Delete it?')) return;
        commit(O.removeQuestion(canvas, id, n));
      }
      else if (b === 'q-new') {
        var inp = t.parentNode.querySelector('input'), text = inp.value.trim(); if (!text) { inp.focus(); return; }
        var kind = z === 'start' ? 'pre' : 'post', base = JSON.parse(JSON.stringify(draft)), all = base.survey.pre.concat(base.survey.post);
        var qid = uid('q', function (x) { return all.some(function (q) { return q.id === x; }); }), q = o.newQuestion(qid, kind);
        q.text = text; q.sessions = [n]; base.survey[kind].push(q);
        var cv = M.decompile(base); commit(cv, base);
      }
      else if (b === 'blk-add') commit(O.addBlock(canvas, n));
      else if (b === 'blk-del') { if (!canvas.sessions[n - 1].zones.task[bk].items.length || confirm('Remove this block? Its items stay on the Items tab.')) commit(O.removeBlock(canvas, n, bk)); }
      else if (b === 'blk-up' || b === 'blk-down') commit(O.moveBlock(canvas, n, bk, b === 'blk-up' ? -1 : 1));
      else if (b === 'it-up' || b === 'it-down') {
        var il = canvas.sessions[n - 1].zones.task[bk].items, j = il.indexOf(it);
        commit(O.placeItem(canvas, it, n, bk, b === 'it-up' ? il[j - 1] : il[j + 2] || null, n, bk));
      }
      else if (b === 'it-del') commit(O.removeItem(canvas, it, n, bk));
      else if (b === 'it-edit') o.editItem(it);
    }
    // Drag and drop for mouse users; every move is also in a menu or a button.
    var drag = null;
    function onDragStart(e) { var c = e.target.closest && e.target.closest('[data-drag]'); if (!c || !editable) return; drag = c.getAttribute('data-drag').split('|'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag[1]); } catch (x) {} c.classList.add('bd-dragging'); }
    function target(e) { var l = e.target.closest && e.target.closest(drag && drag[0] === 'q' ? '[data-dropq]' : '[data-dropi]'); return l && host.contains(l) ? l : null; }
    function onDragOver(e) { if (!drag) return; var l = target(e); if (!l) return; e.preventDefault(); host.querySelectorAll('.bd-over').forEach(function (x) { x.classList.remove('bd-over'); }); l.classList.add('bd-over'); }
    function onDrop(e) {
      if (!drag) return; var l = target(e); if (!l) return; e.preventDefault();
      var c = e.target.closest('[data-drag]'), before = c && c.getAttribute('data-drag').split('|')[1], dest = (l.getAttribute('data-dropq') || l.getAttribute('data-dropi')).split('|'), d = drag; drag = null;
      if (before === d[1]) return draw();
      if (d[0] === 'q') commit(M.ops.placeQuestion(canvas, d[1], Number(dest[0]), dest[1], before, Number(d[2]))) || draw();
      else commit(M.ops.placeItem(canvas, d[1], Number(dest[0]), Number(dest[1]), before, Number(d[2]), Number(d[3]))) || draw();
    }
    function onDragEnd() { drag = null; host.querySelectorAll('.bd-over,.bd-dragging').forEach(function (x) { x.classList.remove('bd-over', 'bd-dragging'); }); }

    host.addEventListener('change', onChange);
    host.addEventListener('input', function (e) { e.stopPropagation(); });
    host.addEventListener('click', onClick);
    host.addEventListener('toggle', function (e) { var id = e.target.getAttribute && e.target.getAttribute('data-open'); if (id != null) ui.open[id] = e.target.open; }, true);
    host.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.getAttribute('data-k') && /^qn-/.test(e.target.getAttribute('data-k'))) { e.preventDefault(); e.target.parentNode.querySelector('button').click(); } });
    host.addEventListener('dragstart', onDragStart); host.addEventListener('dragover', onDragOver); host.addEventListener('drop', onDrop); host.addEventListener('dragend', onDragEnd);
    draw();
  }
  window.LabBuilder = { mount: mount };
})();
