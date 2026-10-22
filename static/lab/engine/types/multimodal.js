/* Study type "multimodal": item screens for text, images, audio and video clips, and phone calls with an AI
   voice caller, followed by an optional mouse-tracked decision, the study's questions, and a spoken answer.
   Server side: netlify/lib/lab/types/multimodal.mjs (and voicebot.mjs for the caller).

   Measures sent with each item (the server cleans them and computes the mouse-tracking measures):
     decision, decisionMs, trajectory [[x, y, t]] from the Start click to the answer click,
     media { plays, pauses, firstPlayMs, endedMs, heardPct, durationMs, transcriptOpened },
     call { answered, ringMs, durationMs, holdMs, typedTurns, spokenTurns, captions, directoryOpened, endedBy, latencies },
     voice { recorded, durationMs, typed }.
   Answer changes go through ctx.record, like every type. */
(function () {
  'use strict';
  var soundChecked = {}, micBlocked = false;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  function now() { return performance.now(); }
  function fmtTime(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function paras(text, esc) { return String(text || '').split(/\n\s*\n/).filter(Boolean).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }
  function needsSound(it) { return it.kind === 'audio' || it.kind === 'video' || it.kind === 'call' || it.recordVoice; }
  function blobToBase64(blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = rej; r.readAsDataURL(blob); });
  }

  // ---------- speech out (the caller's voice) ----------
  var voices = [];
  function loadVoices() { try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) { voices = []; } }
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function pickVoice(pref) {
    var lg = (document.documentElement.getAttribute('data-speech-lang') || 'en-US').split('-')[0];   // the study's language (Devices & timing)
    var en = voices.filter(function (v) { return new RegExp('^' + lg + '(-|_)', 'i').test(v.lang); });
    if (pref && pref.name) { var m = voices.filter(function (v) { return v.name === pref.name; })[0]; if (m) return m; }
    return en.filter(function (v) { return /Samantha|Google US English|Jenny|Aria|Natural/i.test(v.name); })[0] || en[0] || null;
  }
  // Speaks a line. A recorded clip (audio URL) plays through a phone-band filter instead of the synthetic voice.
  function speak(text, opts, onStart, onEnd) {
    opts = opts || {};
    var ended = false, done = function () { if (!ended) { ended = true; if (onEnd) onEnd(); } };
    if (opts.audio) {
      var a = new Audio(opts.audio);
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext, ac = new Ctx(), src = ac.createMediaElementSource(a);
        var hp = ac.createBiquadFilter(), lp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300; lp.type = 'lowpass'; lp.frequency.value = 3400;
        src.connect(hp); hp.connect(lp); lp.connect(ac.destination);
      } catch (e) {}
      a.onplay = function () { if (onStart) onStart(); }; a.onended = done; a.onerror = done;
      a.play().catch(done);
      return { stop: function () { a.pause(); done(); }, pause: function () { a.pause(); }, resume: function () { a.play().catch(function () {}); } };
    }
    if (!window.speechSynthesis || !text) { setTimeout(function () { if (onStart) onStart(); done(); }, 50); return { stop: done, pause: function () {}, resume: function () {} }; }
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text), v = pickVoice(opts.voice);
    if (v) u.voice = v;
    u.rate = opts.voice && opts.voice.rate ? opts.voice.rate : 1; u.pitch = opts.voice && opts.voice.pitch ? opts.voice.pitch : 1;
    var guard = setTimeout(done, 4000 + text.length * 90);   // some browsers never fire "end" for long text
    u.onstart = function () { if (onStart) onStart(); }; u.onend = function () { clearTimeout(guard); done(); }; u.onerror = u.onend;
    speechSynthesis.speak(u);
    return { stop: function () { speechSynthesis.cancel(); done(); }, pause: function () { speechSynthesis.pause(); }, resume: function () { speechSynthesis.resume(); } };
  }

  // A ring tone made in the browser (two tones, the North American cadence), so no file is needed.
  function ringer() {
    var Ctx = window.AudioContext || window.webkitAudioContext, ac = null, timer = null, on = false;
    function burst() {
      if (!ac) return;
      var g = ac.createGain(); g.gain.value = 0.06; g.connect(ac.destination);
      [440, 480].forEach(function (f) { var o = ac.createOscillator(); o.frequency.value = f; o.connect(g); o.start(); o.stop(ac.currentTime + 2); });
    }
    return {
      start: function () { if (on || !Ctx) return; on = true; try { ac = new Ctx(); burst(); timer = setInterval(burst, 6000); } catch (e) {} },
      stop: function () { on = false; clearInterval(timer); try { if (ac) ac.close(); } catch (e) {} ac = null; }
    };
  }

  // ---------- microphone ----------
  function getMic() {
    if (micBlocked || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(null);
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(function () { micBlocked = true; return null; });
  }
  function recorder(stream) {
    if (!stream || !window.MediaRecorder) return null;
    var type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].filter(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0] || '';
    var mr; try { mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 24000 } : undefined); } catch (e) { return null; }
    var chunks = [], t0 = 0;
    mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    return {
      start: function () { chunks = []; t0 = now(); mr.start(1000); },
      stop: function () {
        return new Promise(function (res) {
          if (mr.state === 'inactive') return res(null);
          mr.onstop = function () { res({ blob: new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' }), durationMs: Math.round(now() - t0) }); };
          mr.stop();
        });
      }
    };
  }
  function upload(ui, ctx, kind, rec) {
    if (!rec || !rec.blob || !rec.blob.size) return Promise.resolve(false);
    return blobToBase64(rec.blob).then(function (b64) {
      return ui.call('media/upload', { session: ctx.plan.session, index: ctx.index, kind: kind, mime: rec.blob.type, data: b64, durationMs: rec.durationMs });
    }).then(function (r) { return !!(r && r.ok); }, function () { return false; });
  }

  // ---------- sound check (once per session, before the first item with sound) ----------
  // Runs as the engine's beforeTrial step, so it is not part of the item's time or traces. The parts the session's
  // setup checks already covered are left out (info.heard: the headphone check passed; info.micHeard: the microphone
  // check heard the participant): with both covered, or sound covered and no recording, there is no screen at all.
  var MIC_ONLY_BODY = 'This study may record your spoken answers. If your browser asks to use your microphone, please allow it. The bar moves when we hear you.';
  function soundCheck(info, ui, next) {
    var plan = info.plan, stop = null, micOnly = !!info.heard;
    ui.show('<h2>' + ui.Th('mic_title') + '</h2>' + (micOnly ? (ui.T('mic_only_body') ? ui.Tp('mic_only_body') : '<p>' + ui.esc(MIC_ONLY_BODY) + '</p>') : ui.Tp('mic_body')) +
      '<div class="mm-check">' + (micOnly ? '' : '<button type="button" class="secondary" id="mm-test">' + ui.Th('mic_test') + '</button>') +
      (plan.recording ? '<div class="mm-meter" aria-hidden="true"><span id="mm-level"></span></div>' : '') + '</div><div id="mm-checkmsg" role="status"></div>' +
      '<div class="actions"><button type="button" id="mm-ok">' + ui.Th(micOnly ? 'continue_button' : 'mic_ok') + '</button></div>');
    var test = document.getElementById('mm-test');
    if (test) test.addEventListener('click', function () { speak('This is a sound test. If you can hear this, your sound is working.', {}); });
    if (plan.recording) {
      getMic().then(function (stream) {
        var msg = document.getElementById('mm-checkmsg');
        if (!stream) { if (msg) msg.innerHTML = '<p class="muted">' + ui.Th('mic_denied') + '</p>'; return; }
        try {
          var Ctx = window.AudioContext || window.webkitAudioContext, ac = new Ctx(), an = ac.createAnalyser(), data = new Uint8Array(256), bar = document.getElementById('mm-level'), raf;
          ac.createMediaStreamSource(stream).connect(an);
          (function tick() { an.getByteTimeDomainData(data); var peak = 0; for (var i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128)); if (bar) bar.style.width = Math.min(100, peak * 1.6) + '%'; raf = requestAnimationFrame(tick); })();
          stop = function () { cancelAnimationFrame(raf); try { ac.close(); } catch (e) {} stream.getTracks().forEach(function (t) { t.stop(); }); };
        } catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); }
      });
    }
    document.getElementById('mm-ok').addEventListener('click', function () { if (stop) stop(); if (window.speechSynthesis) speechSynthesis.cancel(); soundChecked[plan.session] = true; next(); });
  }

  // ---------- the decision (mouse-tracked or plain) ----------
  // Mouse tracking: the options sit along the top of a fixed area and a Start button at the bottom centre. The
  // path is recorded from the Start click to the answer click; the answer is final, as in MouseTracker. Without
  // mouse tracking the options are large radio cards, and changing the answer is recorded as an answer change.
  function decisionHtml(dec, ui) {
    var esc = ui.esc;
    if (!dec) return '';
    if (!dec.mouseTracking) return ui.choiceGroup('decision', esc(dec.prompt), dec.options.map(function (o) { return [o.value, esc(o.label)]; }), 'decision');
    return '<fieldset class="q-group mt" data-name="decision"><legend class="q">' + esc(dec.prompt) + '</legend>' +
      '<div class="mt-area" id="mt-area" data-n="' + dec.options.length + '">' +
      dec.options.map(function (o, i) { return '<button type="button" class="mt-opt" data-value="' + esc(o.value) + '" data-trace="decision:' + esc(o.value) + '" style="--i:' + i + '" disabled>' + esc(o.label) + '</button>'; }).join('') +
      '<p class="mt-hint muted" id="mt-hint">' + ui.Th('decision_hint') + '</p><button type="button" class="mt-start" id="mt-start">' + ui.Th('decision_start') + '</button></div></fieldset>';
  }
  function wireDecision(root, dec, state, ctx) {
    if (!dec) return;
    if (!dec.mouseTracking) {
      root.querySelectorAll('input[name="decision"]').forEach(function (r) {
        r.addEventListener('change', function () { state.decision = r.value; state.decisionMs = Math.round(now() - state.t0); ctx.record('decision', r.value); });
      });
      return;
    }
    var area = root.querySelector('#mt-area'), start = root.querySelector('#mt-start'), opts = area.querySelectorAll('.mt-opt'), t0 = 0, path = [], tracking = false;
    function pt(e, el) {
      if (e && e.detail && e.clientX != null) return [Math.round(e.clientX), Math.round(e.clientY), Math.round(now() - t0)];
      var r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), Math.round(now() - t0)];   // keyboard: the button's centre
    }
    // At most one point every 8 ms (and 1,400 in all), so long decisions keep their final click within the server's limit.
    function move(e) { var t = Math.round(now() - t0); if (tracking && path.length < 1400 && t - path[path.length - 1][2] >= 8) path.push([Math.round(e.clientX), Math.round(e.clientY), t]); }
    start.addEventListener('click', function (e) {
      t0 = now(); path = [pt(e, start)]; tracking = true; start.hidden = true; area.classList.add('live');
      opts.forEach(function (o) { o.disabled = false; });
      root.querySelector('#mt-hint').hidden = true;
      if (!e.detail) opts[0].focus({ preventScroll: true });   // keyboard users land on the first answer
      document.addEventListener('pointermove', move);
    });
    opts.forEach(function (o) {
      o.addEventListener('click', function (e) {
        if (!tracking) return;
        tracking = false; document.removeEventListener('pointermove', move);
        path.push(pt(e, o));
        state.decision = o.getAttribute('data-value'); state.decisionMs = Math.round(now() - state.t0); state.trajectory = path;
        ctx.record('decision', state.decision);
        opts.forEach(function (x) { x.disabled = true; x.classList.toggle('chosen', x === o); x.setAttribute('aria-pressed', x === o ? 'true' : 'false'); });
        area.classList.remove('live'); area.classList.add('done');
      });
    });
  }

  // ---------- media (audio and video) ----------
  function playerHtml(it, ui) {
    var esc = ui.esc, isVideo = it.kind === 'video';
    return '<div class="mm-media mm-' + it.kind + '" data-trace="media">' +
      (isVideo ? '<video id="mm-el" playsinline preload="metadata" src="' + esc(it.media) + '" aria-label="' + esc(it.mediaAlt || it.title) + '"></video>' : '<audio id="mm-el" preload="auto" src="' + esc(it.media) + '"></audio>') +
      '<div class="mm-controls"><button type="button" class="mm-play" id="mm-play" aria-describedby="mm-time">' + ui.Th('play_button') + '</button>' +
      '<div class="mm-bar" aria-hidden="true"><span id="mm-fill"></span></div><span class="mm-time" id="mm-time">0:00</span></div>' +
      '<p class="muted mm-left" id="mm-left" aria-live="polite"></p>' +
      (it.transcript ? '<details class="mm-transcript" id="mm-tx"><summary>' + ui.Th('transcript_label') + '</summary>' + paras(it.transcript, esc) + '</details>' : '') + '</div>';
  }
  function wireMedia(root, it, ui, state, onHeard) {
    var el = root.querySelector('#mm-el'), btn = root.querySelector('#mm-play'), fill = root.querySelector('#mm-fill'), time = root.querySelector('#mm-time'), left = root.querySelector('#mm-left');
    var m = state.media = { plays: 0, pauses: 0, firstPlayMs: null, endedMs: null, heardPct: 0, durationMs: null, transcriptOpened: false };
    var max = Number(it.maxPlays) || 0, heard = false;
    function label() {
      var rem = max ? max - m.plays : null;
      btn.textContent = !el.paused ? ui.T('pause_button') : m.plays ? ui.T('replay_button') : ui.T('play_button');
      btn.classList.toggle('playing', !el.paused);
      btn.disabled = el.paused && rem === 0;
      left.textContent = max && m.plays ? ui.T('plays_left', { n: Math.max(0, rem) }) : '';
    }
    function finish() { if (!heard) { heard = true; onHeard(); } }
    el.addEventListener('loadedmetadata', function () { m.durationMs = Math.round(el.duration * 1000); time.textContent = '0:00 / ' + fmtTime(el.duration); });
    el.addEventListener('timeupdate', function () {
      if (!el.duration) return;
      var pct = el.currentTime / el.duration * 100; fill.style.width = pct + '%'; m.heardPct = Math.max(m.heardPct, Math.round(pct));
      time.textContent = fmtTime(el.currentTime) + ' / ' + fmtTime(el.duration);
    });
    el.addEventListener('play', function () { if (el.currentTime < 0.5) m.plays++; if (m.firstPlayMs == null) m.firstPlayMs = Math.round(now() - state.t0); label(); });
    el.addEventListener('pause', function () { if (!el.ended) m.pauses++; label(); });
    el.addEventListener('ended', function () { m.heardPct = 100; if (m.endedMs == null) m.endedMs = Math.round(now() - state.t0); el.currentTime = 0; label(); finish(); });
    el.addEventListener('error', function () { left.textContent = 'This clip could not be loaded. You can continue without it.'; finish(); });
    btn.addEventListener('click', function () { if (el.paused) el.play().catch(function () {}); else el.pause(); });
    var tx = root.querySelector('#mm-tx'); if (tx) tx.addEventListener('toggle', function () { if (tx.open) m.transcriptOpened = true; });
    if (it.autoplay) el.play().catch(function () {});
    label();
  }

  // ---------- spoken answer ----------
  function voiceHtml(it, plan, ui) {
    var esc = ui.esc;
    if (!it.recordVoice) return '';
    var prompt = it.voicePrompt ? '<p class="q">' + esc(it.voicePrompt) + '</p>' : '';
    if (!plan.recording || micBlocked || !window.MediaRecorder) return '<div class="q-group" data-name="voice_typed">' + prompt + '<label class="q" for="mm-typed">' + ui.Th('voice_typed') + '</label><textarea id="mm-typed" rows="4" data-trace="text:voice"></textarea></div>';
    return '<div class="q-group mm-voice" data-name="voice">' + prompt + '<div class="row"><button type="button" class="secondary" id="mm-rec">' + ui.Th('voice_record') + '</button><span class="muted" id="mm-recstate" aria-live="polite"></span></div><audio id="mm-recplay" controls hidden></audio></div>';
  }
  function wireVoice(root, it, plan, ui, state) {
    var typed = root.querySelector('#mm-typed');
    state.voice = { recorded: false, durationMs: null, typed: '' };
    if (typed) { typed.addEventListener('input', function () { state.voice.typed = typed.value; }); return; }
    var btn = root.querySelector('#mm-rec'); if (!btn) return;
    var rs = root.querySelector('#mm-recstate'), play = root.querySelector('#mm-recplay'), rec = null, stream = null, recording = false;
    btn.addEventListener('click', function () {
      if (recording) {
        recording = false; btn.disabled = true;
        rec.stop().then(function (out) {
          if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
          state.voiceRec = out; state.voice.recorded = !!out; state.voice.durationMs = out ? out.durationMs : null;
          if (out) { play.src = URL.createObjectURL(out.blob); play.hidden = false; rs.textContent = fmtTime(out.durationMs / 1000) + ' recorded.'; }
          btn.textContent = ui.T('voice_redo'); btn.disabled = false; btn.classList.remove('rec');
        });
        return;
      }
      getMic().then(function (s) {
        stream = s; rec = recorder(s);
        if (!rec) { rs.textContent = ui.T('mic_denied'); btn.disabled = true; return; }
        rec.start(); recording = true; btn.textContent = ui.T('voice_stop'); btn.classList.add('rec'); rs.textContent = 'Recording…'; play.hidden = true;
      });
    });
  }

  function answersFor(it, plan) { return (plan.questions || []).filter(function (q) { return (it.ask || []).indexOf(q.id) >= 0; }); }
  function missingDecision(dec, msg, ui, root) {
    msg.innerHTML = ui.errorBox(dec.mouseTracking ? 'Click Start, then choose an answer.' : 'Choose an answer to continue.');
    var d = root.querySelector('[data-name="decision"]'); if (d) { d.classList.add('missing'); d.scrollIntoView({ block: 'center' }); }
  }

  // ---------- an item with a stimulus and answers ----------
  function renderItem(ctx, ui) {
    var it = ctx.trial.item, plan = ctx.plan, esc = ui.esc, dec = ctx.trial.decision, qs = answersFor(it, plan);
    var state = { t0: now(), decision: null };
    var media = it.kind === 'image' ? '<figure class="mm-figure"><img src="' + esc(it.media) + '" alt="' + esc(it.mediaAlt || '') + '" data-trace="image"></figure>'
      : it.kind === 'audio' || it.kind === 'video' ? playerHtml(it, ui) : '';
    var gate = (it.kind === 'audio' || it.kind === 'video') && it.mustFinish;
    ui.show('<h2>' + esc(it.title) + '</h2><div class="mm-item mm-k-' + esc(it.kind) + '" data-trace="item">' + paras(it.body, esc) + media + '</div>' +
      (gate ? '<p class="muted mm-gate" id="mm-gate">' + ui.Th('media_wait') + '</p>' : '') +
      '<fieldset class="mm-answers" id="mm-answers"' + (gate ? ' disabled' : '') + '>' + decisionHtml(dec, ui) + ui.questionsHtml(qs) + voiceHtml(it, plan, ui) + '</fieldset>' +
      '<div id="trialmsg"></div><div class="actions"><button id="mm-submit"' + (gate ? ' disabled' : '') + '>' + ui.Th(ctx.isPractice ? 'practice_submit' : 'submit_button') + '</button></div>');
    var root = ui.stage, submit = document.getElementById('mm-submit'), msg = document.getElementById('trialmsg'), box = document.getElementById('mm-answers');
    if (it.kind === 'audio' || it.kind === 'video') wireMedia(root, it, ui, state, function () { box.disabled = false; submit.disabled = false; var g = document.getElementById('mm-gate'); if (g) g.hidden = true; });
    wireDecision(root, dec, state, ctx);
    wireVoice(root, it, plan, ui, state);
    var set = ui.questionSet(box, qs, msg, submit, function (n, v) { ctx.record(n, v); });
    submit.addEventListener('click', function () {
      if (dec && !state.decision) return missingDecision(dec, msg, ui, root);
      if (!set.check()) return;
      submit.disabled = true; msg.innerHTML = '';
      var el = root.querySelector('#mm-el'); if (el && !el.paused) el.pause();
      (state.voiceRec ? upload(ui, ctx, 'voice', state.voiceRec) : Promise.resolve(false)).then(function (ok) {
        if (state.voice && state.voiceRec && !ok) state.voice.recorded = false;
        ctx.submit({ answers: set.answers, decision: state.decision, decisionMs: state.decisionMs, trajectory: state.trajectory, media: state.media || null, voice: it.recordVoice ? state.voice : null, rtMs: Math.round(now() - state.t0) },
          function (err) { submit.disabled = false; msg.innerHTML = ui.errorBox(err); });
      });
    });
  }

  // ---------- a phone call ----------
  function runCall(ctx, ui) {
    var it = ctx.trial.item, call = it.call || {}, plan = ctx.plan, esc = ui.esc;
    var st = { seq: 0, t0: now(), ringT0: now(), answered: false, ended: false, typed: 0, spoken: 0, captions: false, holdMs: 0, holdAt: null, latencies: [], sentAt: null, lastLatency: null, endedBy: null, directoryOpened: false };
    var ring = ringer(), voice = null, rec = null, stream = null, recog = null, listening = false, ringTimer = null, busy = false;
    // Turns go one at a time, in order: a hold or hang-up never overtakes a reply still waiting for the caller.
    var queue = Promise.resolve();
    function turn(kind, said) {
      var run = queue.then(function () {
        var body = { session: plan.session, index: ctx.index, seq: st.seq, kind: kind, clientMs: Math.round(now() - st.t0), latencyMs: st.lastLatency, asr: kind === 'say' && !!st.lastWasSpoken };
        if (said != null) body.said = said;
        st.seq++;
        return ui.call('call/turn', body).then(function (r) {
          if (r && r.error === 'out_of_order' && r.next != null) { st.seq = r.next; body.seq = st.seq++; return ui.call('call/turn', body); }
          return r;
        });
      });
      queue = run.catch(function () {});
      return run;
    }
    function phone(inner, cls) {
      return '<h2 class="sr">' + esc(it.title) + '</h2><div class="phone ' + (cls || '') + '"><div class="phone-top"><div class="avatar" aria-hidden="true">' + esc((call.caller || '?').charAt(0)) + '</div>' +
        '<div class="caller"><strong>' + esc(call.caller) + '</strong><span>' + esc(call.number || '') + '</span></div></div>' + inner + '</div>';
    }
    // 1. ringing
    ui.show(phone('<p class="phone-status" id="ph-status">' + ui.Th('call_incoming') + '</p><div class="phone-btns"><button type="button" class="decline" id="ph-decline">' + ui.Th('call_decline') + '</button>' +
      '<button type="button" class="answer" id="ph-answer">' + ui.Th('call_answer') + '</button></div>', 'ringing'));
    ring.start();
    ringTimer = setTimeout(function () { ring.stop(); st.endedBy = 'timeout'; turn('timeout').then(function () { afterCall(ui.T('call_missed')); }); }, Math.max(5, Number(call.ringSeconds) || 30) * 1000);
    document.getElementById('ph-decline').addEventListener('click', function () { clearTimeout(ringTimer); ring.stop(); st.endedBy = 'participant'; st.ringMs = Math.round(now() - st.ringT0); turn('decline').then(function () { afterCall(ui.T('call_missed')); }); });
    document.getElementById('ph-answer').addEventListener('click', answer);

    function answer() {
      clearTimeout(ringTimer); ring.stop(); st.answered = true; st.ringMs = Math.round(now() - st.ringT0); st.callT0 = now();
      var canSpeak = !!SR && !micBlocked;
      ui.show(phone(
        '<p class="phone-status" id="ph-status" aria-live="off">0:00</p>' + (plan.recording ? '<p class="rec-note" id="ph-rec" hidden><span class="dot" aria-hidden="true"></span>' + ui.Th('call_recording') + '</p>' : '') +
        '<div class="captions" id="ph-captions" aria-live="polite" hidden></div>' +
        '<div class="phone-talk">' + (canSpeak ? '<button type="button" class="talk" id="ph-talk" disabled>' + ui.Th('call_talk') + '</button><p class="interim muted" id="ph-interim" aria-live="polite"></p>' : '') +
        '<form id="ph-typeform" class="typeform"><label for="ph-type">' + ui.Th('call_type_label') + '</label><div class="row"><input type="text" id="ph-type" autocomplete="off" disabled><button type="submit" class="secondary" id="ph-send" disabled>' + ui.Th('call_send') + '</button></div></form></div>' +
        '<div class="phone-btns small"><label class="check" for="ph-cc"><input type="checkbox" id="ph-cc"> ' + ui.Th('call_captions') + '</label><button type="button" class="secondary" id="ph-hold">' + ui.Th('call_hold') + '</button>' +
        '<button type="button" class="decline" id="ph-hang">' + ui.Th('call_hangup') + '</button></div>', 'live'));
      var clock = setInterval(function () { var s = document.getElementById('ph-status'); if (s && !st.ended && st.holdAt == null) s.textContent = fmtTime((now() - st.callT0 - st.holdMs) / 1000); }, 500);
      st.stopClock = function () { clearInterval(clock); };
      if (plan.recording) getMic().then(function (s) { stream = s; rec = recorder(s); if (rec) { rec.start(); var n = document.getElementById('ph-rec'); if (n) n.hidden = false; } });
      document.getElementById('ph-cc').addEventListener('change', function (e) { st.captions = st.captions || e.target.checked; document.getElementById('ph-captions').hidden = !e.target.checked; });
      document.getElementById('ph-hang').addEventListener('click', function () { st.endedBy = 'participant'; hangUp(false); });
      document.getElementById('ph-hold').addEventListener('click', function (e) {
        var b = e.currentTarget;
        if (st.holdAt == null) { st.holdAt = now(); if (voice) voice.pause(); b.textContent = ui.T('call_resume'); setInput(false); turn('hold'); document.getElementById('ph-status').textContent = 'On hold'; }
        else { st.holdMs += now() - st.holdAt; st.holdAt = null; if (voice) voice.resume(); b.textContent = ui.T('call_hold'); setInput(!busy); turn('resume'); }
      });
      document.getElementById('ph-typeform').addEventListener('submit', function (e) {
        e.preventDefault(); var box = document.getElementById('ph-type'), v = box.value.trim(); if (!v || busy || st.holdAt != null) return;
        box.value = ''; st.typed++; st.lastWasSpoken = false; say(v);
      });
      var talk = document.getElementById('ph-talk');
      if (talk) talk.addEventListener('click', function () { if (listening) { if (recog) recog.stop(); } else listen(); });
      turn('answer').then(function (r) { if (!r || r.error) return failed(); callerSays(r); });
    }
    function setInput(on) { ['ph-type', 'ph-send', 'ph-talk'].forEach(function (id) { var el = document.getElementById(id); if (el) el.disabled = !on; }); }
    function caption(who, text) {
      var c = document.getElementById('ph-captions'); if (!c) return;
      var p = document.createElement('p'); p.className = who; p.textContent = (who === 'caller' ? call.caller + ': ' : 'You: ') + text; c.appendChild(p); c.scrollTop = c.scrollHeight;
    }
    // The participant can talk over the caller, as on a real phone: input opens as soon as the caller starts
    // speaking, and replying cuts the caller off (counted in "interruptions"). busy = waiting for the server.
    function callerSays(r) {
      busy = false;
      if (r.say) caption('caller', r.say);
      var me = voice = speak(r.say, { voice: call.voice, audio: r.audio },
        function () {
          if (st.sentAt != null) { st.lastLatency = Math.round(now() - st.sentAt); st.latencies.push(st.lastLatency); st.sentAt = null; }
          if (!r.done && st.holdAt == null) { setInput(true); var t = document.getElementById('ph-talk') || document.getElementById('ph-type'); if (t) t.focus({ preventScroll: true }); }
        },
        function () {
          if (voice === me) voice = null;
          if (r.done && !st.ended) { st.endedBy = st.endedBy || 'caller'; hangUp(true); }
        });
    }
    function say(text) {
      if (voice) { st.interruptions = (st.interruptions || 0) + 1; var v = voice; voice = null; v.stop(); }
      caption('you', text); busy = true; setInput(false); st.sentAt = now();
      turn('say', text).then(function (r) { if (!r || r.error) { if (r && r.error === 'call_over') return hangUp(true); return failed(); } callerSays(r); });
    }
    function listen() {
      var talk = document.getElementById('ph-talk'), interim = document.getElementById('ph-interim'), heard = '';
      try { recog = new SR(); } catch (e) { recog = null; }
      if (!recog) return;
      recog.lang = document.documentElement.getAttribute('data-speech-lang') || 'en-US'; recog.interimResults = true; recog.continuous = true; recog.maxAlternatives = 1;
      recog.onresult = function (e) { var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; heard = t; if (interim) interim.textContent = t; };
      recog.onerror = function (e) { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { micBlocked = true; talk.hidden = true; } };
      recog.onend = function () {
        listening = false; talk.classList.remove('rec'); talk.textContent = ui.T('call_talk'); if (interim) interim.textContent = '';
        heard = heard.trim(); if (heard && !st.ended) { st.spoken++; st.lastWasSpoken = true; say(heard); }
      };
      listening = true; talk.classList.add('rec'); talk.textContent = ui.T('call_listening');
      try { recog.start(); } catch (e) { listening = false; }
    }
    function failed() {
      var s = document.getElementById('ph-status'); if (s) s.textContent = 'The line dropped. You can continue.';
      st.endedBy = st.endedBy || 'caller'; setTimeout(function () { hangUp(true); }, 1200);
    }
    function hangUp(byServer) {
      if (st.ended) return; st.ended = true;
      if (voice) voice.stop(); if (recog) { try { recog.abort(); } catch (e) {} } if (st.stopClock) st.stopClock();
      if (st.holdAt != null) { st.holdMs += now() - st.holdAt; st.holdAt = null; }
      st.durationMs = Math.round(now() - st.callT0);
      var after = byServer ? Promise.resolve() : turn('hangup');
      st.recording = rec ? rec.stop().then(function (out) { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); return upload(ui, ctx, 'call', out); }) : Promise.resolve(false);
      after.then(function () { afterCall(ui.T('call_ended') + ' · ' + fmtTime(st.durationMs / 1000)); });
    }

    // 2. after the call: the directory (call a number back), then the decision and questions
    function afterCall(status) {
      var dec = ctx.trial.decision, qs = answersFor(it, plan), state = { t0: now() }, dir = plan.directory || [];
      ui.show(phone('<p class="phone-status">' + esc(status) + '</p>' + (dir.length ? '<div class="phone-btns small"><button type="button" class="secondary" id="ph-dir">' + ui.Th('directory_open') + '</button></div><div id="ph-dirbox" hidden></div>' : ''), 'ended') +
        '<fieldset class="mm-answers" id="mm-answers">' + decisionHtml(dec, ui) + ui.questionsHtml(qs) + '</fieldset>' +
        '<div id="trialmsg"></div><div class="actions"><button id="mm-submit">' + ui.Th('submit_button') + '</button></div>');
      var root = ui.stage, box = document.getElementById('mm-answers'), submit = document.getElementById('mm-submit'), msg = document.getElementById('trialmsg'), dirBtn = document.getElementById('ph-dir');
      if (dirBtn) dirBtn.addEventListener('click', function () {
        st.directoryOpened = true;
        var b = document.getElementById('ph-dirbox'); b.hidden = false; dirBtn.hidden = true;
        b.innerHTML = '<h3 tabindex="-1">' + ui.Th('directory_title') + '</h3><ul class="directory">' + dir.map(function (d, i) {
          return '<li><span><strong>' + esc(d.name) + '</strong><br><span class="muted">' + esc(d.number) + '</span></span><button type="button" class="secondary small" data-dial="' + i + '">' + ui.Th('directory_call') + '</button></li>';
        }).join('') + '</ul><p class="muted" id="ph-dialstate" aria-live="polite"></p>';
        b.querySelector('h3').focus();
        b.addEventListener('click', function (e) {
          var i = e.target.getAttribute && e.target.getAttribute('data-dial'); if (i == null) return;
          var d = dir[Number(i)], ds = document.getElementById('ph-dialstate');
          b.querySelectorAll('[data-dial]').forEach(function (x) { x.disabled = true; });
          ds.textContent = 'Calling ' + d.name + '…';
          ui.call('call/callback', { session: plan.session, index: ctx.index, number: d.number }).then(function (r) {
            var line = r && r.say ? r.say : 'No answer.';
            ds.textContent = line;
            speak(line, { voice: call.voice }, null, function () { ds.textContent = line + ' (call ended)'; b.querySelectorAll('[data-dial]').forEach(function (x) { x.disabled = false; }); });
          });
        });
      });
      wireDecision(root, dec, state, ctx);
      var set = ui.questionSet(box, qs, msg, submit, function (n, v) { ctx.record(n, v); });
      submit.addEventListener('click', function () {
        if (dec && !state.decision) return missingDecision(dec, msg, ui, root);
        if (!set.check()) return;
        submit.disabled = true; msg.innerHTML = '<p class="muted">Saving…</p>';
        if (window.speechSynthesis) speechSynthesis.cancel();
        (st.recording || Promise.resolve(false)).then(function () {
          ctx.submit({ answers: set.answers, decision: state.decision, decisionMs: state.decisionMs, trajectory: state.trajectory, rtMs: Math.round(now() - st.t0),
            call: { answered: st.answered, ringMs: st.ringMs, durationMs: st.durationMs || 0, holdMs: Math.round(st.holdMs), typedTurns: st.typed, spokenTurns: st.spoken, interruptions: st.interruptions || 0, captions: st.captions, directoryOpened: st.directoryOpened, endedBy: st.endedBy, latencies: st.latencies } },
            function (err) { submit.disabled = false; msg.innerHTML = ui.errorBox(err); });
        });
      });
    }
  }

  var impl = {
    beforeTrial: function (info, ui, go) {
      var s = info.plan.session;
      if (!needsSound(info.trial.item) || soundChecked[s]) return go();
      if (info.heard && (!info.plan.recording || info.micHeard)) { soundChecked[s] = true; return go(); }
      soundCheck(info, ui, go);
    },
    runTrial: function (ctx, ui) {
      if (ctx.trial.item.kind === 'call') return runCall(ctx, ui);
      renderItem(ctx, ui);
    }
  };
  LabEngine.registerType('multimodal', impl);
})();
