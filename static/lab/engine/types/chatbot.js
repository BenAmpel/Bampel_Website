/* Study type "chatbot": the conversation screen. The participant types or records messages to an AI chatbot, the
   reply comes back from the server (which holds the chatbot's instruction; this page never sees it), and after the
   conversation the study's questions appear. A reload restores the conversation from the server. Recordings are
   sent to be turned into text and are not kept. The chatbot's messages can be played aloud; when the voice service
   does not answer, the browser's own voice reads them.
   Audio only (chat.voice.audioOnly, spoken studies): the participant sees an animated orb instead of the transcript,
   like a phone call. The transcript stays in the page for screen readers. The crisis message is always shown as text,
   and a reply that cannot be played at all is shown as text too (counted as chat.textShown).
   Server side: netlify/lib/lab/types/chatbot.mjs. */
(function () {
  'use strict';
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/lab/engine/types/chatbot.css'; document.head.appendChild(css);
  var MAX_RECORD_MS = 60000;
  var ICON = {
    mic: '<svg class="cb-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
    stop: '<svg class="cb-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect class="cb-ico-fill" x="7" y="7" width="10" height="10" rx="2"/></svg>',
    send: '<svg class="cb-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
    replay: '<svg class="cb-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/></svg>'
  };

  /* The orb of the audio-only view: breathes when idle, follows the mic level while recording, circles while the
     chatbot thinks, pulses while it speaks. 2D canvas, no library. The reply audio never goes through Web Audio, so a
     suspended audio context cannot silence it. Under reduced motion it draws one still frame per state. */
  function Orb(canvas) {
    var g = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var state = 'idle', level = 0, raf = 0, t0 = 0, colors = null, mic = null;
    var still = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    function readColors() {
      var cs = getComputedStyle(canvas);
      colors = { a: cs.getPropertyValue('--accent').trim() || '#0039a6', b: cs.getPropertyValue('--accent-2').trim() || '#0071ce', soft: cs.getPropertyValue('--accent-soft').trim() || '#e8f1fa' };
    }
    function fit() {
      var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round((canvas.clientWidth || 220) * dpr);
      if (canvas.width !== w) { canvas.width = w; canvas.height = w; }
      return w;
    }
    function micLevel() {
      if (!mic) return 0;
      mic.an.getByteTimeDomainData(mic.buf);
      var sum = 0; for (var i = 0; i < mic.buf.length; i++) { var v = (mic.buf[i] - 128) / 128; sum += v * v; }
      return Math.min(1, Math.sqrt(sum / mic.buf.length) * 5);
    }
    function draw(now) {
      if (!g) return;
      if (!colors) readColors();
      var t = (now - t0) / 1000, S = fit(), c = S / 2, R = S * 0.29, moving = !still.matches, target;
      if (state === 'listening') target = 0.15 + micLevel();
      else if (state === 'speaking') target = moving ? 0.35 + 0.45 * Math.abs(Math.sin(t * 4.7) * Math.sin(t * 1.9 + 1.3)) : 0.5;
      else if (state === 'thinking') target = 0.18;
      else target = 0.08;
      level = moving ? level + (target - level) * 0.16 : target;
      g.clearRect(0, 0, S, S);
      // Halo: two soft rings that swell with the level.
      for (var h = 2; h >= 1; h--) {
        g.globalAlpha = 0.22 + 0.18 * level - h * 0.06;
        g.fillStyle = colors.soft; g.beginPath(); g.arc(c, c, R * (1 + h * (0.16 + 0.22 * level)), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      // The blob: a circle whose edge moves with three slow waves.
      var amp = moving ? level : 0, N = 120, k, a, r;
      g.beginPath();
      for (k = 0; k <= N; k++) {
        a = k / N * Math.PI * 2;
        r = R * (1 + amp * 0.16 * Math.sin(a * 3 + t * 1.6) + amp * 0.1 * Math.sin(a * 5 - t * 2.2) + (moving ? 0.025 : 0) * Math.sin(a * 2 + t * 0.7));
        if (k) g.lineTo(c + r * Math.cos(a), c + r * Math.sin(a)); else g.moveTo(c + r * Math.cos(a), c + r * Math.sin(a));
      }
      g.closePath();
      var grad = g.createLinearGradient(c - R, c - R, c + R, c + R);
      grad.addColorStop(0, colors.b); grad.addColorStop(1, colors.a);
      g.fillStyle = grad; g.fill();
      // Thinking: an arc that circles the orb (a full still ring under reduced motion).
      if (state === 'thinking') {
        g.strokeStyle = colors.a; g.lineWidth = Math.max(2, S * 0.012); g.lineCap = 'round'; g.globalAlpha = 0.75;
        var s0 = moving ? t * 2.4 : 0;
        g.beginPath(); g.arc(c, c, R * 1.42, s0, s0 + (moving ? Math.PI * 0.6 : Math.PI * 2)); g.stroke(); g.globalAlpha = 1;
      }
      raf = moving && !stopped ? requestAnimationFrame(draw) : 0;
    }
    var stopped = false;
    function kick() { if (!raf && !stopped) { if (!t0) t0 = performance.now(); raf = requestAnimationFrame(draw); } }
    return {
      set: function (s) { state = s; if (still.matches) { cancelAnimationFrame(raf); raf = 0; draw(performance.now()); } else kick(); },
      recolor: function () { colors = null; if (still.matches) draw(performance.now()); },
      listen: function (stream) {
        try {
          var AC = window.AudioContext || window.webkitAudioContext; if (!AC || !stream) return;
          var ac = new AC(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 512; src.connect(an);
          if (ac.resume) ac.resume();
          mic = { ac: ac, an: an, buf: new Uint8Array(an.fftSize) };
        } catch (e) { mic = null; }
      },
      deaf: function () { if (mic) { try { mic.ac.close(); } catch (e) {} mic = null; } },
      stop: function () { stopped = true; cancelAnimationFrame(raf); raf = 0; this.deaf(); }
    };
  }

  function paras(text, esc) {
    return String(text || '').split(/\n\s*\n/).map(function (p) { return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function blobToBase64(blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = rej; r.readAsDataURL(blob); });
  }

  LabEngine.registerType('chatbot', {
    runTrial: function (ctx, ui) {
      var esc = ui.esc, T = ui.T, Th = ui.Th, it = ctx.trial.item, qs = ctx.plan.questions || [];
      var canType = it.mode !== 'voice', canTalk = it.mode !== 'text', where = { session: ctx.plan.session, index: ctx.index };
      var call = !!it.audioOnly && !canType;   // audio only: no transcript on screen
      var st = { seq: 0, busy: false, ended: null, started: 0, lastBotAt: 0, heard: null, playing: null, rec: null, recTimer: null, stream: null,
        browserVoice: 0, audioPlayed: 0, micBlocked: false, retries: 0, textShown: 0, last: null };

      var micBtn = canTalk ? '<button type="button" class="cb-mic' + (canType ? ' secondary cb-round' : ' cb-big') + '" id="cb-rec" aria-pressed="false"' + (canType ? ' title="' + Th('chat_record') + '"' : '') + '>' +
        '<span class="cb-mic-ico" id="cb-rec-ico">' + ICON.mic + '</span><span class="' + (canType ? 'cb-sr' : 'cb-mic-label') + '" id="cb-rec-label">' + Th('chat_record') + '</span></button>' : '';
      ui.show('<div class="cb-scenario" data-trace="scenario">' + paras(it.scenario, esc) + '</div>' +
        '<p class="cb-note">' + Th('chat_ai_note', { bot: it.botName }) + '</p>' +
        (call ? '<div class="cb-call" id="cb-call" hidden><canvas class="cb-orb" id="cb-orb" width="440" height="440" aria-hidden="true"></canvas><p class="cb-call-name" aria-hidden="true">' + esc(it.botName) + '</p></div>' : '') +
        '<div class="cb-log' + (call ? ' cb-sr' : '') + '" id="cb-log" role="log" aria-live="' + (call ? 'off' : 'polite') + '" aria-label="' + esc(it.botName) + '"' + (call ? '' : ' tabindex="0"') + '></div>' +
        '<p class="cb-status muted' + (call ? ' cb-status-call' : '') + '" id="cb-status" role="status"></p>' +
        '<div class="cb-shown" id="cb-shown" hidden></div>' +
        '<div class="cb-compose' + (call ? ' cb-compose-call' : canType ? '' : ' cb-compose-voice') + '" id="cb-compose" hidden>' +
          '<div id="cb-typed"' + (canType ? '' : ' hidden') + '><label for="cb-text" class="cb-sr">' + Th('chat_label') + '</label>' +
            '<div class="cb-bar"><textarea id="cb-text" rows="2" maxlength="1500" placeholder="' + Th('chat_label') + '" data-trace="chat-text"></textarea>' +
            (canType ? micBtn : '') +
            '<button type="button" class="cb-send" id="cb-send">' + ICON.send + '<span>' + Th('chat_send') + '</span></button></div></div>' +
          (canType ? '' : '<div class="cb-voicebar">' + micBtn + '</div>') +
          '<p class="cb-hint muted" id="cb-hint"></p>' +
          '<div class="actions cb-actions">' +
            (call ? '<button type="button" class="secondary cb-replay" id="cb-replay" hidden>' + ICON.replay + '<span>' + Th('chat_replay') + '</span></button>' : '') +
            '<button type="button" class="secondary" id="cb-end" hidden>' + Th('chat_end') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="actions" id="cb-startrow" hidden><button type="button" id="cb-start">' + Th('chat_start') + '</button></div>' +
        '<div id="cb-msg"></div>' +
        '<div id="cb-after" hidden><h3 id="cb-after-h" tabindex="-1">' + Th('chat_after') + '</h3>' + ui.questionsHtml(qs) +
          '<div id="trialmsg"></div><div class="actions"><button type="button" id="submit">' + Th('submit_button') + '</button></div></div>');

      var $ = function (id) { return document.getElementById(id); };
      var log = $('cb-log'), status = $('cb-status'), compose = $('cb-compose'), typed = $('cb-typed'), box = $('cb-text'), hint = $('cb-hint'),
        send = $('cb-send'), rec = $('cb-rec'), endBtn = $('cb-end'), msg = $('cb-msg'), after = $('cb-after'), startRow = $('cb-startrow'),
        shown = $('cb-shown'), replay = $('cb-replay'), orb = call ? Orb($('cb-orb')) : null;

      // ---------- the theme (the orb's colours come from the page's CSS variables) ----------
      function recolor() { if (orb) orb.recolor(); }
      document.addEventListener('lab-theme', recolor);
      if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', recolor); }

      // ---------- the transcript on screen ----------
      function bubble(who, text, cls) {
        var d = document.createElement('div'); d.className = 'cb-turn cb-' + who + (cls ? ' ' + cls : '');
        d.innerHTML = '<span class="cb-who">' + (who === 'bot' ? esc(it.botName) : Th('chat_you')) + '</span><div class="cb-text">' + paras(text, esc) + '</div>';
        log.appendChild(d); log.scrollTop = log.scrollHeight;
        return d;
      }
      // Three dots while the reply is on its way. Hidden from screen readers; #cb-status says it in words.
      var dots = null;
      function typing(on) {
        if (call) return;
        if (on && !dots) {
          dots = document.createElement('div'); dots.className = 'cb-turn cb-bot cb-typing'; dots.setAttribute('aria-hidden', 'true');
          dots.innerHTML = '<span class="cb-dot"></span><span class="cb-dot"></span><span class="cb-dot"></span>';
          log.appendChild(dots); log.scrollTop = log.scrollHeight;
        } else if (!on && dots) { dots.remove(); dots = null; }
      }
      function counter() {
        var left = st.safety ? 0 : it.minTurns - st.seq;   // after the crisis message nobody is asked to keep talking
        hint.textContent = T('chat_turns', { i: Math.min(st.seq + 1, it.maxTurns), n: it.maxTurns }) + (left > 0 ? ' ' + T('chat_min', { n: left }) : '');
        endBtn.hidden = left > 0;
      }
      function setBusy(on, text) {
        st.busy = on; send.disabled = on; if (rec) rec.disabled = on; endBtn.disabled = on; box.readOnly = on; if (replay) replay.disabled = on;
        status.textContent = text || '';
      }
      // Audio only: text the participant must see anyway (the crisis message, or a reply that could not be played).
      function showText(text, why) {
        shown.innerHTML = '<div class="cb-shown-in' + (why === 'safety' ? ' cb-shown-safety' : '') + '" role="' + (why === 'safety' ? 'alert' : 'status') + '">' + paras(text, esc) + '</div>';
        shown.hidden = false;
        if (why !== 'safety') st.textShown++;
      }
      function orbSet(s) { if (orb) orb.set(s); }

      // ---------- the chatbot's voice ----------
      function hush() {
        if (st.playing) { try { st.playing.pause(); } catch (e) {} st.playing = null; }
        if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) {} }
        orbSet('idle');
      }
      // Resolves true when the browser's voice started, false when it could not.
      function browserSay(text) {
        return new Promise(function (res) {
          if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return res(false);
          try {
            var u = new SpeechSynthesisUtterance(text), began = false;
            u.onstart = function () { began = true; orbSet('speaking'); res(true); };
            u.onend = u.onerror = function () { if (!st.rec && !st.busy) { orbSet('idle'); status.textContent = ''; } if (!began) res(false); };
            st.browserVoice++; speechSynthesis.speak(u);
            setTimeout(function () { if (!began) res(!!speechSynthesis.speaking || !!speechSynthesis.pending); }, 2500);
          } catch (e) { res(false); }
        });
      }
      function speaking(on) {
        if (!call) return;
        orbSet(on ? 'speaking' : 'idle');
        status.textContent = on ? T('chat_speaking', { bot: it.botName }) : '';
      }
      function say(seq, text) {
        if (!it.speak || !text) return;
        st.last = { seq: seq, text: text }; if (replay) replay.hidden = false;
        var played = function (ok) { if (!ok && call && !st.ended) showText(text, 'unplayed'); if (!ok) speaking(false); };
        if (call) { status.textContent = T('chat_thinking_call', { bot: it.botName }); orbSet('thinking'); }
        ui.call('chat/voice', Object.assign({ seq: seq }, where)).then(function (r) {
          if (st.ended || st.rec) return;   // never talk over a recording or the questions
          if (!r || !r.audio) { speaking(true); return browserSay(text).then(played); }
          hush();
          var a = new Audio(r.audio); st.playing = a;
          a.onended = function () { if (st.playing === a) { st.playing = null; speaking(false); } };
          speaking(true);
          a.play().then(function () { st.audioPlayed++; }, function () { st.playing = null; browserSay(text).then(played); });
        }, function () { speaking(true); browserSay(text).then(played); });
      }
      function botSays(seq, text, aloud) { bubble('bot', text); st.lastBotAt = ctx.ms(); if (aloud) say(seq, text); }

      // ---------- sending a message ----------
      function finish(why) {
        if (st.ended) return;
        st.ended = why; st.endedAt = ctx.ms(); hush(); stopMic(); typing(false);
        if (orb) { orb.stop(); $('cb-call').hidden = true; }
        compose.hidden = true; status.textContent = T('chat_ended'); msg.innerHTML = '';
        ctx.record('chat_end', why + ':' + st.seq);
        after.hidden = false; $('cb-after-h').focus();
      }
      // When the chatbot is off, or has failed twice in a row, the participant can go on to the questions; the data
      // records the conversation as ended by an error.
      function stuck(key) {
        msg.innerHTML = '<p class="cb-warn" role="alert">' + Th(key) + '</p><p><button type="button" class="secondary" id="cb-skip">' + Th('chat_skip') + '</button></p>';
        $('cb-skip').addEventListener('click', function () { finish('error'); });
      }
      function resync() {
        return ui.call('chat/state', where).then(function (r) {
          if (!r || !Array.isArray(r.turns)) return;
          log.innerHTML = ''; dots = null; if (it.opening) bubble('bot', it.opening);
          r.turns.forEach(function (t) { bubble('user', t.user); bubble('bot', t.bot); });
          st.seq = r.turns.length; st.safety = r.turns.some(function (t) { return t.safety; }); st.lastBotAt = ctx.ms(); counter();
          var lastT = r.turns[r.turns.length - 1];
          if (lastT) st.last = { seq: r.turns.length - 1, text: lastT.bot }; else if (it.opening) st.last = { seq: 'open', text: it.opening };
          if (call) {
            var safe = r.turns.filter(function (t) { return t.safety; }).pop();
            if (safe) showText(safe.bot, 'safety');
            if (replay && st.last && st.seq > 0) replay.hidden = false;   // after a reload the last reply can be heard again
          }
          if (r.on && !r.on.chat) stuck('chat_off');
          if (st.seq >= it.maxTurns) finish('max');
        });
      }
      function sendText(text) {
        text = String(text || '').replace(/\s+/g, ' ').trim();
        if (!text || st.busy || st.ended) return;
        hush(); msg.innerHTML = ''; if (call && shown.querySelector('.cb-shown-safety') === null) { shown.hidden = true; shown.innerHTML = ''; }
        var mine = bubble('user', text, 'cb-pending');   // shown at once; replaced by the stored (masked) text below
        setBusy(true, T(call ? 'chat_thinking_call' : 'chat_thinking', { bot: it.botName })); typing(true); orbSet('thinking');
        var seq = st.seq, heard = st.heard;
        ui.call('chat/turn', Object.assign({ seq: seq, text: text, heard: heard || undefined, sinceMs: Math.round(ctx.ms() - st.lastBotAt) }, where)).then(function (r) {
          setBusy(false); typing(false); orbSet('idle');
          if (r && typeof r.bot === 'string') {
            st.heard = null; box.value = ''; st.seq = seq + 1; st.fails = 0; if (r.safety) st.safety = true;
            mine.classList.remove('cb-pending'); mine.querySelector('.cb-text').innerHTML = paras(r.user, esc);
            botSays(seq, r.bot, true);
            if (call && r.safety) showText(r.bot, 'safety');
            ctx.record('chat_turn', String(st.seq)); counter();
            if (r.done) return finish('max');
            if (!typed.hidden) box.focus(); else if (rec) rec.focus();
            return;
          }
          mine.remove();
          var err = r && r.error;
          if (err === 'chat_over') return finish('max');
          if (err === 'out_of_order') return resync();
          st.retries++; st.fails = (st.fails || 0) + 1; box.value = text;
          if (typed.hidden) { typed.hidden = false; send.hidden = false; }   // keeps a spoken message from being lost
          if (err === 'chat_off' || st.fails >= 2) stuck(err === 'chat_off' ? 'chat_off' : 'chat_retry');
          else msg.innerHTML = '<p class="cb-warn" role="alert">' + Th('chat_retry') + '</p>';
          send.focus();
        });
      }
      send.addEventListener('click', function () { sendText(box.value); });
      box.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText(box.value); } });
      box.addEventListener('input', function () { if (st.heard && !box.value.trim()) st.heard = null; });
      endBtn.addEventListener('click', function () { if (!st.busy && (st.safety || st.seq >= it.minTurns)) finish('user'); });
      if (replay) replay.addEventListener('click', function () { if (st.last && !st.busy && !st.rec && !st.ended) say(st.last.seq, st.last.text); });

      // ---------- recording a message ----------
      function stopMic() {
        clearTimeout(st.recTimer);
        if (st.rec) { try { st.rec.mr.stop(); } catch (e) {} st.rec = null; }
        if (st.stream) { st.stream.getTracks().forEach(function (t) { t.stop(); }); st.stream = null; }
        if (orb) orb.deaf();
      }
      function typeInstead(key) {
        typed.hidden = false; send.hidden = false;
        msg.innerHTML = '<p class="cb-warn" role="alert">' + Th(key) + '</p>'; box.focus();
      }
      function recLabel(on) {
        var label = on ? T(canType ? 'chat_stop_review' : 'chat_stop') : T('chat_record');
        $('cb-rec-label').textContent = label; $('cb-rec-ico').innerHTML = on ? ICON.stop : ICON.mic;
        if (canType) rec.title = label;
        rec.setAttribute('aria-pressed', on ? 'true' : 'false'); rec.classList.toggle('cb-live', on);
      }
      function startRec() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { st.micBlocked = true; rec.hidden = true; return typeInstead('chat_type_instead'); }
        hush(); msg.innerHTML = ''; rec.disabled = true;
        var noMic = function () { st.micBlocked = true; rec.disabled = false; rec.hidden = true; typeInstead('chat_type_instead'); };
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
          try { record(stream); } catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); st.stream = null; st.rec = null; if (orb) orb.deaf(); noMic(); }
        }, noMic);
      }
      function record(stream) {
        var type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].filter(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0] || '';
        var mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 24000 } : undefined), chunks = [], t0 = ctx.ms();
        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = function () {
          var live = st.rec && st.rec.mr === mr; st.rec = null; clearTimeout(st.recTimer);
          stream.getTracks().forEach(function (t) { t.stop(); }); st.stream = null; recLabel(false);
          if (orb) { orb.deaf(); orb.set('idle'); }
          if (!live || st.ended) return;
          heardBlob(new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' }), Math.round(ctx.ms() - t0));
        };
        st.stream = stream; st.rec = { mr: mr }; mr.start(1000);
        if (orb) { orb.listen(stream); orb.set('listening'); }
        rec.disabled = false; recLabel(true); send.disabled = true; status.textContent = T('chat_recording');
        st.recTimer = setTimeout(function () { if (st.rec && st.rec.mr === mr) mr.stop(); }, MAX_RECORD_MS);
      }
      function heardBlob(blob, durationMs) {
        if (!blob.size) { setBusy(false); msg.innerHTML = '<p class="cb-warn" role="alert">' + Th('chat_not_heard') + '</p>'; return; }
        setBusy(true, T('chat_transcribing')); orbSet('thinking');
        blobToBase64(blob).then(function (b64) { return ui.call('chat/hear', Object.assign({ data: b64, mime: blob.type, durationMs: durationMs }, where)); }).then(function (r) {
          setBusy(false); orbSet('idle');
          if (r && r.id && String(r.text || '').trim()) {
            st.heard = r.id;
            if (canType) { box.value = r.text; box.focus(); }   // "either": the participant reads it over, then sends
            else sendText(r.text);                               // "voice": it goes straight to the chatbot
            return;
          }
          if (r && r.id) { msg.innerHTML = '<p class="cb-warn" role="alert">' + Th('chat_not_heard') + '</p>'; return; }
          typeInstead('chat_type_instead');
        }, function () { setBusy(false); orbSet('idle'); typeInstead('chat_type_instead'); });
      }
      if (rec) rec.addEventListener('click', function () {
        if (st.rec) { status.textContent = ''; send.disabled = false; try { st.rec.mr.stop(); } catch (e) {} return; }
        if (!st.busy && !st.ended) startRec();
      });

      // ---------- the questions after the conversation ----------
      var submit = $('submit'), tmsg = $('trialmsg');
      var set = ui.questionSet(after, qs, tmsg, submit, function (n, v) { ctx.record(n, v); });
      submit.addEventListener('click', function () {
        if (!st.ended || !set.check()) return;
        submit.disabled = true;
        ctx.submit({ answers: set.answers, rtMs: ctx.ms(), chat: { ended: st.ended, chatMs: Math.round(st.endedAt - st.started), browserVoice: st.browserVoice, audioPlayed: st.audioPlayed,
          micBlocked: st.micBlocked, retries: st.retries, textShown: st.textShown } }, function (err) { submit.disabled = false; tmsg.innerHTML = ui.errorBox(err); });
      });

      // ---------- start ----------
      function begin(aloud) {
        st.started = ctx.ms(); startRow.hidden = true; compose.hidden = false;
        if (call) { $('cb-call').hidden = false; orbSet('idle'); }
        resync().then(function () {
          if (st.ended) return;
          if (aloud && it.opening && st.seq === 0) say('open', it.opening);
          if (!typed.hidden) box.focus(); else if (rec) rec.focus();
        });
      }
      // A chatbot that speaks starts behind a button: browsers only play sound after a click.
      if (it.speak) { startRow.hidden = false; $('cb-start').addEventListener('click', function () { begin(true); }); }
      else begin(false);
    }
  });
})();
