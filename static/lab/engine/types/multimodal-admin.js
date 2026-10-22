/* Study type "multimodal": admin editors (Arms & blocks, Items, Decision & directory, Item questions), the
   "Recordings & calls" tab, and the per-item pilot report. Loaded by static/lab/engine/admin.js. */
(function () {
  'use strict';
  var itemSel = null, upload = { busy: false, msg: '' };
  var KINDS = [['text', 'Text', 'A passage to read: training material, a scenario, or instructions'], ['image', 'Image', 'A picture, with a description for screen readers'],
    ['audio', 'Audio clip', 'A voicemail or other recording, with a play button'], ['video', 'Video clip', 'A short video, with an optional transcript'],
    ['call', 'Phone call', 'The phone rings and an AI caller talks with the participant']];
  var STATES = [['opener', 'Opening line', 'Who is calling'], ['pretext', 'The reason for the call', 'The story'], ['ask', 'The request', 'What the caller asks for'],
    ['pressure1', 'If the participant does not do it (1)', 'First push'], ['pressure2', 'If they still do not (2)', 'Second push'], ['deflect', 'If they want to verify or call back', 'The caller\'s answer'],
    ['closeComply', 'Goodbye after they do it', ''], ['closeRefuse', 'Goodbye after they refuse', ''], ['close', 'Goodbye when time runs out', ''], ['callback', 'What the organization says if the participant calls its real number', 'The truth']];
  var VFIELDS = [['title', 'Title'], ['body', 'Text'], ['media', 'Media file (address)'], ['mediaAlt', 'Image or video description'], ['transcript', 'Transcript'], ['caller', 'Caller ID name'], ['number', 'Caller ID number']];

  function items(A) { return A.draft.items; }
  function itemById(A, id) { return id === 'practice' ? A.draft.practice : items(A).filter(function (x) { return x.id === id; })[0]; }
  function conds(draft) { return (draft.design.conditions || []).map(function (c) { return c.id; }); }
  function blocksUsing(A, id) { var out = []; A.draft.design.sessions.forEach(function (s, i) { s.blocks.forEach(function (b, j) { if (b.items.indexOf(id) >= 0) out.push('session ' + (i + 1) + ', block ' + (j + 1)); }); }); return out; }
  function blankItem(id, kind) {
    var it = { id: id, title: 'New ' + (kind === 'call' ? 'call' : kind), kind: kind, body: '', media: '', mediaAlt: '', transcript: '', mustFinish: kind === 'audio', maxPlays: kind === 'audio' ? 2 : 0, decide: kind !== 'text', ask: 'all', variants: {} };
    if (kind === 'call') { it.body = ''; it.decisionPrompt = 'How would you describe that call?'; it.call = { caller: 'Harborview Bank', number: '800-555-0100', callbackNumber: '', intent: 'attack', maxTurns: 8, ringSeconds: 30, persona: '', script: {} }; }
    return it;
  }
  function renameCondition(A, from, to) {
    items(A).concat(A.draft.practice ? [A.draft.practice] : []).forEach(function (it) { if (it.variants && it.variants[from]) { it.variants[to] = it.variants[from]; delete it.variants[from]; } });
    [A.draft.questions || [], A.draft.survey.pre || [], A.draft.survey.post || []].forEach(function (l) { l.forEach(function (q) { q.conditions = (q.conditions || []).map(function (c) { return c === from ? to : c; }); }); });
  }
  function dropCondition(A, id) {
    items(A).concat(A.draft.practice ? [A.draft.practice] : []).forEach(function (it) { if (it.variants) delete it.variants[id]; });
    [A.draft.questions || [], A.draft.survey.pre || [], A.draft.survey.post || []].forEach(function (l) { l.forEach(function (q) { q.conditions = (q.conditions || []).filter(function (c) { return c !== id; }); }); });
  }
  function readAsBase64(file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = function () { rej(new Error('The file could not be read.')); }; r.readAsDataURL(file); });
  }
  function mediaPreview(A, it) {
    var esc = A.esc, u = it.media;
    if (!u) return '';
    if (it.kind === 'image') return '<img class="ed-preview" src="' + esc(u) + '" alt="' + esc(it.mediaAlt || '') + '">';
    if (it.kind === 'audio') return '<audio class="ed-preview" controls preload="none" src="' + esc(u) + '"></audio>';
    if (it.kind === 'video') return '<video class="ed-preview" controls preload="metadata" src="' + esc(u) + '"></video>';
    return '';
  }

  // ---------- Arms & blocks ----------
  function renderDesign(A) {
    var d = A.draft.design, esc = A.esc, btn = A.btn;
    var h = '<h3 style="margin:0 0 8px">Arms (conditions)</h3><p class="muted">Each participant is assigned to one arm, keeping the arms balanced. Items can show different text or media per arm (Items tab). The arm\'s ID is saved in the <code>condition</code> column.</p>' +
      d.conditions.map(function (c, i) {
        return '<div class="row arm-row"><label>ID <input type="text" class="mono" data-condid="' + i + '" value="' + esc(c.id) + '" style="width:120px"></label>' +
          '<label style="flex:1;min-width:200px">Label ' + A.inp('design.conditions.' + i + '.label', c.label, ' style="width:100%"') + '</label>' +
          btn('data-condrm="' + i + '"', 'Remove', 'danger secondary', d.conditions.length === 1) + '</div>';
      }).join('') + (d.conditions.length < 12 ? btn('data-condadd="1"', 'Add an arm') : '') +
      '<h3 style="margin:24px 0 8px">Sessions and blocks</h3><p class="muted">A session is made of blocks shown in order (for example: training, then clips, then calls). Within a block, items can be shuffled for each participant.</p>' +
      A.checkbox('data-path="design.practice" data-bool="1"', d.practice, 'Start session 1 with the practice item (Items tab)');
    d.sessions.forEach(function (s, si) {
      h += '<div class="qcard"><div class="bar"><strong>Session ' + (si + 1) + '</strong><div class="btns">' + btn('data-sremove="' + si + '"', 'Remove session', 'danger secondary', d.sessions.length === 1) + '</div></div>';
      s.blocks.forEach(function (b, bi) {
        var rest = items(A).filter(function (x) { return b.items.indexOf(x.id) < 0; });
        h += '<div class="block"><div class="row"><label style="flex:1">Block ' + (bi + 1) + ' title ' + A.inp('design.sessions.' + si + '.blocks.' + bi + '.title', b.title || '', ' style="width:100%" placeholder="For example: Voicemails"') + '</label>' +
          A.checkbox('data-path="design.sessions.' + si + '.blocks.' + bi + '.randomize" data-bool="1"', b.randomize, 'Shuffle this block') +
          btn('data-bmove="' + si + '|' + bi + '|-1"', '↑', null, bi === 0) + btn('data-bmove="' + si + '|' + bi + '|1"', '↓', null, bi === s.blocks.length - 1) + btn('data-bremove="' + si + '|' + bi + '"', 'Remove block', 'danger secondary') + '</div>' +
          (b.items.length ? '<ol class="order">' + b.items.map(function (id, j) {
            var it = itemById(A, id);
            return '<li><span><span class="kind-pill k-' + esc(it ? it.kind : 'text') + '">' + esc(it ? it.kind : '?') + '</span> ' + esc(it ? it.title : id) + ' <span class="muted mono">' + esc(id) + '</span></span><span class="btns">' +
              btn('data-imove="' + si + '|' + bi + '|' + j + '|-1"', '↑', null, j === 0) + btn('data-imove="' + si + '|' + bi + '|' + j + '|1"', '↓', null, j === b.items.length - 1) + btn('data-iremove="' + si + '|' + bi + '|' + j + '"', 'Remove') + '</span></li>';
          }).join('') + '</ol>' : '<p class="muted">No items yet.</p>') +
          (rest.length ? '<div class="row"><label>Add item <select data-iadd="' + si + '|' + bi + '"><option value="">Choose…</option>' + rest.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.title) + ' · ' + esc(x.kind) + '</option>'; }).join('') + '</select></label></div>' : '') + '</div>';
      });
      h += btn('data-badd="' + si + '"', 'Add a block') + '</div>';
    });
    return h + '<button type="button" class="secondary" data-saddsession="1">Add a session</button>';
  }

  // ---------- Items ----------
  function renderItems(A) {
    var draft = A.draft, esc = A.esc, btn = A.btn, field = A.field, inp = A.inp, area = A.area, meta = A.meta() || {};
    var list = (draft.practice ? [draft.practice] : []).concat(items(A));
    var it = itemById(A, itemSel) || items(A)[0] || draft.practice;
    if (!it) return '<p class="muted">No items yet.</p>' + btn('data-additem="text"', 'Add an item');
    var isP = it === draft.practice, base = isP ? 'practice' : 'items.' + items(A).indexOf(it), used = isP ? [] : blocksUsing(A, it.id), cs = draft.design.conditions;
    var h = '<div class="row" style="margin-bottom:8px"><label style="flex:1;min-width:240px">Item <select id="itemsel" style="width:100%">' + list.map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x === it ? ' selected' : '') + '>' + (x === draft.practice ? 'Practice item' : esc(x.title) + ' · ' + esc(x.kind) + ' · ' + esc(x.id)) + '</option>';
      }).join('') + '</select></label>' + btn('data-additem="text"', 'Add an item') + btn('data-dupitem="1"', 'Duplicate') + btn('data-delitem="1"', 'Delete', 'danger secondary', isP) + '</div>' +
      '<p class="muted">' + (isP ? 'Shown once at the start of session 1 when the practice item is on (Arms & blocks tab). Not analyzed.' : used.length ? 'Used in ' + used.join('; ') + '.' : '<strong>Not used in any block yet.</strong> Add it on the Arms & blocks tab.') + '</p>';
    h += '<div class="kind-pick" role="radiogroup" aria-label="Kind of item">' + KINDS.map(function (k) {
      return '<label class="kind-opt' + (it.kind === k[0] ? ' on' : '') + '"><input type="radio" name="kind" data-kind="' + base + '" value="' + k[0] + '"' + (it.kind === k[0] ? ' checked' : '') + '><span class="kind-ic k-' + k[0] + '" aria-hidden="true"></span><strong>' + k[1] + '</strong><span>' + k[2] + '</span></label>';
    }).join('') + '</div>';
    h += '<div class="grid3">' + field('Title (shown above the item)', inp(base + '.title', it.title)) + (isP ? '' : field('ID (in the exports)', '<input type="text" class="mono" data-itemid="' + base + '" value="' + esc(it.id) + '">')) + '</div>';
    h += field(it.kind === 'text' ? 'Text' : 'Text shown with it (optional)', area(base + '.body', it.body, it.kind === 'text' ? 8 : 2));
    if (it.kind === 'image' || it.kind === 'audio' || it.kind === 'video') {
      h += '<div class="media-box"><div class="grid3">' + field('File address (upload below, or paste an https:// address)', inp(base + '.media', it.media, ' class="mono"')) +
        field(it.kind === 'audio' ? 'Description (optional)' : 'Description for screen readers', inp(base + '.mediaAlt', it.mediaAlt || '')) + '</div>' +
        '<div class="row"><label class="filepick">Upload a file <input type="file" id="ed-upload" data-target="' + base + '.media" accept="' + (it.kind === 'image' ? 'image/*' : it.kind === 'audio' ? 'audio/*' : 'video/*') + '"' + (upload.busy ? ' disabled' : '') + '></label>' +
        '<span class="muted" role="status">' + esc(upload.msg || ('Up to about ' + (meta.maxUploadMb || 2.5) + ' MB. Files get a random name, so the address never hints at the condition.')) + '</span></div>' + mediaPreview(A, it) + '</div>';
      if (it.kind !== 'image') h += '<div class="grid3">' + A.checkbox('data-path="' + base + '.mustFinish" data-bool="1"', it.mustFinish, 'Must be played to the end before answering') +
        field('Most plays (0 = no limit)', A.num(base + '.maxPlays', it.maxPlays || 0, 0, 20)) + A.checkbox('data-path="' + base + '.autoplay" data-bool="1"', it.autoplay, 'Start playing by itself') + '</div>' +
        field('Transcript (optional; participants can open it, and opening it is recorded)', area(base + '.transcript', it.transcript || '', 3));
    }
    if (it.kind === 'call') h += renderCall(A, it, base, meta);
    // what comes after the stimulus
    var qs = A.draft.questions || [], ask = it.ask;
    h += '<h3 style="margin:24px 0 8px">After it</h3>' + A.checkbox('data-path="' + base + '.decide" data-bool="1"', it.decide, 'Ask for the decision' + (A.draft.decision.mouseTracking ? ' (mouse-tracked)' : '') + ': "' + esc(A.draft.decision.prompt) + '"');
    if (it.decide) h += '<details class="vcard"' + (it.decisionPrompt || (it.decisionOptions && it.decisionOptions.length) ? ' open' : '') + '><summary>Use a different decision for this item</summary><div class="grid3">' +
      field('Prompt (blank = the study\'s)', inp(base + '.decisionPrompt', it.decisionPrompt || '')) +
      field('Options, one per line as "value | label" (blank = the study\'s)', '<textarea rows="3" class="mono" data-decopts="' + base + '">' + esc((it.decisionOptions || []).map(function (o) { return o.value + ' | ' + o.label; }).join('\n')) + '</textarea>') + '</div></details>';
    h += '<div class="f"><span>Questions to ask (Item questions tab)</span><div class="row"><label class="check"><input type="radio" name="askmode" data-askmode="' + base + '" value="all"' + (ask === 'all' ? ' checked' : '') + '> All</label>' +
      '<label class="check"><input type="radio" name="askmode" data-askmode="' + base + '" value="none"' + (ask === 'none' ? ' checked' : '') + '> None</label>' +
      '<label class="check"><input type="radio" name="askmode" data-askmode="' + base + '" value="some"' + (Array.isArray(ask) ? ' checked' : '') + '> Only these:</label>' +
      (Array.isArray(ask) ? qs.map(function (q) { return '<label class="check"><input type="checkbox" data-askq="' + base + '|' + esc(q.id) + '"' + (ask.indexOf(q.id) >= 0 ? ' checked' : '') + '> ' + esc(q.id) + '</label>'; }).join('') : '') + '</div></div>';
    if (it.kind !== 'call') h += A.checkbox('data-path="' + base + '.recordVoice" data-bool="1"', it.recordVoice, 'Ask for a spoken answer (recorded with consent; otherwise typed)') +
      (it.recordVoice ? field('What to say', inp(base + '.voicePrompt', it.voicePrompt || '', ' placeholder="In your own words, what would you say to this caller?"')) : '');
    if (cs.length > 1) {
      h += '<h3 style="margin:24px 0 8px">Different per arm</h3><p class="muted">Leave a field blank to use what is above. Fill it in to show that arm something else (for example its own training text, or a different clip). Each answer records which version was shown (<code>item_variant</code>).</p>';
      cs.forEach(function (c) {
        var v = (it.variants || {})[c.id] || {}, n = Object.keys(v).length;
        h += '<details class="vcard"' + (n ? ' open' : '') + '><summary><strong>' + esc(c.label) + '</strong> <span class="muted mono">' + esc(c.id) + '</span>' + (n ? ' · ' + n + ' field' + (n > 1 ? 's' : '') + ' changed' : ' · same as above') + '</summary>' +
          VFIELDS.filter(function (f) { return it.kind === 'call' ? ['title', 'caller', 'number'].indexOf(f[0]) >= 0 : f[0] !== 'caller' && f[0] !== 'number' && (it.kind !== 'text' || ['title', 'body'].indexOf(f[0]) >= 0); }).map(function (f) {
            var tag = f[0] === 'body' || f[0] === 'transcript' ? '<textarea rows="5" data-variant="' + base + '|' + esc(c.id) + '|' + f[0] + '">' + esc(v[f[0]] || '') + '</textarea>' : '<input type="text" data-variant="' + base + '|' + esc(c.id) + '|' + f[0] + '" value="' + esc(v[f[0]] || '') + '">';
            return field(f[1], tag);
          }).join('') + '</details>';
      });
    }
    return h;
  }
  function renderCall(A, it, base, meta) {
    var esc = A.esc, field = A.field, inp = A.inp, c = it.call, defs = (meta.scripts || {})[c.intent] || {}, dir = A.draft.directory || [];
    var h = '<div class="call-box"><h3 style="margin:0 0 8px">The call</h3><div class="grid3">' + field('Caller ID name', inp(base + '.call.caller', c.caller)) + field('Caller ID number (what the screen shows)', inp(base + '.call.number', c.number || '')) +
      field('The organization\'s real number (calling it back tells the truth)', '<select data-path="' + base + '.call.callbackNumber"><option value="">None</option>' + dir.map(function (d) { return '<option value="' + esc(d.number) + '"' + (d.number === c.callbackNumber ? ' selected' : '') + '>' + esc(d.name) + ' · ' + esc(d.number) + '</option>'; }).join('') + '</select>') + '</div>' +
      '<div class="f"><span>This caller is</span><div class="row"><label class="check"><input type="radio" name="intent" data-intent="' + base + '" value="attack"' + (c.intent === 'attack' ? ' checked' : '') + '> An attacker (vishing)</label>' +
      '<label class="check"><input type="radio" name="intent" data-intent="' + base + '" value="benign"' + (c.intent === 'benign' ? ' checked' : '') + '> A legitimate caller</label></div></div>' +
      '<div class="grid3">' + field('Rings for (seconds)', A.num(base + '.call.ringSeconds', c.ringSeconds || 30, 5, 120)) + field('Most turns before the caller ends the call', A.num(base + '.call.maxTurns', c.maxTurns || 8, 3, 20)) + '</div>' +
      field('Who the caller is (for the AI voice; one or two sentences)', area3(A, base + '.call.persona', c.persona || '')) +
      '<p class="muted">' + (meta.llm ? 'Claude rephrases each line below so it answers what the participant said, keeping its meaning. If it is slow or unavailable, the line is spoken as written.' : 'The caller speaks these lines as written. To have them rephrased naturally by Claude, add ANTHROPIC_API_KEY (see the researcher guide).') +
      ' The caller moves through the lines in order; asking to verify or call back gets the "verify" line; refusing twice, or doing what was asked, ends the call. Blank lines use the default shown in grey.</p>';
    STATES.forEach(function (s) {
      h += field(s[1], '<textarea rows="2" data-script="' + base + '|' + s[0] + '" placeholder="' + esc(defs[s[0]] || '') + '">' + esc((c.script || {})[s[0]] || '') + '</textarea>');
    });
    return h + '</div>';
  }
  function area3(A, path, v) { return A.area(path, v, 2); }

  // ---------- Decision & directory ----------
  function renderDecision(A) {
    var d = A.draft.decision, esc = A.esc, btn = A.btn;
    var h = '<h3 style="margin:0 0 8px">The decision</h3><p class="muted">Asked after every item that has "Ask for the decision" ticked. Each option\'s value is what the <code>decision</code> column holds.</p>' +
      A.field('Prompt', A.inp('decision.prompt', d.prompt)) +
      A.field('Options (2 to 4), one per line as "value | label"', '<textarea rows="4" class="mono" data-decopts="decision">' + esc(d.options.map(function (o) { return o.value + ' | ' + o.label; }).join('\n')) + '</textarea>') +
      A.checkbox('data-path="decision.mouseTracking" data-bool="1"', d.mouseTracking, 'Mouse tracking: participants click Start at the bottom, then move to an answer at the top. Exports MAD, AUC, x-flips, and timing.') +
      '<div class="mt-demo" aria-hidden="true">' + d.options.map(function (o) { return '<span>' + esc(o.label) + '</span>'; }).join('') + '<i>Start</i></div>' +
      '<h3 style="margin:24px 0 8px">Phone directory</h3><p class="muted">After a call, participants can look up a number here and call it. Calling the organization\'s real number (set on each call) plays its "callback" line; any other entry plays its greeting.</p>';
    (A.draft.directory || []).forEach(function (x, i) {
      h += '<div class="row arm-row"><label style="flex:2;min-width:220px">Name ' + A.inp('directory.' + i + '.name', x.name, ' style="width:100%"') + '</label><label>Number ' + A.inp('directory.' + i + '.number', x.number, ' class="mono" style="width:150px"') + '</label>' +
        '<label style="flex:2;min-width:220px">Greeting (optional) ' + A.inp('directory.' + i + '.greeting', x.greeting || '', ' style="width:100%" placeholder="Thank you for calling…"') + '</label>' + btn('data-dirrm="' + i + '"', 'Remove', 'danger secondary') + '</div>';
    });
    return h + btn('data-diradd="1"', 'Add a number');
  }

  // ---------- Recordings & calls tab ----------
  var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  // A .zip of stored (uncompressed) files: audio is already compressed, so this is fast and needs no library.
  function zip(files) {
    var parts = [], central = [], off = 0, enc = new TextEncoder();
    function u16(v) { return [v & 255, (v >>> 8) & 255]; } function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
      var head = new Uint8Array([].concat([0x50, 0x4b, 3, 4], u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(n), u32(n), u16(name.length), u16(0)));
      parts.push(head, name, f.data);
      central.push(new Uint8Array([].concat([0x50, 0x4b, 1, 2], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(n), u32(n), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), name);
      off += head.length + name.length + n;
    });
    var csize = central.reduce(function (s, x) { return s + x.length; }, 0);
    return new Blob(parts.concat(central, [new Uint8Array([].concat([0x50, 0x4b, 5, 6], u16(0), u16(0), u16(files.length), u16(files.length), u32(csize), u32(off), u16(0)))]), { type: 'application/zip' });
  }
  function b64bytes(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  var EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac' };
  function recordingsTab(sec, api) {
    var esc = api.esc, mgr = api.can('manager'), owner = api.can('owner');
    sec.innerHTML = '<h2>Call transcripts</h2><p class="muted">One row per turn of every call: what the participant said (with numbers, emails, and addresses removed before saving), what the caller said, the caller\'s state, and timing. Column definitions are in the codebook.</p>' +
      '<div class="row"><button type="button" class="secondary" id="rc-csv">Download call transcripts (CSV)</button></div>' +
      '<h2 style="margin-top:28px">Participant recordings</h2>' + (mgr ? '<p class="muted">Recorded only from participants who agreed to recording. Recordings identify people by voice: keep downloads on approved storage, and delete them on your IRB\'s schedule.</p><div class="row"><button type="button" class="secondary" id="rc-load">Show recordings</button><button type="button" class="secondary" id="rc-zip" disabled>Download all (.zip)</button>' +
        (owner ? '<button type="button" class="danger secondary" id="rc-del">Delete all recordings…</button>' : '') + '</div><p class="muted" id="rc-prog" role="status"></p><div class="table-wrap"><table id="rc-tbl"></table></div>' : '<p class="muted">Managers and owners can listen to and download recordings.</p>');
    var rows = [];
    sec.querySelector('#rc-csv').addEventListener('click', function () {
      api.err(); api.call('calls.csv').then(function (r) { return r.text(); }).then(function (t) { api.saveFile(t, api.studyId + '_call_turns_' + api.day() + '.csv', 'text/csv'); }).catch(function (e) { api.err(e.message); });
    });
    if (!mgr) return;
    function load() {
      api.getJSON('recordings').then(function (list) {
        rows = list;
        sec.querySelector('#rc-zip').disabled = !list.length;
        sec.querySelector('#rc-tbl').innerHTML = '<tr><th>Participant</th><th>Session</th><th>Item</th><th>Kind</th><th></th></tr>' + list.map(function (r, i) {
          return '<tr><td class="mono">' + esc(r.code) + '</td><td>' + r.session + '</td><td>' + esc(r.item) + '</td><td>' + esc(r.kind) + '</td><td><button type="button" class="secondary small" data-play="' + i + '">Listen</button> <span id="rc-a' + i + '"></span></td></tr>';
        }).join('') + (list.length ? '' : '<tr><td colspan="5" class="muted">No recordings yet.</td></tr>');
      }).catch(function (e) { api.err(e.message); });
    }
    sec.querySelector('#rc-load').addEventListener('click', load);
    sec.querySelector('#rc-tbl').addEventListener('click', function (e) {
      var i = e.target.getAttribute && e.target.getAttribute('data-play'); if (i == null) return;
      api.getJSON('recording?key=' + encodeURIComponent(rows[i].key)).then(function (r) {
        var url = URL.createObjectURL(new Blob([b64bytes(r.data)], { type: r.mime }));
        document.getElementById('rc-a' + i).innerHTML = '<audio controls autoplay src="' + url + '"></audio>';
      }).catch(function (x) { api.err(x.message); });
    });
    sec.querySelector('#rc-zip').addEventListener('click', function () {
      var b = sec.querySelector('#rc-zip'), files = [], prog = sec.querySelector('#rc-prog'); b.disabled = true;
      (function next(i) {
        if (i >= rows.length) { api.saveFile(zip(files), api.studyId + '_recordings_' + api.day() + '.zip'); prog.textContent = files.length + ' recordings saved.'; b.disabled = false; return; }
        prog.textContent = 'Fetching ' + (i + 1) + ' of ' + rows.length + '…';
        api.getJSON('recording?key=' + encodeURIComponent(rows[i].key)).then(function (r) {
          files.push({ name: rows[i].code + '_s' + rows[i].session + '_' + rows[i].item + '_' + rows[i].kind + '.' + (EXT[r.mime] || 'webm'), data: b64bytes(r.data) }); next(i + 1);
        }).catch(function (e) { api.err(e.message); b.disabled = false; });
      })(0);
    });
    var del = sec.querySelector('#rc-del');
    if (del) del.addEventListener('click', function () {
      var typed = prompt('This permanently deletes every participant recording in this study (transcripts and answers are kept). Type DELETE to confirm.');
      if (typed !== 'DELETE') return;
      api.postJSON('recordings-delete', { confirm: 'DELETE' }).then(function (r) { sec.querySelector('#rc-prog').textContent = r.deleted + ' recordings deleted.'; load(); }).catch(function (e) { api.err(e.message); });
    });
  }

  LabAdmin.registerType('multimodal', {
    subtabs: [['design', 'Arms & blocks'], ['items', 'Items'], ['decision', 'Decision & directory'], ['questions', 'Item questions']],
    conditions: conds,
    tabs: [{ id: 'recordings', label: 'Recordings & calls', role: 'viewer', render: recordingsTab }],
    onLoad: function (A) { if (!itemById(A, itemSel)) itemSel = (items(A)[0] || { id: 'practice' }).id; },
    render: function (sub, A) {
      if (sub === 'design') return renderDesign(A);
      if (sub === 'items') return renderItems(A);
      if (sub === 'decision') return renderDecision(A);
      return '<p class="muted">Questions an item can ask after its stimulus (choose which on the Items tab). Tick arms to ask a question only in those arms. The variable name becomes the column <code>a_&lt;name&gt;</code>.</p>' +
        A.qlist('questions', { sessions: false, rules: [], conditions: conds(A.draft) });
    },
    select: function (t, A) {
      if (t.id === 'itemsel') { itemSel = t.value; upload.msg = ''; return true; }
      if (t.id === 'ed-upload') {
        var f = t.files && t.files[0], target = t.getAttribute('data-target'), max = ((A.meta() || {}).maxUploadMb || 2.5) * 1e6;
        if (!f) return false;
        if (f.size > max) { upload.msg = 'That file is ' + (f.size / 1e6).toFixed(1) + ' MB, over the limit. Shorten or compress it, or put it on a public web address and paste the https:// address.'; return true; }
        upload.busy = true; upload.msg = 'Uploading ' + f.name + '…'; A.rerender();
        readAsBase64(f).then(function (b64) { return A.post('file-upload', { filename: f.name, mime: f.type, data: b64 }); }).then(function (r) {
          A.setPath(target, r.url); A.markDirty(); upload.msg = 'Uploaded ' + (r.filename || f.name) + '. Click Save changes to keep it.';
        }).catch(function (e) { upload.msg = ''; A.err(e.message); }).then(function () { upload.busy = false; A.rerender(); });
        return false;
      }
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
        d.sessions.forEach(function (s) { s.blocks.forEach(function (b) { b.items = b.items.map(function (x) { return x === it.id ? nid : x; }); }); });
        it.id = nid; itemSel = nid;
        return false;
      }
      if ((v = t.getAttribute('data-kind'))) {
        var k = A.getPath(v), fresh = blankItem(k.id, t.value);
        if (!confirm('Change this item to "' + t.value + '"? Fields that do not apply are cleared.')) return true;
        ['kind', 'mustFinish', 'maxPlays', 'decide', 'call', 'decisionPrompt'].forEach(function (f) { if (fresh[f] === undefined) delete k[f]; else k[f] = fresh[f]; });
        if (t.value === 'text' || t.value === 'call') { k.media = ''; k.transcript = ''; }
        return true;
      }
      if ((v = t.getAttribute('data-intent'))) { A.getPath(v).call.intent = t.value; return true; }
      if ((v = t.getAttribute('data-script'))) {
        var p = v.split('|'), call = A.getPath(p[0]).call; call.script = call.script || {};
        if (t.value.trim()) call.script[p[1]] = t.value; else delete call.script[p[1]];
        return false;
      }
      if ((v = t.getAttribute('data-askmode'))) { var a = A.getPath(v); a.ask = t.value === 'some' ? (A.draft.questions || []).map(function (q) { return q.id; }) : t.value; return true; }
      if ((v = t.getAttribute('data-askq'))) {
        var q = v.split('|'), ai = A.getPath(q[0]), list = (Array.isArray(ai.ask) ? ai.ask : []).filter(function (x) { return x !== q[1]; });
        if (t.checked) list.push(q[1]);
        ai.ask = (A.draft.questions || []).map(function (x) { return x.id; }).filter(function (x) { return list.indexOf(x) >= 0; });
        return false;
      }
      if ((v = t.getAttribute('data-decopts'))) {
        var opts = t.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
          var m = l.split(/\s*\|\s*/); var val = (m.length > 1 ? m[0] : m[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).slice(0, 31); return { value: val, label: m.length > 1 ? m.slice(1).join(' | ') : m[0] };
        });
        if (v === 'decision') A.draft.decision.options = opts; else { var di = A.getPath(v); if (opts.length) di.decisionOptions = opts; else delete di.decisionOptions; }
        return false;
      }
      if ((v = t.getAttribute('data-variant'))) {
        var vp = v.split('|'), target = A.getPath(vp[0]); target.variants = target.variants || {};
        var vv = target.variants[vp[1]] || {};
        if (t.value.trim()) vv[vp[2]] = t.value; else delete vv[vp[2]];
        if (Object.keys(vv).length) target.variants[vp[1]] = vv; else delete target.variants[vp[1]];
        return false;
      }
      if ((v = t.getAttribute('data-iadd'))) {
        if (!t.value) return false;
        var ib = v.split('|'); d.sessions[Number(ib[0])].blocks[Number(ib[1])].items.push(t.value);
        return true;
      }
      return undefined;
    },
    click: function (t, A) {
      var v, draft = A.draft, d = draft.design;
      if (t.hasAttribute('data-condadd')) {
        var n = d.conditions.length, id = 'a' + n;
        while (d.conditions.some(function (x) { return x.id === id; })) id = 'a' + (++n);
        d.conditions.push({ id: id, label: 'Arm ' + id.toUpperCase() });
      } else if ((v = t.getAttribute('data-condrm'))) {
        var gone = d.conditions[Number(v)];
        if (!confirm('Remove arm "' + gone.label + '"? Its item versions are deleted too. Participants already assigned to it keep it.')) return false;
        d.conditions.splice(Number(v), 1); dropCondition(A, gone.id);
      } else if ((v = t.getAttribute('data-sremove'))) { if (!confirm('Remove session ' + (Number(v) + 1) + '?')) return false; d.sessions.splice(Number(v), 1); }
      else if (t.hasAttribute('data-saddsession')) d.sessions.push({ blocks: [{ title: '', items: [], randomize: false }] });
      else if ((v = t.getAttribute('data-badd'))) d.sessions[Number(v)].blocks.push({ title: '', items: [], randomize: false });
      else if ((v = t.getAttribute('data-bremove'))) { var br = v.split('|'); if (!confirm('Remove this block? Its items stay on the Items tab.')) return false; d.sessions[Number(br[0])].blocks.splice(Number(br[1]), 1); }
      else if ((v = t.getAttribute('data-bmove'))) { var bm = v.split('|'), bl = d.sessions[Number(bm[0])].blocks, bi = Number(bm[1]), bj = bi + Number(bm[2]), bt = bl[bi]; bl[bi] = bl[bj]; bl[bj] = bt; }
      else if ((v = t.getAttribute('data-imove'))) { var im = v.split('|'), arr = d.sessions[Number(im[0])].blocks[Number(im[1])].items, i = Number(im[2]), j = i + Number(im[3]), tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; }
      else if ((v = t.getAttribute('data-iremove'))) { var ir = v.split('|'); d.sessions[Number(ir[0])].blocks[Number(ir[1])].items.splice(Number(ir[2]), 1); }
      else if ((v = t.getAttribute('data-additem')) || t.hasAttribute('data-dupitem')) {
        var nid = 'item-' + Date.now().toString(36), src = itemById(A, itemSel);
        var ni = t.hasAttribute('data-dupitem') && src ? A.clone(src) : blankItem(nid, v || 'text');
        ni.id = nid; if (t.hasAttribute('data-dupitem')) ni.title += ' (copy)';
        draft.items.push(ni); itemSel = nid; upload.msg = '';
      } else if (t.hasAttribute('data-delitem')) {
        var del = itemById(A, itemSel), usedIn = blocksUsing(A, del.id);
        if (!confirm('Delete "' + del.title + '"?' + (usedIn.length ? ' It is also removed from ' + usedIn.join('; ') + '.' : ''))) return false;
        d.sessions.forEach(function (s) { s.blocks.forEach(function (b) { b.items = b.items.filter(function (x) { return x !== del.id; }); }); });
        draft.items.splice(draft.items.indexOf(del), 1); itemSel = (draft.items[0] || { id: 'practice' }).id;
      } else if (t.hasAttribute('data-diradd')) draft.directory.push({ name: 'New number', number: '800-555-0100', greeting: '' });
      else if ((v = t.getAttribute('data-dirrm'))) draft.directory.splice(Number(v), 1);
      else return false;
      return true;
    },

    reportIntro: 'How each item is answered, by arm, for tuning the study after a pilot: decisions, decision paths (MAD: higher means more pull toward the other answer), how often clips were replayed, and how calls ended.',
    report: function (rows, content, R) {
      var esc = R.esc, mean = R.mean, num = R.num, titles = {}, opts = (content.decision.options || []).map(function (o) { return o.value; });
      (content.items || []).forEach(function (it) { titles[it.id] = it.title; });
      var g = {};
      rows.forEach(function (r) {
        var k = r.item_id + '|' + r.condition, x = g[k] = g[k] || { item: r.item_id, kind: r.item_kind, condition: r.condition, n: 0, secs: [], mad: [], plays: [], dec: {}, out: {} };
        x.n++; var s = num(r.rt_ms); if (s != null) x.secs.push(s / 1000);
        var m = num(r.mt_mad); if (m != null) x.mad.push(m);
        var p = num(r.media_plays); if (p != null) x.plays.push(p);
        if (r.decision) x.dec[r.decision] = (x.dec[r.decision] || 0) + 1;
        if (r.call_outcome) x.out[r.call_outcome] = (x.out[r.call_outcome] || 0) + 1;
      });
      var share = function (o, n) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).map(function (k) { return k + ' ' + Math.round(o[k] / n * 100) + '%'; }).join(', '); };
      var table = Object.keys(g).sort().map(function (k) {
        var x = g[k];
        return { item_id: x.item, title: titles[x.item] || '', kind: x.kind, arm: x.condition, answers: x.n, median_seconds: R.median(x.secs), mean_mad: x.mad.length ? mean(x.mad) : null, mean_plays: x.plays.length ? mean(x.plays) : null, decisions: share(x.dec, x.n), call_outcomes: share(x.out, x.n) };
      });
      var cols = ['item_id', 'title', 'kind', 'arm', 'answers', 'median_seconds', 'mean_mad', 'mean_plays', 'decisions', 'call_outcomes'];
      var f = function (v) { return v == null || v === '' ? '–' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : esc(v); };
      var h = '<h2>By item and arm</h2><p class="muted">Decision shares use the values ' + esc(opts.join(', ')) + '. A call outcome of "disclosed" means digits were read out to an attacker; "verified" means the participant insisted on verifying.</p>' +
        '<div class="table-wrap"><table><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>' +
        table.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td' + (c === 'title' || c === 'decisions' || c === 'call_outcomes' ? ' class="wrap-cell"' : '') + '>' + f(r[c]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
      return { html: h, table: { name: 'item_report', rows: table, cols: cols } };
    }
  });
})();
