/* Study type "chatbot": the editor's Chatbot, Conditions, and Questions tabs, and the Conversations tab (services
   that are switched on, and the transcript download). Each condition has its own instruction to the chatbot; that
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
        ? (c.mode === 'voice' ? '<p class="muted">In a spoken conversation the chatbot always answers aloud.</p>' : A.checkbox('data-path="chat.voice.speak" data-bool="1"', c.voice.speak, 'The chatbot also reads its messages aloud')) +
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
      '<h3>Sessions</h3><p class="muted">One conversation per session. A participant keeps the same condition in every session.</p>' +
      '<p>' + d.design.sessions.length + ' session' + (d.design.sessions.length === 1 ? '' : 's') + ' ' +
      (d.design.sessions.length < 12 ? btn('data-saddsession="1"', 'Add a session') : '') + (d.design.sessions.length > 1 ? btn('data-sremove="1"', 'Remove the last session', 'danger secondary') : '') + '</p>';
    return h;
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

  LabAdmin.registerType('chatbot', {
    subtabs: [['chat', 'Chatbot'], ['design', 'Conditions'], ['questions', 'Questions']],
    conditions: conds,
    tabs: [{ id: 'chatlog', label: 'Conversations', role: 'manager', render: conversations }],
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
      } else if (t.hasAttribute('data-saddsession')) d.design.sessions.push({});
      else if (t.hasAttribute('data-sremove')) { if (!confirm('Remove the last session?')) return false; d.design.sessions.pop(); }
      else return false;
      return true;
    }
  });
})();
