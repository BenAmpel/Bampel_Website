/* Study type "chatbot": the editor's Chatbot, Conditions, and Questions tabs, the Compare tab (one message answered
   by every condition side by side, read aloud on request, each reply checked against the study's list of behaviours;
   styles in chatbot-admin.css), and the Conversations tab (services that are switched on, and the transcript download). Each condition has its own instruction to the chatbot; that
   text is the manipulation, and participants never see it. Loaded by static/lab/engine/admin.js.
   Server side: netlify/lib/lab/types/chatbot.mjs. */
(function () {
  'use strict';
  function conds(d) { return d.design.conditions.map(function (c) { return c.id; }); }
  function onOff(v) { return v ? 'on' : 'not set up'; }

  function services(m, esc) {
    return '<div class="table-wrap"><table><tr><th>Service</th><th>Used for</th><th>Status</th></tr>' +
      '<tr><td>Claude (Anthropic)</td><td>The chatbot\'s replies' + (m.model ? ', model <code>' + esc(m.model) + '</code>' : '') + '</td><td>' + onOff(m.llm) + '</td></tr>' +
      '<tr><td>ElevenLabs</td><td>Turning recordings into text, and the chatbot\'s voice</td><td>' + onOff(m.eleven) + '</td></tr>' +
      '<tr><td>Lab speech services</td><td>Used when ElevenLabs does not answer</td><td>voice ' + onOff(m.labVoice) + ', listening ' + onOff(m.labEars) + '</td></tr></table></div>' +
      (m.llm ? '' : '<div class="warn" role="alert">The chatbot cannot reply until the site has an Anthropic API key (<code>ANTHROPIC_API_KEY</code> in the site\'s environment). Participants would see a message asking them to tell the research team.</div>');
  }

  function renderChat(A) {
    var c = A.draft.chat, m = A.meta() || {}, esc = A.esc, voice = c.mode !== 'text';
    return '<p class="muted">Each participant has one conversation per session, then answers the questions on the Questions tab. What the chatbot is told to do is on the Conditions tab.</p>' +
      services(m, esc) +
      '<div class="grid3">' +
        A.field('How participants talk to it', A.sel('chat.mode', c.mode, [['text', 'Typing'], ['voice', 'Speaking'], ['either', 'Typing or speaking']])) +
        A.field('Chatbot\'s name', A.inp('chat.botName', c.botName)) +
        A.field('Minutes per session (shown on the consent page)', A.num('minutesPerSession', A.draft.minutesPerSession, 1, 240)) +
        A.field('Fewest messages before the participant can end', A.num('chat.minTurns', c.minTurns, 1, 40)) +
        A.field('Most messages (the conversation ends itself)', A.num('chat.maxTurns', c.maxTurns, 1, 40)) +
      '</div>' +
      A.field('What participants are asked to talk about (shown above the conversation)', A.area('chat.scenario', c.scenario, 4)) +
      A.field('The chatbot\'s first line (the same in every condition; leave empty to let the participant begin)', A.area('chat.opening', c.opening, 2)) +
      '<h3>Voice</h3>' +
      (voice
        ? (c.mode === 'voice' ? '<p class="muted">In a spoken conversation the chatbot always answers aloud.</p>' +
            A.checkbox('data-path="chat.voice.audioOnly" data-bool="1"', !!c.voice.audioOnly, 'Audio only: participants see an animated orb, like a phone call, and never the text. The crisis message is still shown, and a reply that cannot be played at all is shown as text and counted (<code>chat_text_shown</code>).') : A.checkbox('data-path="chat.voice.speak" data-bool="1"', c.voice.speak, 'The chatbot also reads its messages aloud')) +
          A.field('ElevenLabs voice ID (empty uses the lab\'s default' + (m.defaultVoice ? ', ' + esc(m.defaultVoice) : '') + ')', A.inp('chat.voice.voiceId', c.voice.voiceId, ' class="mono"')) +
          '<p class="muted">Recordings are sent to be turned into text and are not kept; only the text is stored. In "Typing or speaking" the participant reads the text over before sending it, and the data records whether they changed it. If the voice service does not answer, the participant\'s browser reads the message aloud and the trial data counts it (<code>chat_browser_voice</code>).</p>'
        : '<p class="muted">Choose Speaking or Typing or speaking above to use the microphone and a spoken chatbot.</p>') +
      '<h3>Safety</h3><p class="muted">These apply in every condition. When a message mentions self-harm or an emergency, the chatbot is not asked at all: the participant gets the crisis message below, word for word, and the turn is marked <code>safety</code> in the transcript.</p>' +
      A.field('Crisis message', A.area('chat.safety.crisisLine', c.safety.crisisLine, 4)) +
      A.field('Safety rule given to the chatbot', A.area('chat.safety.rule', c.safety.rule, 3));
  }

  function renderConditions(A) {
    var d = A.draft, c = d.chat, m = A.meta() || {}, esc = A.esc, btn = A.btn;
    var h = (c.promptsReviewed ? '' : '<div class="warn" role="alert">These instructions are drafts. Read each one against your construct definitions, edit it, then tick the box at the bottom of this page.</div>') +
      '<p class="muted">Each participant is assigned one condition, keeping the groups balanced. The chatbot receives, in this order: the shared instruction, the condition\'s instruction, the safety rule, and a fixed line about format. Participants never see any of it. Every stored turn carries a short hash of the exact text the chatbot was given (<code>prompt_hash</code>), so an edit made part-way through data collection shows in the data.</p>' +
      A.field('Shared instruction (every condition)', A.area('chat.basePrompt', c.basePrompt, 6));
    d.design.conditions.forEach(function (x, i) {
      h += '<div class="qcard"><div class="bar"><strong>Condition ' + (i + 1) + '</strong><div class="btns">' + btn('data-condrm="' + i + '"', 'Remove', 'danger secondary', d.design.conditions.length === 1) + '</div></div>' +
        '<div class="row"><label>ID <input type="text" class="mono" data-condid="' + i + '" value="' + esc(x.id) + '"></label>' +
        '<label class="grow">Label ' + A.inp('design.conditions.' + i + '.label', x.label) + '</label></div>' +
        A.field('Instruction for this condition (empty means the shared instruction only)', A.area('chat.prompts.' + x.id, c.prompts[x.id] || '', 8)) + '</div>';
    });
    h += (d.design.conditions.length < 8 ? btn('data-condadd="1"', 'Add a condition') : '') +
      '<details><summary>The fixed line about format</summary><p class="muted">' + esc(m.formatRule || '') + '</p><p class="muted">Added when the chatbot speaks: ' + esc(m.spokenRule || '') + '</p></details>' +
      A.checkbox('data-path="chat.promptsReviewed" data-bool="1"', c.promptsReviewed, 'I have read and edited these instructions for this study') +
      rubricEditor(A) +
      '<h3>Sessions</h3><p class="muted">One conversation per session. A participant keeps the same condition in every session.</p>' +
      '<p>' + d.design.sessions.length + ' session' + (d.design.sessions.length === 1 ? '' : 's') + ' ' +
      (d.design.sessions.length < 12 ? btn('data-saddsession="1"', 'Add a session') : '') + (d.design.sessions.length > 1 ? btn('data-sremove="1"', 'Remove the last session', 'danger secondary') : '') + '</p>';
    return h;
  }

  // The behaviours the Compare tab looks for in each reply: the study's own definitions, in the study's own words.
  function rubricEditor(A) {
    var list = A.draft.chat.rubric || [], m = A.meta() || {}, max = m.rubricMax || 12;
    var h = '<h3>Behaviours to check</h3><p class="muted">Optional. List the behaviours that should tell your conditions apart, each with the definition a coder would use. On the Compare tab every reply is checked against this list, with the words that count as evidence marked, so you can see whether each instruction produces what it is meant to before any participant does. Participants and the chatbot never see the list.</p><div class="cb-rubric">';
    list.forEach(function (b, i) {
      h += '<div class="qcard"><div class="bar"><strong>Behaviour ' + (i + 1) + '</strong><div class="btns">' + A.btn('data-rubrm="' + i + '"', 'Remove', 'danger secondary') + '</div></div>' +
        '<div class="row"><label>ID ' + A.inp('chat.rubric.' + i + '.id', b.id, ' class="mono"') + '</label><label class="grow">Short name ' + A.inp('chat.rubric.' + i + '.label', b.label) + '</label></div>' +
        A.field('Definition (what a reply has to do to count)', A.area('chat.rubric.' + i + '.definition', b.definition, 3)) + '</div>';
    });
    return h + '</div>' + (list.length < max ? A.btn('data-rubadd="1"', 'Add a behaviour') : '');
  }

  function renameCondition(d, from, to) {
    d.chat.prompts[to] = d.chat.prompts[from] || ''; delete d.chat.prompts[from];
    [d.questions || [], d.survey.pre || [], d.survey.post || []].forEach(function (list) {
      list.forEach(function (q) { if (Array.isArray(q.conditions)) q.conditions = q.conditions.map(function (x) { return x === from ? to : x; }); });
    });
  }
  function dropCondition(d, id) {
    delete d.chat.prompts[id];
    [d.questions || [], d.survey.pre || [], d.survey.post || []].forEach(function (list) {
      list.forEach(function (q) { if (Array.isArray(q.conditions)) q.conditions = q.conditions.filter(function (x) { return x !== id; }); });
    });
  }

  // ----- the Conversations tab -----
  function conversations(el, X) {
    el.innerHTML = '<h2>Transcripts</h2><p class="muted">One row per turn: the participant\'s message, the chatbot\'s reply, the condition, the model, the response time, and whether the message was spoken or typed. Emails, street addresses, and long numbers are masked before a message is stored. Test participants are marked in the <code>test</code> column. The download is recorded in the audit log.</p>' +
      '<div class="row"><button type="button" id="cb-dl">Download the transcripts (CSV)</button></div>' +
      '<p class="muted">Per-conversation counts (turns, words, errors, time) are columns of the trials download; the codebook describes them.</p>';
    el.querySelector('#cb-dl').addEventListener('click', function () {
      X.err('');
      X.call('chat.csv').then(function (r) { return r.blob(); }).then(function (b) { X.saveFile(b, X.studyId + '_chat_' + X.day() + '.csv'); }).catch(function (e) { X.err(e.message); });
    });
  }

  // ----- the Compare tab -----
  // One message goes to every condition at once, each with its own history, and the replies sit side by side. Nothing
  // typed here is stored on the server: the run lives in this page until it is downloaded or the page is closed.
  var LETTERS = 'ABCDEFGH', SAMPLES = [
    'I failed an exam I spent weeks studying for, and I keep replaying it.',
    'My closest friend moved away last month. The evenings are very quiet now.',
    'I was passed over for a promotion and found out from a group email.'
  ];
  var B = null;   // { study, conds, order, rubric, rounds, blind, busy }
  function still() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; } }
  function secs(ms) { return (Math.round(ms / 100) / 10).toFixed(1) + ' s'; }
  function b64Blob(b64, mime) { var bin = atob(b64), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }

  function compare(el, X) {
    var esc = X.esc;
    if (!document.querySelector('link[href="/lab/engine/types/chatbot-admin.css"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/lab/engine/types/chatbot-admin.css'; document.head.appendChild(l); }
    el.innerHTML = '<h2>Compare the conditions</h2><p class="muted">Loading the saved study…</p>';
    X.getJSON('content').then(function (c) {
      var conds = (c.design && c.design.conditions || []).map(function (x) { return { id: x.id, label: x.label, prompt: (c.chat.prompts || {})[x.id] || '' }; });
      var sig = JSON.stringify([conds, c.chat.rubric || [], c.chat.basePrompt, c.chat.opening]);
      if (!B || B.study !== X.studyId || B.sig !== sig) B = { study: X.studyId, sig: sig, conds: conds, order: conds.map(function (x, i) { return i; }), rubric: c.chat.rubric || [], rounds: [], blind: false, busy: 0 };
      B.opening = c.chat.opening || ''; B.botName = c.chat.botName || 'Chatbot'; B.meta = c._meta || {};
      draw();
    }).catch(function (e) { el.innerHTML = '<h2>Compare the conditions</h2>'; X.err(e.message); });

    function shown() { return B.order.map(function (i) { return B.conds[i]; }); }
    function draw() {
      var on = !!B.meta.llm;
      el.innerHTML = '<h2>Compare the conditions</h2>' +
        '<p class="muted cb-intro">Write what a participant might say. Every condition answers it at once, from the same instruction its participants\' chatbot is given, so you can read the manipulation before anyone is assigned to it. Each condition keeps its own conversation, so you can go several messages deep. This uses the saved study: save your edits first.</p>' +
        (on ? '' : '<div class="warn" role="alert">The chatbot is not set up on this site, so there is nothing to compare yet (no Anthropic API key).</div>') +
        '<form class="cb-compose" id="cb-form"><label class="f">Participant\'s message<textarea id="cb-msg" rows="2" maxlength="1500" placeholder="Something that has been on their mind"' + (on ? '' : ' disabled') + '></textarea></label>' +
        '<button type="submit" class="primary" id="cb-send"' + (on ? '' : ' disabled') + '>Send to every condition</button></form>' +
        '<div class="cb-samples"><span>Or start from:</span>' + SAMPLES.map(function (s, i) { return '<button type="button" data-sample="' + i + '"' + (on ? '' : ' disabled') + '>' + esc(s) + '</button>'; }).join('') + '</div>' +
        '<div class="cb-tools"><button type="button" class="secondary small" id="cb-blind" aria-pressed="' + B.blind + '">' + (B.blind ? 'Show the condition names' : 'Hide the condition names') + '</button>' +
        '<button type="button" class="secondary small" id="cb-csv"' + (B.rounds.length ? '' : ' disabled') + '>Download this run (CSV)</button>' +
        '<button type="button" class="secondary small" id="cb-reset"' + (B.rounds.length ? '' : ' disabled') + '>Start over</button><span class="cb-count" id="cb-count"></span></div>' +
        '<div class="cb-scroll"><div class="cb-board" id="cb-board" data-n="' + B.conds.length + '"></div></div><div class="cb-matrix" id="cb-matrix"></div>';
      board(); matrix();
      el.querySelector('#cb-form').addEventListener('submit', function (ev) { ev.preventDefault(); send(); });
      el.querySelector('#cb-msg').addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(); } });
      el.querySelector('.cb-samples').addEventListener('click', function (ev) { var t = ev.target.closest('[data-sample]'); if (!t) return; var m = el.querySelector('#cb-msg'); m.value = SAMPLES[Number(t.getAttribute('data-sample'))]; m.focus(); });
      el.querySelector('#cb-blind').addEventListener('click', function () {
        B.blind = !B.blind;
        // Hidden: the columns are shuffled, so position gives nothing away. Shown again: back to the study's order.
        if (B.blind) { for (var i = B.order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = B.order[i]; B.order[i] = B.order[j]; B.order[j] = t; } }
        else B.order = B.conds.map(function (x, i) { return i; });
        stopAudio();
        draw();
      });
      el.querySelector('#cb-reset').addEventListener('click', function () { if (B.busy) return; stopAudio(); B.rounds = []; B.order = B.conds.map(function (x, i) { return i; }); B.blind = false; draw(); });
      el.querySelector('#cb-csv').addEventListener('click', download);
      el.querySelector('#cb-board').addEventListener('click', boardClick);
    }

    function head(c, i) {
      return '<div class="cb-head"><div class="cb-name"><span class="cb-letter" aria-hidden="true">' + LETTERS[i] + '</span><span>' + (B.blind ? 'Condition ' + LETTERS[i] : esc(c.label)) + '</span></div>' +
        (B.blind ? '<div class="cb-sub">Name hidden</div>' : '<div class="cb-sub mono">' + esc(c.id) + '</div><details><summary>Instruction for this condition</summary><p>' + (c.prompt ? esc(c.prompt) : 'None: the shared instruction only.') + '</p></details>') + '</div>';
    }
    function board() {
      var cs = shown(), h = cs.map(head).join('');
      if (B.opening) h += '<div class="cb-said cb-opening"><b>' + esc(B.botName) + ' opens</b><span>' + esc(B.opening) + '</span></div>';
      if (!B.rounds.length) h += '<div class="cb-empty">Nothing sent yet. The replies will appear here, one column per condition.</div>';
      B.rounds.forEach(function (r, ri) {
        h += '<div class="cb-said"><b>Participant</b><span>' + esc(r.text) + '</span></div>';
        cs.forEach(function (c) { h += '<div class="cb-cell" data-cell="' + ri + ':' + esc(c.id) + '"></div>'; });
      });
      var bd = el.querySelector('#cb-board'); bd.innerHTML = h;
      B.rounds.forEach(function (r, ri) { cs.forEach(function (c) { cell(ri, c.id, false); }); });
      count();
    }
    function count() {
      var n = 0; B.rounds.forEach(function (r) { Object.keys(r.replies).forEach(function (k) { if (r.replies[k].status === 'ok') n++; }); });
      var c = el.querySelector('#cb-count'); if (c) c.textContent = B.rounds.length ? B.rounds.length + ' message' + (B.rounds.length === 1 ? '' : 's') + ', ' + n + ' repl' + (n === 1 ? 'y' : 'ies') : '';
    }
    function chips(rep, key) {
      if (!B.rubric.length || rep.source === 'safety') return '';
      if (rep.codes === 'wait') return '<div class="cb-checking">Checking against the listed behaviours…</div>';
      if (rep.codes === 'err') return '<div class="cb-checking">The check did not come back. <button type="button" class="secondary small" data-recode="' + key + '">Try again</button></div>';
      if (!rep.codes) return '';
      return '<div class="cb-chips">' + B.rubric.map(function (b) {
        var c = rep.codes[b.id] || {}, st = c.present === true ? 'on' : c.present === false ? 'off' : 'unknown';
        return st === 'on'
          ? '<button type="button" class="cb-chip is-on" aria-pressed="false" data-ev="' + key + '" data-b="' + esc(b.id) + '" title="' + (c.evidence ? 'Show the words that count' : 'Present') + '">' + esc(b.label) + '</button>'
          : '<span class="cb-chip is-' + st + '" title="' + (st === 'off' ? 'Not in this reply' : 'Not coded') + '">' + esc(b.label) + '<span class="sr-only">' + (st === 'off' ? ' (absent)' : ' (not coded)') + '</span></span>';
      }).join('') + '</div>';
    }
    // Draw one reply. fresh = it has just arrived, so it writes itself in (unless the reader asked for less motion).
    function cell(ri, cid, fresh) {
      var box = el.querySelector('[data-cell="' + ri + ':' + cid + '"]'), rep = B.rounds[ri] && B.rounds[ri].replies[cid], key = ri + ':' + cid;
      if (!box || !rep) return;
      box.className = 'cb-cell' + (rep.status === 'err' ? ' is-error' : '') + (rep.source === 'safety' ? ' is-safety' : '') + (fresh ? ' is-new' : '');
      if (rep.status === 'wait') { box.innerHTML = '<span class="cb-dots" role="status" aria-label="Writing"><i></i><i></i><i></i></span>'; return; }
      if (rep.status === 'err') { box.innerHTML = '<p class="cb-text">' + esc(rep.error) + '</p><div class="cb-meta"><button type="button" class="secondary" data-retry="' + key + '">Try again</button></div>'; return; }
      box.innerHTML = '<p class="cb-text" data-text="' + key + '"></p><div class="cb-meta"><span>' + (rep.source === 'safety' ? 'Crisis message, the chatbot was not asked' : secs(rep.ms) + '</span><span>' + rep.words + ' words') + '</span>' +
        '<button type="button" class="secondary" data-play="' + key + '" aria-pressed="false">Play</button></div><div data-chips="' + key + '">' + chips(rep, key) + '</div>';
      var p = box.querySelector('.cb-text');
      if (!fresh || still()) { p.textContent = rep.text; return; }
      var words = rep.text.split(' '), n = 0, t0 = null, per = Math.min(34, 1500 / words.length);
      (function step(ts) {
        if (!p.isConnected) return;
        if (t0 == null) t0 = ts;
        var want = Math.min(words.length, Math.floor((ts - t0) / per) + 1);
        if (want !== n) { n = want; p.textContent = words.slice(0, n).join(' '); }
        if (n < words.length) requestAnimationFrame(step);
      })(performance.now());
    }
    function refreshChips(ri, cid) {
      var k = ri + ':' + cid, slot = el.querySelector('[data-chips="' + k + '"]'), rep = B.rounds[ri] && B.rounds[ri].replies[cid];
      if (slot && rep) slot.innerHTML = chips(rep, k);
      matrix();
    }
    function matrix() {
      var host = el.querySelector('#cb-matrix'); if (!host) return;
      if (!B.rubric.length) { host.innerHTML = '<p class="muted">No behaviours are listed for this study. Add them at the bottom of the Conditions tab and each reply here will be checked against them.</p>'; return; }
      var cs = shown();
      var h = '<h3>Behaviours by condition</h3><div class="table-wrap"><table><thead><tr><th scope="col">Behaviour</th>' + cs.map(function (c, i) { return '<th scope="col">' + LETTERS[i] + (B.blind ? '' : ' · ' + esc(c.label)) + '</th>'; }).join('') + '</tr></thead><tbody>';
      B.rubric.forEach(function (b) {
        h += '<tr><th scope="row">' + esc(b.label) + '<small>' + esc(b.definition) + '</small></th>' + cs.map(function (c) {
          var yes = 0, n = 0;
          B.rounds.forEach(function (r) { var rep = r.replies[c.id], k = rep && rep.codes && rep.codes[b.id]; if (k && typeof k.present === 'boolean') { n++; if (k.present) yes++; } });
          return '<td>' + (n ? '<div class="cb-bar"><span><i data-fill="' + Math.round(10 * yes / n) + '"></i></span>' + yes + ' of ' + n + '</div>' : '<span class="muted">none yet</span>') + '</td>';
        }).join('') + '</tr>';
      });
      host.innerHTML = h + '</tbody></table></div><p class="muted">Counts are replies in this run that show the behaviour. The check is made by the same model, working only from your definitions, and it marks the words it relied on. Treat it as a first look at the manipulation, then confirm with human coders on real transcripts.</p>';
    }

    function history(cid, upto) {
      return B.rounds.slice(0, upto).filter(function (r) { return r.replies[cid] && r.replies[cid].status === 'ok'; }).map(function (r) { return { user: r.text, bot: r.replies[cid].text }; });
    }
    function settle() { B.busy--; if (B.busy <= 0) { B.busy = 0; var s = el.querySelector('#cb-send'); if (s) { s.disabled = false; s.textContent = 'Send to every condition'; } } count(); }
    function ask(ri, cid) {
      var r = B.rounds[ri]; r.replies[cid] = { status: 'wait' }; cell(ri, cid, false); B.busy++;
      return X.postJSON('bench', { condition: cid, turns: history(cid, ri), text: r.text }).then(function (j) {
        if (B.rounds[ri] !== r) return;
        r.replies[cid] = { status: 'ok', text: j.text, ms: j.ms, words: j.words, model: j.model, source: j.source, promptHash: j.promptHash, codes: null };
        cell(ri, cid, true);
        if (B.rubric.length && j.source !== 'safety') codeIt(ri, cid);
      }).catch(function (e) {
        if (B.rounds[ri] !== r) return;
        r.replies[cid] = { status: 'err', error: e.message }; cell(ri, cid, false);
      }).then(settle);
    }
    function codeIt(ri, cid) {
      var r = B.rounds[ri], rep = r.replies[cid]; rep.codes = 'wait'; refreshChips(ri, cid);
      X.postJSON('bench-code', { text: rep.text }).then(function (j) {
        if (B.rounds[ri] !== r || r.replies[cid] !== rep) return;
        rep.codes = {}; (j.codes || []).forEach(function (c) { rep.codes[c.id] = c; }); rep.rubricHash = j.rubricHash;
      }).catch(function () { if (r.replies[cid] === rep) rep.codes = 'err'; }).then(function () { if (B.rounds[ri] === r) refreshChips(ri, cid); });
    }
    function send() {
      var m = el.querySelector('#cb-msg'), text = m.value.replace(/\s+/g, ' ').trim(), s = el.querySelector('#cb-send');
      if (!text || B.busy || !B.meta.llm) return;
      X.err(''); stopAudio();
      var ri = B.rounds.push({ text: text, at: Date.now(), replies: {} }) - 1, bd = el.querySelector('#cb-board'), empty = bd.querySelector('.cb-empty');
      if (empty) empty.remove();
      bd.insertAdjacentHTML('beforeend', '<div class="cb-said"><b>Participant</b><span>' + esc(text) + '</span></div>' + shown().map(function (c) { return '<div class="cb-cell" data-cell="' + ri + ':' + esc(c.id) + '"></div>'; }).join(''));
      m.value = ''; s.disabled = true; s.textContent = 'Waiting for the replies…';
      el.querySelector('#cb-csv').disabled = false; el.querySelector('#cb-reset').disabled = false;
      B.conds.forEach(function (c) { ask(ri, c.id); });
      var last = bd.lastElementChild; if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest', behavior: still() ? 'auto' : 'smooth' });
    }

    // Read a reply aloud in the study's voice; if the voice service does not answer, the browser's own voice reads it.
    var audio = null, playing = null;
    function stopAudio() {
      if (audio) { audio.pause(); audio = null; }
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* no browser voice */ }
      if (playing) { var b = el.querySelector('[data-play="' + playing + '"]'); if (b) { b.textContent = 'Play'; b.setAttribute('aria-pressed', 'false'); b.disabled = false; } playing = null; }
    }
    function play(key, btn) {
      var was = playing; stopAudio();
      if (was === key) return;
      var p = key.split(':'), rep = B.rounds[+p[0]].replies[p[1]];
      playing = key; btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Loading…';
      var start = function (url) {
        if (playing !== key) return;
        audio = new Audio(url); audio.onended = stopAudio; audio.onerror = stopAudio;
        btn.textContent = 'Stop'; audio.play().catch(stopAudio);
      };
      if (rep.audioUrl) return start(rep.audioUrl);
      X.postJSON('bench-voice', { text: rep.text }).then(function (j) { rep.audioUrl = URL.createObjectURL(b64Blob(j.audio, j.mime)); start(rep.audioUrl); }).catch(function () {
        if (playing !== key) return;
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { stopAudio(); X.err('The voice service did not answer, and this browser has no voice of its own.'); return; }
        var u = new SpeechSynthesisUtterance(rep.text); u.onend = stopAudio; u.onerror = stopAudio;
        btn.textContent = 'Stop (browser voice)'; window.speechSynthesis.speak(u);
      });
    }
    function mark(key, bid, btn) {
      var p = key.split(':'), rep = B.rounds[+p[0]].replies[p[1]], para = el.querySelector('[data-text="' + key + '"]'), on = btn.getAttribute('aria-pressed') === 'true';
      el.querySelectorAll('[data-ev="' + key + '"]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      // The check compares with runs of spaces and line breaks collapsed, so look for the passage the same way.
      var ev = !on && rep.codes && rep.codes[bid] && rep.codes[bid].evidence, hit = null;
      if (ev) hit = new RegExp(ev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).exec(rep.text);
      if (!on) btn.setAttribute('aria-pressed', 'true');
      if (!hit) { para.textContent = rep.text; return; }
      para.innerHTML = esc(rep.text.slice(0, hit.index)) + '<mark>' + esc(hit[0]) + '</mark>' + esc(rep.text.slice(hit.index + hit[0].length));
    }
    function boardClick(ev) {
      var t = ev.target.closest('button'); if (!t) return;
      var k;
      if ((k = t.getAttribute('data-play'))) play(k, t);
      else if ((k = t.getAttribute('data-ev'))) mark(k, t.getAttribute('data-b'), t);
      else if ((k = t.getAttribute('data-retry'))) { var p = k.split(':'); ask(+p[0], p[1]); }
      else if ((k = t.getAttribute('data-recode'))) { var q = k.split(':'); codeIt(+q[0], q[1]); }
    }
    function download() {
      var rows = [];
      B.rounds.forEach(function (r, ri) {
        B.conds.forEach(function (c) {
          var rep = r.replies[c.id]; if (!rep || rep.status !== 'ok') return;
          var row = { message: ri + 1, at: new Date(r.at).toISOString(), condition: c.id, condition_label: c.label, participant_text: r.text, bot_text: rep.text, source: rep.source, model: rep.model || '', llm_ms: rep.ms, bot_words: rep.words, prompt_hash: rep.promptHash, rubric_hash: rep.rubricHash || '' };
          B.rubric.forEach(function (b) { var k = rep.codes && rep.codes[b.id]; row['code_' + b.id] = k && typeof k.present === 'boolean' ? (k.present ? 1 : 0) : ''; row['evidence_' + b.id] = k && k.evidence || ''; });
          rows.push(row);
        });
      });
      X.saveFile(X.toCsv(rows, ['message', 'condition']), X.studyId + '_compare_' + X.day() + '.csv', 'text/csv');
    }
  }

  LabAdmin.registerType('chatbot', {
    subtabs: [['chat', 'Chatbot'], ['design', 'Conditions'], ['questions', 'Questions']],
    conditions: conds,
    tabs: [{ id: 'chatbench', label: 'Compare', role: 'editor', render: compare }, { id: 'chatlog', label: 'Conversations', role: 'manager', render: conversations }],
    render: function (sub, A) {
      if (sub === 'chat') return renderChat(A);
      if (sub === 'design') return renderConditions(A);
      return '<p class="muted">Asked after the conversation ends. Tick conditions to ask a question only in those conditions. The variable name becomes the CSV column <code>a_&lt;name&gt;</code>.</p>' +
        A.qlist('questions', { sessions: false, rules: [], conditions: conds(A.draft) });
    },
    applyEdit: function (t, A) {
      var v, d = A.draft;
      if ((v = t.getAttribute('data-condid'))) {
        var c = d.design.conditions[Number(v)], to = t.value.trim();
        if (to && to !== c.id && /^[a-z][a-z0-9_]{0,30}$/.test(to) && !d.design.conditions.some(function (x) { return x.id === to; })) { renameCondition(d, c.id, to); c.id = to; return true; }
        return false;
      }
      if (t.getAttribute('data-path') === 'chat.mode') { d.chat.mode = t.value; return true; }   // the Voice section depends on it
      return undefined;
    },
    click: function (t, A) {
      var v, d = A.draft, list = d.design.conditions;
      if (t.hasAttribute('data-condadd')) {
        var n = list.length + 1, id = 'cond' + n;
        while (list.some(function (x) { return x.id === id; })) id = 'cond' + (++n);
        list.push({ id: id, label: 'Condition ' + n }); d.chat.prompts[id] = '';
      } else if ((v = t.getAttribute('data-condrm'))) {
        var gone = list[Number(v)];
        if (!confirm('Remove condition "' + gone.label + '"? Its instruction is deleted too. Participants already assigned to it keep it.')) return false;
        list.splice(Number(v), 1); dropCondition(d, gone.id);
      } else if (t.hasAttribute('data-rubadd')) {
        if (!Array.isArray(d.chat.rubric)) d.chat.rubric = [];
        var k = d.chat.rubric.length + 1, bid = 'behaviour' + k;
        while (d.chat.rubric.some(function (x) { return x.id === bid; })) bid = 'behaviour' + (++k);
        d.chat.rubric.push({ id: bid, label: '', definition: '' });
      } else if ((v = t.getAttribute('data-rubrm'))) d.chat.rubric.splice(Number(v), 1);
      else if (t.hasAttribute('data-saddsession')) d.design.sessions.push({});
      else if (t.hasAttribute('data-sremove')) { if (!confirm('Remove the last session?')) return false; d.design.sessions.pop(); }
      else return false;
      return true;
    }
  });
})();
