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
  // Agent mode: simulated participants (the sim-panel runner) cannot listen or speak. It is on only when the tab asks
  // for it (?agent=1, kept for the tab) and the server's plan allows it (test participants only). Recordings then show
  // their words, the caller's lines appear as captions, replies are typed, and the equipment checks are skipped.
  try { if (/[?&]agent=1(&|$)/.test(location.search)) sessionStorage.setItem('lab-agent', '1'); } catch (e) {}
  var agentOn = false;
  function agentMode(plan) { var asked = false; try { asked = sessionStorage.getItem('lab-agent') === '1'; } catch (e) {} return !!(asked && plan && plan.agent); }
  function agentHtml(text, esc) {
    return '<div class="mm-agent" data-agent="transcript"><p class="muted">Agent mode: what this recording says</p>' + (text ? paras(text, esc) : '<p class="muted">(No words were provided for this recording.)</p>') + '</div>';
  }
  function blobToBase64(blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = rej; r.readAsDataURL(blob); });
  }

  // ---------- speech out (the caller's voice) ----------
  var voices = [];
  function loadVoices() { try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) { voices = []; } }
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function pickVoice(pref) {
    var en = voices.filter(function (v) { return /^en(-|_)/i.test(v.lang); });
    if (pref && pref.name) { var m = voices.filter(function (v) { return v.name === pref.name; })[0]; if (m) return m; }
    return en.filter(function (v) { return /Samantha|Google US English|Jenny|Aria|Natural/i.test(v.name); })[0] || en[0] || null;
  }
  // Speaks a line. A recorded clip (audio URL) plays through a phone-band filter instead of the synthetic voice.
  function speak(text, opts, onStart, onEnd) {
    if (agentOn) {   // nothing to hear: the line is "spoken" at once (the caption carries the words)
      var fin = false, end = function () { if (!fin) { fin = true; if (onEnd) onEnd(); } };
      setTimeout(function () { if (!fin && onStart) onStart(); setTimeout(end, 50); }, 30);
      return { stop: end, pause: function () {}, resume: function () {} };
    }
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
  function soundCheck(ctx, ui, next) {
    var plan = ctx.plan, stop = null;
    ui.show('<h2>' + ui.Th('mic_title') + '</h2>' + ui.Tp('mic_body') +
      '<div class="mm-check"><button type="button" class="secondary" id="mm-test">' + ui.Th('mic_test') + '</button>' +
      (plan.recording ? '<div class="mm-meter" aria-hidden="true"><span id="mm-level"></span></div>' : '') + '</div><div id="mm-checkmsg" role="status"></div>' +
      '<div class="actions"><button type="button" id="mm-ok">' + ui.Th('mic_ok') + '</button></div>');
    document.getElementById('mm-test').addEventListener('click', function () { speak('This is a sound test. If you can hear this, your sound is working.', {}); });
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

  // ---------- the persona card (the participant's role and fictional details) ----------
  function personaHtml(p, esc) {
    if (!p) return '';
    return '<section class="mm-persona" aria-label="' + esc(p.title) + '"><h3>' + esc(p.title) + '</h3>' + (p.intro ? paras(p.intro, esc) : '') +
      '<dl>' + p.rows.map(function (r) { return '<div><dt>' + esc(r.label) + '</dt><dd>' + esc(r.value) + (r.note ? '<span class="muted"> · ' + esc(r.note) + '</span>' : '') + '</dd></div>'; }).join('') + '</dl></section>';
  }
  // "My info": the card stays one click away on every screen once the participant has it.
  function myInfo(plan, ui) {
    if (!plan.persona || document.getElementById('mm-myinfo')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'mm-myinfo'; b.className = 'secondary mm-myinfo'; b.textContent = 'My info';
    var d = document.createElement('dialog'); d.id = 'mm-myinfo-d'; d.className = 'mm-dialog';
    d.innerHTML = personaHtml(plan.persona, ui.esc) + '<form method="dialog" class="actions"><button>Close</button></form>';
    b.addEventListener('click', function () { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); logUi('myinfo_open'); });
    document.body.appendChild(b); document.body.appendChild(d);
  }
  // Interface events between saves (My info opened, directory searches): sent with the next item's answer.
  var uiLog = [];
  function logUi(name) { uiLog.push({ name: name, at: Math.round(now()) }); }
  function takeUiLog() { var x = uiLog; uiLog = []; return x; }

  // ---------- a directory with search and a dial pad (calls back through the server) ----------
  // opts: { entries, onDial(number, source) -> Promise<{ say, audio }>, voice }
  function directoryWidget(box, ui, opts) {
    var esc = ui.esc;
    box.innerHTML = '<h3 tabindex="-1">' + ui.Th('directory_title') + '</h3>' + (opts.down ? '<p class="mm-down" role="status">The company directory is down right now. The dial pad still works.</p>' :
      '<label class="sr" for="mm-dsearch">Search</label><input type="search" id="mm-dsearch" placeholder="Search the directory" autocomplete="off">') +
      '<ul class="directory" id="mm-dlist"' + (opts.down ? ' hidden' : '') + '></ul><form class="row mm-dialpad" id="mm-dpad"><label for="mm-dnum">Dial a number</label><input id="mm-dnum" inputmode="tel" autocomplete="off" placeholder="555-0100"><button type="submit" class="secondary small">Call</button></form>' +
      '<p class="muted" id="mm-dstate" aria-live="polite"></p>';
    var list = box.querySelector('#mm-dlist'), q = box.querySelector('#mm-dsearch'), ds = box.querySelector('#mm-dstate'), busy = false;
    function render() {
      if (!q) return;
      var term = q.value.trim().toLowerCase();
      list.innerHTML = opts.entries.filter(function (d) { return !term || (d.name + ' ' + (d.dept || '')).toLowerCase().indexOf(term) >= 0; }).map(function (d) {
        return '<li><span><strong>' + esc(d.name) + '</strong>' + (d.dept ? ' <span class="muted">' + esc(d.dept) + '</span>' : '') + '<br><span class="muted">' + esc(d.number) + '</span></span><button type="button" class="secondary small" data-num="' + esc(d.number) + '">' + ui.Th('directory_call') + '</button></li>';
      }).join('') || '<li class="muted">No matches.</li>';
    }
    function dial(number, source) {
      if (busy || !number) return; busy = true; ds.textContent = 'Calling ' + number + '…';
      opts.onDial(number, source).then(function (r) {
        var line = r && r.say ? r.say : 'No answer.';
        ds.textContent = (r && r.name ? r.name + ': ' : '') + line;
        speak(line, { voice: opts.voice, audio: r && r.audio }, null, function () { busy = false; ds.textContent += ' (call ended)'; });
      }, function () { busy = false; ds.textContent = 'The call did not go through.'; });
    }
    if (q) q.addEventListener('input', function () { render(); if (q.value.trim()) logUi('directory_search:' + q.value.trim().toLowerCase().slice(0, 30)); });
    list.addEventListener('click', function (e) { var n = e.target.getAttribute && e.target.getAttribute('data-num'); if (n) dial(n, 'directory'); });
    box.querySelector('#mm-dpad').addEventListener('submit', function (e) { e.preventDefault(); dial(box.querySelector('#mm-dnum').value.trim(), 'dialpad'); });
    render();
    var h = box.querySelector('h3'); if (h) h.focus();
  }

  // ---------- training screens: embedded clips, a minimum time, a practice dialer ----------
  function clipsHtml(it, esc) {
    return (it.clips || []).map(function (c, i) {
      return '<figure class="mm-clip"><figcaption>' + esc(c.label || ('Example ' + (i + 1))) + '</figcaption><audio controls preload="none" src="' + esc(c.media) + '" data-clip="' + i + '"></audio>' +
        (c.transcript ? '<details class="mm-transcript"' + (agentOn ? ' open data-agent="transcript"' : '') + '><summary>' + ui0('transcript_label') + '</summary><p>' + esc(c.transcript) + '</p></details>' : '') + '</figure>';
    }).join('');
  }
  var ui0 = function (k) { return k === 'transcript_label' ? 'Show transcript' : k; };
  function dialHtml(it) { return it.practiceDial ? '<div class="mm-pdial" id="mm-pdial"></div>' : ''; }

  // ---------- the live passive decision: answer while the clip plays ----------
  // Start (centred below) begins the clip and opens the two answers (top corners). The path from Start to the first
  // answer is the mouse trajectory; the answer can be changed until the clip ends (every change logged with the clip
  // time); Space marks the moment the participant has decided. Half of each arm also moves a suspicion slider in one block.
  function renderLive(ctx, ui) {
    var it = ctx.trial.item, plan = ctx.plan, esc = ui.esc, dec = ctx.trial.decision, qs = answersFor(it, plan);
    var state = { t0: now(), decision: null }, live = { startMs: null, changes: [], decidedMs: null, decidedClipMs: null, final: null, late: false, clipMs: null }, slider = it.slider ? [] : null;
    ui.show('<h2>' + esc(it.title) + '</h2><div class="mm-item mm-k-audio" data-trace="item">' + paras(it.body, esc) + '<audio id="mm-el" preload="auto" src="' + esc(it.media) + '"></audio>' +
      (agentOn ? agentHtml(it.agentText || it.transcript, esc) : '') +
      '<div class="mm-bar" aria-hidden="true"><span id="mm-fill"></span></div></div>' +
      '<fieldset class="q-group mt" data-name="decision"><legend class="q">' + esc(dec.prompt) + '</legend><div class="mt-area" id="mt-area" data-n="' + dec.options.length + '">' +
      dec.options.map(function (o, i) { return '<button type="button" class="mt-opt" data-value="' + esc(o.value) + '" data-trace="decision:' + esc(o.value) + '" style="--i:' + i + '" disabled>' + esc(o.label) + '</button>'; }).join('') +
      '<p class="mt-hint muted" id="mt-hint">' + (it.locked ? 'Click Start to play the call. This time the answers open only when the call ends. Press the space bar the moment you have decided.'
        : 'Click Start to play the call. Choose an answer while it plays; you can change it until the call ends. Press the space bar the moment you have decided.') + '</p>' +
      '<button type="button" class="mt-start" id="mt-start">' + ui.Th('decision_start') + '</button></div></fieldset>' +
      (slider ? '<div class="mm-slider"><label for="mm-sl">How suspicious does this call seem right now?</label><input type="range" id="mm-sl" min="0" max="100" value="50" disabled><div class="row muted"><span>Not at all</span><span>Very</span></div></div>' : '') +
      '<p class="muted" id="mm-livestate" aria-live="polite"></p><fieldset class="mm-answers" id="mm-answers" disabled>' + ui.questionsHtml(qs) + '</fieldset>' +
      '<div id="trialmsg"></div><div class="actions"><button id="mm-submit" disabled>' + ui.Th('submit_button') + '</button></div>');
    var el = document.getElementById('mm-el'), start = document.getElementById('mt-start'), area = document.getElementById('mt-area'), opts = area.querySelectorAll('.mt-opt');
    var fill = document.getElementById('mm-fill'), ls = document.getElementById('mm-livestate'), box = document.getElementById('mm-answers'), submit = document.getElementById('mm-submit'), msg = document.getElementById('trialmsg');
    var path = [], tracking = false, ended = false, t0 = 0, sl = document.getElementById('mm-sl'), slTimer = null;
    var m = state.media = { plays: 0, pauses: 0, firstPlayMs: null, endedMs: null, heardPct: 0, durationMs: null, transcriptOpened: false };
    function clipMs() { return Math.round((el.currentTime || 0) * 1000); }
    // In agent mode the clip is not played: its words are on screen, and it "ends" a moment after Start.
    function play() { if (agentOn) { setTimeout(function () { el.dispatchEvent(new Event('ended')); }, 1500); return Promise.resolve(); } return el.play(); }
    function move(e) { var t = Math.round(now() - t0); if (tracking && path.length < 1400 && t - path[path.length - 1][2] >= 8) path.push([Math.round(e.clientX), Math.round(e.clientY), t]); }
    function key(e) { if ((e.code === 'Space' || e.key === ' ') && live.startMs != null && live.decidedMs == null && !ended) { e.preventDefault(); live.decidedMs = Math.round(now() - state.t0); live.decidedClipMs = clipMs(); ctx.record('decided', live.decidedClipMs); ls.textContent = 'Marked as decided.'; } }
    document.addEventListener('keydown', key);
    start.addEventListener('click', function (e) {
      // A locked trial: Start only plays the call; when it ends, the same button ("Answer") opens the tracked choice.
      if (it.locked && !ended) {
        live.startMs = Math.round(now() - state.t0); start.hidden = true; document.getElementById('mt-hint').hidden = true;
        if (sl) { sl.disabled = false; slTimer = setInterval(function () { slider.push([clipMs(), Number(sl.value)]); }, 250); }
        play().catch(function () { ls.textContent = 'The clip could not play.'; });
        return;
      }
      if (it.locked && ended) {
        t0 = now(); path = [[Math.round(e.clientX || 0), Math.round(e.clientY || 0), 0]]; tracking = true;
        start.hidden = true; area.classList.add('live'); opts.forEach(function (o) { o.disabled = false; }); document.addEventListener('pointermove', move);
        ls.textContent = '';
        return;
      }
      t0 = now(); live.startMs = Math.round(t0 - state.t0); path = [[Math.round(e.clientX || 0), Math.round(e.clientY || 0), 0]]; tracking = true;
      start.hidden = true; document.getElementById('mt-hint').hidden = true; area.classList.add('live');
      opts.forEach(function (o) { o.disabled = false; }); document.addEventListener('pointermove', move);
      if (sl) { sl.disabled = false; slTimer = setInterval(function () { slider.push([clipMs(), Number(sl.value)]); }, 250); }
      play().catch(function () { ls.textContent = 'The clip could not play. Click an answer to continue.'; });
    });
    el.addEventListener('loadedmetadata', function () { m.durationMs = Math.round(el.duration * 1000); });
    el.addEventListener('play', function () { m.plays++; if (m.firstPlayMs == null) m.firstPlayMs = Math.round(now() - state.t0); });
    el.addEventListener('timeupdate', function () { if (el.duration) { var p = el.currentTime / el.duration * 100; fill.style.width = p + '%'; m.heardPct = Math.max(m.heardPct, Math.round(p)); } });
    opts.forEach(function (o) {
      o.addEventListener('click', function (e) {
        if (start.hidden === false) return;
        var v = o.getAttribute('data-value');
        if (tracking) { tracking = false; document.removeEventListener('pointermove', move); path.push([Math.round(e.clientX || 0), Math.round(e.clientY || 0), Math.round(now() - t0)]); state.trajectory = path; state.decisionMs = Math.round(now() - state.t0); }
        if (ended && live.final) return;
        live.changes.push({ ms: Math.round(now() - state.t0), clipMs: clipMs(), value: v }); ctx.record('decision', v);
        state.decision = live.final = v; if (ended && !it.locked) live.late = true;
        opts.forEach(function (x) { x.classList.toggle('chosen', x === o); x.setAttribute('aria-pressed', x === o ? 'true' : 'false'); });
        if (ended) lock();
      });
    });
    function lock() {
      opts.forEach(function (x) { x.disabled = true; }); area.classList.remove('live'); area.classList.add('done');
      box.disabled = false; submit.disabled = false; ls.textContent = '';
    }
    el.addEventListener('ended', function () {
      ended = true; m.endedMs = Math.round(now() - state.t0); m.heardPct = agentOn ? 0 : 100; live.clipMs = isFinite(el.duration) ? Math.round(el.duration * 1000) : null;
      if (slTimer) { clearInterval(slTimer); slTimer = null; if (sl) sl.disabled = true; }
      document.removeEventListener('keydown', key);
      if (it.locked) { start.textContent = 'Answer'; start.hidden = false; ls.textContent = 'The call has ended. Click Answer, then choose.'; return; }
      if (live.final) lock(); else ls.textContent = 'The call has ended. Choose an answer now.';
    });
    var set = ui.questionSet(box, qs, msg, submit, function (n, v) { ctx.record(n, v); });
    submit.addEventListener('click', function () {
      if (!state.decision) return missingDecision(dec, msg, ui, ui.stage);
      if (!set.check()) return;
      submit.disabled = true; msg.innerHTML = '';
      ctx.submit({ answers: set.answers, decision: state.decision, decisionMs: state.decisionMs, trajectory: state.trajectory, media: m, live: live, slider: slider, rtMs: Math.round(now() - state.t0) },
        function (err) { submit.disabled = false; msg.innerHTML = ui.errorBox(err); });
    });
  }

  // ---------- an item with a stimulus and answers ----------
  function renderItem(ctx, ui) {
    var it = ctx.trial.item, plan = ctx.plan, esc = ui.esc, dec = ctx.trial.decision, qs = answersFor(it, plan);
    if (it.kind === 'audio' && it.live && dec) return renderLive(ctx, ui);
    var state = { t0: now(), decision: null };
    var media = it.kind === 'image' ? '<figure class="mm-figure"><img src="' + esc(it.media) + '" alt="' + esc(it.mediaAlt || '') + '" data-trace="image"></figure>'
      : it.kind === 'audio' || it.kind === 'video' ? playerHtml(it, ui) + (agentOn ? agentHtml(it.agentText || it.transcript, esc) : '') : '';
    var gate = (it.kind === 'audio' || it.kind === 'video') && it.mustFinish;
    // A training screen waits for its minimum time, every example played to the end, and the practice call made.
    var nClips = (it.clips || []).length, screen = { dwellMs: 0, clipsPlayed: 0, clipsEnded: 0, dialed: [], reachedTarget: false }, ended = {}, timeOk = !(it.minSeconds > 0);
    var screenGate = nClips > 0 || !timeOk || !!it.practiceDial;
    ui.show('<h2>' + esc(it.title) + '</h2><div class="mm-item mm-k-' + esc(it.kind) + '" data-trace="item">' + (it.persona ? personaHtml(plan.persona, esc) : '') + paras(it.body, esc) + media + clipsHtml(it, esc) + dialHtml(it) + '</div>' +
      (gate ? '<p class="muted mm-gate" id="mm-gate">' + ui.Th('media_wait') + '</p>' : '') + (screenGate ? '<p class="muted mm-gate" id="mm-sgate"></p>' : '') +
      '<fieldset class="mm-answers" id="mm-answers"' + (gate ? ' disabled' : '') + '>' + decisionHtml(dec, ui) + ui.questionsHtml(qs) + voiceHtml(it, plan, ui) + '</fieldset>' +
      '<div id="trialmsg"></div><div class="actions"><button id="mm-submit"' + (gate || screenGate ? ' disabled' : '') + '>' + ui.Th(ctx.isPractice ? 'practice_submit' : 'submit_button') + '</button></div>');
    var root = ui.stage, submit = document.getElementById('mm-submit'), msg = document.getElementById('trialmsg'), box = document.getElementById('mm-answers');
    function screenReady() {
      var left = [];
      if (!timeOk) left.push('a little more time on this screen');
      if (screen.clipsEnded < nClips) left.push('every example played to the end (' + screen.clipsEnded + ' of ' + nClips + ')');
      if (it.practiceDial && !screen.reachedTarget) left.push('you call the number this screen asks for');
      var g = document.getElementById('mm-sgate'); if (g) g.textContent = left.length ? 'Continue opens after ' + left.join(', ') + '.' : '';
      if (!left.length && !gate) submit.disabled = false;
    }
    if (screenGate) {
      if (agentOn) screen.clipsEnded = nClips;   // the examples' words are shown open; only the minimum time still applies
      if (!timeOk) setTimeout(function () { timeOk = true; screenReady(); }, it.minSeconds * 1000);
      root.querySelectorAll('audio[data-clip]').forEach(function (a) {
        a.addEventListener('play', function () { screen.clipsPlayed++; ctx.record('clip_play', Number(a.getAttribute('data-clip'))); root.querySelectorAll('audio[data-clip]').forEach(function (o) { if (o !== a) o.pause(); }); });
        a.addEventListener('ended', function () { var k = a.getAttribute('data-clip'); if (!ended[k]) { ended[k] = true; screen.clipsEnded++; screenReady(); } });
      });
      if (it.practiceDial) {
        var pd = it.practiceDial;
        directoryWidget(document.getElementById('mm-pdial'), ui, { entries: pd.directory || [], voice: 'af_sarah', onDial: function (number, source) {
          screen.dialed.push(number);
          var d = (pd.directory || []).filter(function (x) { return x.number.replace(/\D/g, '').slice(-7) === number.replace(/\D/g, '').slice(-7); })[0];
          var hit = d && pd.target && d.number.replace(/\D/g, '').slice(-7) === pd.target.replace(/\D/g, '').slice(-7);
          if (hit) { screen.reachedTarget = true; setTimeout(screenReady, 0); }
          return Promise.resolve(d ? { name: d.name, say: hit ? pd.say : (d.greeting || 'Thank you for calling ' + d.name + '.'), audio: (hit ? pd.media : d.media) || null } : { say: 'The number you have dialed is not in service.', audio: pd.missMedia || null });
        } });
      }
      screenReady();
    }
    if (it.kind === 'audio' || it.kind === 'video') {
      var heard = function () { box.disabled = false; submit.disabled = false; var g = document.getElementById('mm-gate'); if (g) g.hidden = true; };
      wireMedia(root, it, ui, state, heard);
      if (agentOn) heard();
    }
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
        if (screenGate) screen.dwellMs = Math.round(now() - state.t0);
        ctx.submit({ answers: set.answers, decision: state.decision, decisionMs: state.decisionMs, trajectory: state.trajectory, media: state.media || null, voice: it.recordVoice ? state.voice : null, rtMs: Math.round(now() - state.t0),
          screen: screenGate ? screen : null, uiEvents: takeUiLog() },
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
    function turn(kind, said, audio) {
      var run = queue.then(function () {
        var body = { session: plan.session, index: ctx.index, seq: st.seq, kind: kind, clientMs: Math.round(now() - st.t0), latencyMs: st.lastLatency, asr: kind === 'say' && !!st.lastWasSpoken };
        if (said != null) body.said = said;
        if (audio) body.audio = audio;
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
      return '<h2 class="sr">' + esc(it.title) + '</h2><div class="phone ' + (cls || '') + '"><div class="phone-top"><div class="avatar" aria-hidden="true">' + (call.number ? esc((call.caller || '?').charAt(0)) : '') + '</div>' +
        '<div class="caller"><strong>' + esc(call.caller) + '</strong><span>' + esc(call.number || '') + '</span></div></div>' + inner + '</div>';
    }
    // Codes that "arrive" on the participant's authenticator during this call.
    var codes = [];
    function authHtml() {
      return '<section class="mm-auth" id="ph-auth" aria-live="polite"><h3>Authenticator</h3>' + (codes.length ? '<ul>' + codes.map(function (c) {
        return '<li><span class="muted">' + esc(c.service) + ' · ' + esc(c.at) + '</span><strong>' + esc(c.value.slice(0, 3) + ' ' + c.value.slice(3)) + '</strong></li>'; }).join('') + '</ul>' : '<p class="muted">No new codes.</p>') + '</section>';
    }
    function addCode(c) {
      codes.push({ service: c.service, value: String(c.value), at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
      var a = document.getElementById('ph-auth'); if (a) a.outerHTML = authHtml();
      logUi('code_shown');
    }
    // 1. ringing (the retry of a practice call is skipped when the first try worked)
    if (call.gate && call.gate.retryOf) {
      ui.call('gate/status', { session: plan.session, index: ctx.index }).then(function (r) {
        if (r && r.passed) return ctx.submit({ answers: {}, call: { answered: false }, rtMs: 0 }, function (err) { ui.show(ui.errorBox(err)); });
        ui.show('<h2>' + esc(it.title) + '</h2><p>We could not hear you on that call. Please check that your microphone is on, then try the practice call once more. Speak your reply out loud.</p><div class="actions"><button id="ph-again">Try again</button></div>');
        document.getElementById('ph-again').addEventListener('click', ringNow);
      });
    } else ringNow();
    function ringNow() {
      ui.show(phone('<p class="phone-status" id="ph-status">' + (call.number ? ui.Th('call_incoming') : '') + '</p><div class="phone-btns"><button type="button" class="decline" id="ph-decline">' + ui.Th('call_decline') + '</button>' +
        '<button type="button" class="answer" id="ph-answer">' + ui.Th('call_answer') + '</button></div>', 'ringing'));
      st.ringT0 = now(); ring.start();
      ringTimer = setTimeout(function () { ring.stop(); st.endedBy = 'timeout'; turn('timeout').then(function () { afterCall(ui.T('call_missed')); }); }, Math.max(5, Number(call.ringSeconds) || 30) * 1000);
      document.getElementById('ph-decline').addEventListener('click', function () { clearTimeout(ringTimer); ring.stop(); st.endedBy = 'participant'; st.ringMs = Math.round(now() - st.ringT0); turn('decline').then(function () { afterCall(ui.T('call_missed')); }); });
      document.getElementById('ph-answer').addEventListener('click', answer);
    }
    // Calling a number back, from the directory or the dial pad, during the call (on hold) or after it.
    function dialOut(number, source) {
      return ui.call('call/callback', { session: plan.session, index: ctx.index, number: number, source: source, duringCall: !st.ended });
    }

    function answer() {
      clearTimeout(ringTimer); ring.stop(); st.answered = true; st.ringMs = Math.round(now() - st.ringT0); st.callT0 = now();
      // Speech goes to the lab's own recognizer when the study has one (audio never leaves the lab's machines);
      // otherwise the browser's recognizer is used where it exists. Typing is always available.
      st.serverAsr = plan.asr === 'server';
      var canSpeak = st.serverAsr ? !!(plan.recording && navigator.mediaDevices && !micBlocked) : !!SR && !micBlocked;
      ui.show(phone(
        '<p class="phone-status" id="ph-status" aria-live="off">0:00</p>' + (plan.recording ? '<p class="rec-note" id="ph-rec" hidden><span class="dot" aria-hidden="true"></span>' + ui.Th('call_recording') + '</p>' : '') + authHtml() +
        '<div class="captions" id="ph-captions" aria-live="polite" hidden></div>' +
        '<div class="phone-talk">' + (canSpeak ? '<button type="button" class="talk" id="ph-talk" disabled>' + ui.Th('call_talk') + '</button><p class="interim muted" id="ph-interim" aria-live="polite"></p>' : '') +
        '<form id="ph-typeform" class="typeform"' + (call.scored && canSpeak ? ' hidden' : '') + '><label for="ph-type">' + ui.Th('call_type_label') + '</label><div class="row"><input type="text" id="ph-type" autocomplete="off" disabled><button type="submit" class="secondary" id="ph-send" disabled>' + ui.Th('call_send') + '</button></div></form></div>' +
        '<div class="phone-btns small"><label class="check"><input type="checkbox" id="ph-cc"> ' + ui.Th('call_captions') + '</label><button type="button" class="secondary" id="ph-hold">' + ui.Th('call_hold') + '</button>' +
        ((plan.directory || []).length ? '<button type="button" class="secondary" id="ph-dirlive">' + ui.Th('directory_open') + '</button>' : '') +
        '<button type="button" class="decline" id="ph-hang">' + ui.Th('call_hangup') + '</button></div><div id="ph-dirbox-live" hidden></div>', 'live'));
      if (agentOn) document.getElementById('ph-captions').hidden = false;   // the caller's words, for an agent that cannot listen
      var dl = document.getElementById('ph-dirlive');
      if (dl) dl.addEventListener('click', function () {
        st.directoryOpened = true; logUi('directory_open_live');
        if (st.holdAt == null) document.getElementById('ph-hold').click();   // looking a number up puts the caller on hold
        var b = document.getElementById('ph-dirbox-live'); b.hidden = false; dl.hidden = true;
        directoryWidget(b, ui, { entries: plan.directory, down: !!it.directoryDown, voice: call.voice, onDial: function (n, src) { st.callbacks = (st.callbacks || 0) + 1; return dialOut(n, src); } });
      });
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
      if (talk) talk.addEventListener('click', function () { if (listening) { if (st.stopListen) st.stopListen(); else if (recog) recog.stop(); } else listen(); });
      turn('answer').then(function (r) { if (r && r.error === 'call_over') return hangUp(true); if (!r || r.error) return failed(); callerSays(r); });
    }
    // In a scored call the reply is spoken; the type box appears only if the microphone or the recognizer fails twice.
    function showType(why) { var f = document.getElementById('ph-typeform'); if (f && f.hidden) { f.hidden = false; logUi('type_box_shown:' + why); } }
    function setInput(on) { ['ph-type', 'ph-send', 'ph-talk'].forEach(function (id) { var el = document.getElementById(id); if (el) el.disabled = !on; }); }
    function caption(who, text) {
      var c = document.getElementById('ph-captions'); if (!c) return;
      var p = document.createElement('p'); p.className = who; p.textContent = (who === 'caller' ? (call.number ? call.caller : 'Caller') + ': ' : 'You: ') + text; c.appendChild(p); c.scrollTop = c.scrollHeight;
    }
    // The participant can talk over the caller, as on a real phone: input opens as soon as the caller starts
    // speaking, and replying cuts the caller off (counted in "interruptions"). busy = waiting for the server.
    function callerSays(r) {
      busy = false;
      if (r.heard != null && st.pendingCaption) { st.pendingCaption.textContent = 'You: ' + (r.heard || '(nothing heard)'); st.pendingCaption = null; }
      if (r.code) addCode(r.code);
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
    function say(text, audio) {
      if (voice) { st.interruptions = (st.interruptions || 0) + 1; var v = voice; voice = null; v.stop(); }
      caption('you', audio ? '…' : text); if (audio) { var c = document.getElementById('ph-captions'); st.pendingCaption = c && c.lastChild; }
      busy = true; setInput(false); st.sentAt = now();
      turn('say', audio ? null : text, audio).then(function (r) {
        if (r && r.error === 'asr_unavailable') {
          busy = false; st.asrFails = (st.asrFails || 0) + 1; if (st.asrFails >= 2) showType('asr');
          setInput(true); var s = document.getElementById('ph-interim'); if (s) s.textContent = document.getElementById('ph-typeform').hidden ? 'We could not hear that. Please say it again.' : 'We could not hear that. Please say it again, or type it.'; return;
        }
        if (!r || r.error) { if (r && r.error === 'call_over') return hangUp(true); return failed(); }
        callerSays(r);
      });
    }
    // Server recognition: tap to start, tap again to send (a WAV of what was said goes to the lab's recognizer).
    function listenServer() {
      var talk = document.getElementById('ph-talk'), interim = document.getElementById('ph-interim');
      (stream ? Promise.resolve(stream) : getMic()).then(function (s) {
        if (!s) { micBlocked = true; if (talk) talk.hidden = true; showType('mic'); return; }
        var wr; try { wr = wavRecorder(s); } catch (e) { return; }
        listening = true; talk.classList.add('rec'); talk.textContent = ui.T('call_listening'); if (interim) interim.textContent = '';
        st.stopListen = function () {
          listening = false; st.stopListen = null; talk.classList.remove('rec'); talk.textContent = ui.T('call_talk');
          var out = wr.stop();
          if (out.durationMs < 300 || st.ended) return;
          st.spoken++; st.lastWasSpoken = true;
          blobToBase64(out.blob).then(function (b64) { say(null, b64); });
        };
      });
    }
    function listen() {
      if (st.serverAsr) return listening && st.stopListen ? st.stopListen() : listenServer();
      var talk = document.getElementById('ph-talk'), interim = document.getElementById('ph-interim'), heard = '';
      try { recog = new SR(); } catch (e) { recog = null; }
      if (!recog) return;
      recog.lang = 'en-US'; recog.interimResults = true; recog.continuous = true; recog.maxAlternatives = 1;
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
      ui.show(phone('<p class="phone-status">' + esc(status) + '</p>' + (codes.length ? authHtml() : '') + (dir.length ? '<div class="phone-btns small"><button type="button" class="secondary" id="ph-dir">' + ui.Th('directory_open') + '</button></div><div id="ph-dirbox" hidden></div>' : ''), 'ended') +
        '<fieldset class="mm-answers" id="mm-answers">' + decisionHtml(dec, ui) + ui.questionsHtml(qs) + '</fieldset>' +
        '<div id="trialmsg"></div><div class="actions"><button id="mm-submit">' + ui.Th('submit_button') + '</button></div>');
      var root = ui.stage, box = document.getElementById('mm-answers'), submit = document.getElementById('mm-submit'), msg = document.getElementById('trialmsg'), dirBtn = document.getElementById('ph-dir');
      if (dirBtn) dirBtn.addEventListener('click', function () {
        st.directoryOpened = true; logUi('directory_open_after');
        var b = document.getElementById('ph-dirbox'); b.hidden = false; dirBtn.hidden = true;
        directoryWidget(b, ui, { entries: dir, down: !!it.directoryDown, voice: call.voice, onDial: dialOut });
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
            call: { answered: st.answered, ringMs: st.ringMs, durationMs: st.durationMs || 0, holdMs: Math.round(st.holdMs), typedTurns: st.typed, spokenTurns: st.spoken, interruptions: st.interruptions || 0, captions: st.captions, directoryOpened: st.directoryOpened, endedBy: st.endedBy, latencies: st.latencies },
            uiEvents: takeUiLog() },
            function (err) { submit.disabled = false; msg.innerHTML = ui.errorBox(err); });
        });
      });
    }
  }

  // ---------- equipment checks (scored on the server; failing every attempt ends the study) ----------
  // Headphones (Woods et al. 2017): three 200 Hz tones per round, one 6 dB quieter, one in antiphase (left and right
  // inverted, which partly cancels over loudspeakers but not over headphones). The quieter tone is the answer.
  function playTones(order, onDone) {
    var Ctx = window.AudioContext || window.webkitAudioContext, ac;
    try { ac = new Ctx(); } catch (e) { return onDone(); }
    var t = ac.currentTime + 0.15, dur = 1.0, gap = 0.5, base = 0.18;
    order.forEach(function (kind) {
      var osc = ac.createOscillator(), env = ac.createGain(), inv = ac.createGain(), merge = ac.createChannelMerger(2), level = kind === 'quiet' ? base / 2 : base;
      osc.frequency.value = 200; osc.connect(env);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(level, t + 0.1);
      env.gain.setValueAtTime(level, t + dur - 0.1); env.gain.linearRampToValueAtTime(0, t + dur);
      env.connect(merge, 0, 0);
      inv.gain.value = kind === 'anti' ? -1 : 1; env.connect(inv); inv.connect(merge, 0, 1);
      merge.connect(ac.destination);
      osc.start(t); osc.stop(t + dur);
      t += dur + gap;
    });
    setTimeout(function () { try { ac.close(); } catch (e) {} onDone(); }, (t - ac.currentTime) * 1000 + 100);
  }

  // Word check: records 16 kHz mono WAV in the browser, so the lab's Whisper server needs no converter.
  function wavRecorder(stream) {
    var Ctx = window.AudioContext || window.webkitAudioContext, ac = new Ctx(), src = ac.createMediaStreamSource(stream);
    var proc = ac.createScriptProcessor(4096, 1, 1), bufs = [], t0 = now();
    proc.onaudioprocess = function (e) { bufs.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    src.connect(proc); proc.connect(ac.destination);
    return {
      stop: function () {
        try { proc.disconnect(); src.disconnect(); } catch (e) {}
        var rate = ac.sampleRate, n = bufs.reduce(function (s, b) { return s + b.length; }, 0), all = new Float32Array(n), o = 0;
        bufs.forEach(function (b) { all.set(b, o); o += b.length; });
        try { ac.close(); } catch (e) {}
        var ratio = rate / 16000, m = Math.floor(n / ratio), pcm = new DataView(new ArrayBuffer(44 + m * 2));
        function str(off, s) { for (var i = 0; i < s.length; i++) pcm.setUint8(off + i, s.charCodeAt(i)); }
        str(0, 'RIFF'); pcm.setUint32(4, 36 + m * 2, true); str(8, 'WAVE'); str(12, 'fmt '); pcm.setUint32(16, 16, true); pcm.setUint16(20, 1, true); pcm.setUint16(22, 1, true);
        pcm.setUint32(24, 16000, true); pcm.setUint32(28, 32000, true); pcm.setUint16(32, 2, true); pcm.setUint16(34, 16, true); str(36, 'data'); pcm.setUint32(40, m * 2, true);
        for (var i = 0; i < m; i++) {   // average the samples that fall in each 16 kHz step
          var a = Math.floor(i * ratio), z = Math.min(n, Math.floor((i + 1) * ratio)), s = 0;
          for (var j = a; j < z; j++) s += all[j];
          var v = Math.max(-1, Math.min(1, z > a ? s / (z - a) : 0));
          pcm.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        }
        return { blob: new Blob([pcm.buffer], { type: 'audio/wav' }), durationMs: Math.round(now() - t0) };
      }
    };
  }

  function runCheck(ctx, ui) {
    var it = ctx.trial.item, k = it.check || {}, esc = ui.esc, attempt = 1, t0 = now(), outages = 0;
    var finish = function () { ctx.submit({ answers: {}, rtMs: Math.round(now() - t0) }, function (err) { var m = document.getElementById('mm-ckmsg'); if (m) m.innerHTML = ui.errorBox(err); }); };
    var passed = function () {
      ui.show('<h2>' + esc(it.title) + '</h2><p role="status">' + ui.Th('check_passed') + '</p><div class="actions"><button type="button" id="mm-ckgo">' + ui.Th('submit_button') + '</button></div><div id="mm-ckmsg"></div>');
      document.getElementById('mm-ckgo').addEventListener('click', function () { this.disabled = true; finish(); });
    };
    var result = function (r, again) {
      if (r && r.pass) return passed();
      if (r && r.attemptsLeft > 0) { attempt++; return again(ui.Tp('check_retry')); }
      finish();   // every attempt failed: the server screens the participant out when the item is saved
    };

    // A reload resumes the check where it stood (passed, or the next unused attempt).
    var begin = function (fn) {
      ui.call('check/status', { session: ctx.plan.session, index: ctx.index }).then(function (s) {
        if (s && s.passed) return passed();
        if (s && s.nextAttempt > s.attempts) return finish();
        if (s && s.nextAttempt > 1) { attempt = s.nextAttempt; return fn(ui.Tp('check_retry')); }
        fn('');
      });
    };

    if (agentOn) return begin(function () {
      ui.show('<h2>' + esc(it.title) + '</h2><p class="mm-agent" data-agent="check">Agent mode: simulated participants skip this equipment check.</p><div class="actions"><button type="button" id="mm-ckagent">' + ui.Th('submit_button') + '</button></div><div id="mm-ckmsg"></div>');
      document.getElementById('mm-ckagent').addEventListener('click', function () {
        this.disabled = true;
        ui.call(k.test === 'headphones' ? 'check/headphones' : 'check/word', { session: ctx.plan.session, index: ctx.index, attempt: attempt, agent: true }).then(function (res) {
          if (res && res.error) { var m = document.getElementById('mm-ckmsg'); if (m) m.innerHTML = ui.errorBox(res.error); return; }
          result(res, function () {});
        });
      });
    });

    if (k.test === 'headphones') {
      var round = function (note) {
        var picks = [], r = 0, rounds = k.rounds[attempt - 1];
        var one = function () {
          ui.show('<h2>' + esc(it.title) + '</h2>' + (note || '') + ui.Tp('hp_body', { n: rounds.length }) +
            '<p class="muted">' + (r + 1) + ' / ' + rounds.length + '</p><div class="actions"><button type="button" class="secondary" id="mm-hpplay">' + ui.Th('hp_play') + '</button></div>' +
            '<fieldset class="mm-hp" disabled id="mm-hpset"><legend>' + ui.Th('hp_choose') + '</legend>' +
            [1, 2, 3].map(function (n) { return '<button type="button" class="secondary" data-n="' + n + '">' + n + '</button>'; }).join(' ') + '</fieldset><div id="mm-ckmsg"></div>');
          note = '';
          var play = document.getElementById('mm-hpplay'), set = document.getElementById('mm-hpset');
          play.addEventListener('click', function () { play.disabled = true; playTones(rounds[r], function () { set.disabled = false; }); });
          set.addEventListener('click', function (e) {
            var n = e.target && e.target.getAttribute('data-n'); if (!n || set.disabled) return;
            set.disabled = true; picks.push(+n); ctx.record('hp_' + attempt + '_' + (r + 1), +n); r++;
            if (r < rounds.length) return one();
            ui.call('check/headphones', { session: ctx.plan.session, index: ctx.index, attempt: attempt, choices: picks }).then(function (res) {
              if (res && res.error) { var m = document.getElementById('mm-ckmsg'); if (m) m.innerHTML = ui.errorBox(res.error); return; }
              result(res, round);
            });
          });
        };
        one();
      };
      return begin(round);
    }

    // word
    var word = function (note) {
      ui.show('<h2>' + esc(it.title) + '</h2>' + (note || '') + ui.Tp('word_body') +
        '<div class="actions split"><button type="button" class="secondary" id="mm-wplay">' + ui.Th('word_play') + '</button><button type="button" id="mm-wrec" disabled>' + ui.Th('word_record') + '</button></div><div id="mm-ckmsg" role="status"></div>');
      var play = document.getElementById('mm-wplay'), recBtn = document.getElementById('mm-wrec'), msg = document.getElementById('mm-ckmsg'), rec = null, stream = null, auto = null;
      play.addEventListener('click', function () {
        play.disabled = true;
        var a = new Audio(k.media[attempt - 1]); a.onended = a.onerror = function () { recBtn.disabled = false; }; a.play().catch(function () { recBtn.disabled = false; });
      });
      var stopRec = function () {
        clearTimeout(auto); recBtn.disabled = true;
        var out = rec.stop(); stream.getTracks().forEach(function (t) { t.stop(); });
        blobToBase64(out.blob).then(function (b64) { return ui.call('check/word', { session: ctx.plan.session, index: ctx.index, attempt: attempt, data: b64, durationMs: out.durationMs }); }).then(function (res) {
          if (res && res.error === 'asr_unavailable') {
            outages++;
            if (outages >= 2) { msg.innerHTML = '<p>' + ui.Th('check_server_down') + '</p><div class="actions"><button type="button" id="mm-ckgo">' + ui.Th('submit_button') + '</button></div>'; document.getElementById('mm-ckgo').addEventListener('click', finish); return; }
            return word('');
          }
          if (res && res.error) { msg.innerHTML = ui.errorBox(res.error); return; }
          ctx.record('word_' + attempt, res.pass ? 'pass' : 'fail');
          result(res, word);
        });
      };
      // Preview only (the server accepts this from test participants alone): type the word instead of saying it.
      if (/[?&]preview=1/.test(location.search)) {
        msg.insertAdjacentHTML('beforebegin', '<form class="row" id="mm-wtyped"><label for="mm-wt">Preview only: type the word</label><input id="mm-wt" autocomplete="off"><button type="submit" class="secondary small">Send</button></form>');
        document.getElementById('mm-wtyped').addEventListener('submit', function (e) {
          e.preventDefault();
          ui.call('check/word', { session: ctx.plan.session, index: ctx.index, attempt: attempt, typed: document.getElementById('mm-wt').value }).then(function (res) {
            if (res && res.error) { msg.innerHTML = ui.errorBox(res.error); return; }
            result(res, word);
          });
        });
      }
      recBtn.addEventListener('click', function () {
        if (rec) return stopRec();
        getMic().then(function (s) {
          if (!s) { micBlocked = false; msg.innerHTML = '<p>' + ui.Th('check_mic_needed') + '</p>'; return; }
          stream = s; rec = wavRecorder(s); recBtn.textContent = ui.T('word_stop'); auto = setTimeout(stopRec, 5000);
        });
      });
    };
    begin(word);
  }

  var impl = {
    // The end of the study: each scored call with what happened, the points, and the participant's own transcript.
    debrief: function (ui, box) {
      if (!box) return;
      ui.call('debrief', {}).then(function (r) {
        if (!r || r.error || !r.calls || !r.calls.length) return;
        var esc = ui.esc;
        box.innerHTML = '<h2>Your phone shift</h2><p>Total points: <strong>' + esc(String(r.points)) + '</strong></p>' + r.calls.map(function (c, i) {
          return '<details class="mm-debrief"><summary>Call ' + (i + 1) + ': ' + esc(c.caller) + ' · ' + (c.intent === 'attack' ? 'a scam call' : 'a legitimate call') + ' · ' + esc(String(c.points)) + ' points</summary>' +
            '<p class="muted">What happened: ' + esc(String(c.outcome).replace(/_/g, ' ')) + (c.disclosed && c.disclosed.length ? '; you shared: ' + esc(c.disclosed.join(', ')) : '') + (c.callbacks ? '; calls back: ' + c.callbacks : '') + '</p>' +
            c.transcript.map(function (t) { return '<p><strong>' + (t.who === 'you' ? 'You' : esc(c.caller)) + ':</strong> ' + esc(t.text) + '</p>'; }).join('') + '</details>';
        }).join('');
      });
    },
    runTrial: function (ctx, ui) {
      var it = ctx.trial.item;
      agentOn = agentMode(ctx.plan);
      if (agentOn) micBlocked = true;   // replies are typed
      if (it.kind !== 'check') myInfo(ctx.plan, ui);
      if (it.kind === 'check') return runCheck(ctx, ui);
      if (needsSound(it) && !agentOn && !soundChecked[ctx.plan.session] && !(ctx.content && ctx.content.noSoundCheck)) return soundCheck(ctx, ui, function () { impl.runTrial(ctx, ui); });
      if (it.kind === 'call') return runCall(ctx, ui);
      renderItem(ctx, ui);
    }
  };
  LabEngine.registerType('multimodal', impl);
})();
