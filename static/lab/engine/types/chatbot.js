/* Study type "chatbot": the conversation screen. The participant types or records messages to an AI chatbot, the
   reply comes back from the server (which holds the chatbot's instruction; this page never sees it), and after the
   conversation the study's questions appear. A reload restores the conversation from the server. Recordings are
   sent to be turned into text and are not kept. The chatbot's messages can be played aloud; when the voice service
   does not answer, the browser's own voice reads them.
   Server side: netlify/lib/lab/types/chatbot.mjs. */
(function () {
  'use strict';
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/lab/engine/types/chatbot.css'; document.head.appendChild(css);
  var MAX_RECORD_MS = 60000;

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
      var st = { seq: 0, busy: false, ended: null, started: 0, lastBotAt: 0, heard: null, playing: null, rec: null, recTimer: null, stream: null,
        browserVoice: 0, audioPlayed: 0, micBlocked: false, retries: 0 };

      ui.show('<div class="cb-scenario" data-trace="scenario">' + paras(it.scenario, esc) + '</div>' +
        '<p class="cb-note">' + Th('chat_ai_note', { bot: it.botName }) + '</p>' +
        '<div class="cb-log" id="cb-log" role="log" aria-live="polite" aria-label="' + esc(it.botName) + '" tabindex="0"></div>' +
        '<p class="cb-status muted" id="cb-status" role="status"></p>' +
        '<div class="cb-compose" id="cb-compose" hidden>' +
          '<div id="cb-typed"' + (canType ? '' : ' hidden') + '><label for="cb-text">' + Th('chat_label') + '</label><textarea id="cb-text" rows="3" maxlength="1500" data-trace="chat-text"></textarea></div>' +
          '<p class="cb-hint muted" id="cb-hint"></p>' +
          '<div class="actions cb-actions">' +
            '<button type="button" class="secondary" id="cb-end" hidden>' + Th('chat_end') + '</button>' +
            (canTalk ? '<button type="button" class="' + (canType ? 'secondary' : '') + '" id="cb-rec" aria-pressed="false">' + Th('chat_record') + '</button>' : '') +
            '<button type="button" id="cb-send"' + (canType ? '' : ' hidden') + '>' + Th('chat_send') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="actions" id="cb-startrow" hidden><button type="button" id="cb-start">' + Th('chat_start') + '</button></div>' +
        '<div id="cb-msg"></div>' +
        '<div id="cb-after" hidden><h3 id="cb-after-h" tabindex="-1">' + Th('chat_after') + '</h3>' + ui.questionsHtml(qs) +
          '<div id="trialmsg"></div><div class="actions"><button type="button" id="submit">' + Th('submit_button') + '</button></div></div>');

      var $ = function (id) { return document.getElementById(id); };
      var log = $('cb-log'), status = $('cb-status'), compose = $('cb-compose'), typed = $('cb-typed'), box = $('cb-text'), hint = $('cb-hint'),
        send = $('cb-send'), rec = $('cb-rec'), endBtn = $('cb-end'), msg = $('cb-msg'), after = $('cb-after'), startRow = $('cb-startrow');

      // ---------- the transcript on screen ----------
      function bubble(who, text) {
        var d = document.createElement('div'); d.className = 'cb-turn cb-' + who;
        d.innerHTML = '<span class="cb-who">' + (who === 'bot' ? esc(it.botName) : Th('chat_you')) + '</span><div class="cb-text">' + paras(text, esc) + '</div>';
        log.appendChild(d); log.scrollTop = log.scrollHeight;
        return d;
      }
      function counter() {
        var left = st.safety ? 0 : it.minTurns - st.seq;   // after the crisis message nobody is asked to keep talking
        hint.textContent = T('chat_turns', { i: Math.min(st.seq + 1, it.maxTurns), n: it.maxTurns }) + (left > 0 ? ' ' + T('chat_min', { n: left }) : '');
        endBtn.hidden = left > 0;
      }
      function setBusy(on, text) {
        st.busy = on; send.disabled = on; if (rec) rec.disabled = on; endBtn.disabled = on; box.readOnly = on;
        status.textContent = text || '';
      }

      // ---------- the chatbot's voice ----------
      function hush() {
        if (st.playing) { try { st.playing.pause(); } catch (e) {} st.playing = null; }
        if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) {} }
      }
      function browserSay(text) {
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
        st.browserVoice++; try { speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } catch (e) {}
      }
      function say(seq, text) {
        if (!it.speak || !text) return;
        ui.call('chat/voice', Object.assign({ seq: seq }, where)).then(function (r) {
          if (st.ended || st.rec) return;   // never talk over a recording or the questions
          if (!r || !r.audio) return browserSay(text);
          hush();
          var a = new Audio(r.audio); st.playing = a;
          a.onended = function () { if (st.playing === a) st.playing = null; };
          a.play().then(function () { st.audioPlayed++; }, function () { st.playing = null; browserSay(text); });
        }, function () { browserSay(text); });
      }
      function botSays(seq, text, aloud) { bubble('bot', text); st.lastBotAt = ctx.ms(); if (aloud) say(seq, text); }

      // ---------- sending a message ----------
      function finish(why) {
        if (st.ended) return;
        st.ended = why; st.endedAt = ctx.ms(); hush(); stopMic();
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
          log.innerHTML = ''; if (it.opening) bubble('bot', it.opening);
          r.turns.forEach(function (t) { bubble('user', t.user); bubble('bot', t.bot); });
          st.seq = r.turns.length; st.safety = r.turns.some(function (t) { return t.safety; }); st.lastBotAt = ctx.ms(); counter();
          if (r.on && !r.on.chat) stuck('chat_off');
          if (st.seq >= it.maxTurns) finish('max');
        });
      }
      function sendText(text) {
        text = String(text || '').replace(/\s+/g, ' ').trim();
        if (!text || st.busy || st.ended) return;
        hush(); msg.innerHTML = ''; setBusy(true, T('chat_thinking', { bot: it.botName }));
        var seq = st.seq, heard = st.heard;
        ui.call('chat/turn', Object.assign({ seq: seq, text: text, heard: heard || undefined, sinceMs: Math.round(ctx.ms() - st.lastBotAt) }, where)).then(function (r) {
          setBusy(false);
          if (r && typeof r.bot === 'string') {
            st.heard = null; box.value = ''; st.seq = seq + 1; st.fails = 0; if (r.safety) st.safety = true;
            bubble('user', r.user); botSays(seq, r.bot, true);
            ctx.record('chat_turn', String(st.seq)); counter();
            if (r.done) return finish('max');
            if (!typed.hidden) box.focus(); else if (rec) rec.focus();
            return;
          }
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

      // ---------- recording a message ----------
      function stopMic() {
        clearTimeout(st.recTimer);
        if (st.rec) { try { st.rec.mr.stop(); } catch (e) {} st.rec = null; }
        if (st.stream) { st.stream.getTracks().forEach(function (t) { t.stop(); }); st.stream = null; }
      }
      function typeInstead(key) {
        typed.hidden = false; send.hidden = false;
        msg.innerHTML = '<p class="cb-warn" role="alert">' + Th(key) + '</p>'; box.focus();
      }
      function recLabel(on) {
        rec.textContent = on ? T(canType ? 'chat_stop_review' : 'chat_stop') : T('chat_record');
        rec.setAttribute('aria-pressed', on ? 'true' : 'false'); rec.classList.toggle('cb-live', on);
      }
      function startRec() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { st.micBlocked = true; rec.hidden = true; return typeInstead('chat_type_instead'); }
        hush(); msg.innerHTML = ''; rec.disabled = true;
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
          var type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].filter(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0] || '';
          var mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 24000 } : undefined), chunks = [], t0 = ctx.ms();
          mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          mr.onstop = function () {
            var live = st.rec && st.rec.mr === mr; st.rec = null; clearTimeout(st.recTimer);
            stream.getTracks().forEach(function (t) { t.stop(); }); st.stream = null; recLabel(false);
            if (!live || st.ended) return;
            heardBlob(new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' }), Math.round(ctx.ms() - t0));
          };
          st.stream = stream; st.rec = { mr: mr }; mr.start(1000);
          rec.disabled = false; recLabel(true); send.disabled = true; status.textContent = T('chat_recording');
          st.recTimer = setTimeout(function () { if (st.rec && st.rec.mr === mr) mr.stop(); }, MAX_RECORD_MS);
        }, function () { st.micBlocked = true; rec.disabled = false; rec.hidden = true; typeInstead('chat_type_instead'); });
      }
      function heardBlob(blob, durationMs) {
        if (!blob.size) { setBusy(false); msg.innerHTML = '<p class="cb-warn" role="alert">' + Th('chat_not_heard') + '</p>'; return; }
        setBusy(true, T('chat_transcribing'));
        blobToBase64(blob).then(function (b64) { return ui.call('chat/hear', Object.assign({ data: b64, mime: blob.type, durationMs: durationMs }, where)); }).then(function (r) {
          setBusy(false);
          if (r && r.id && String(r.text || '').trim()) {
            st.heard = r.id;
            if (canType) { box.value = r.text; box.focus(); }   // "either": the participant reads it over, then sends
            else sendText(r.text);                               // "voice": it goes straight to the chatbot
            return;
          }
          if (r && r.id) { msg.innerHTML = '<p class="cb-warn" role="alert">' + Th('chat_not_heard') + '</p>'; return; }
          typeInstead('chat_type_instead');
        }, function () { setBusy(false); typeInstead('chat_type_instead'); });
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
          micBlocked: st.micBlocked, retries: st.retries } }, function (err) { submit.disabled = false; tmsg.innerHTML = ui.errorBox(err); });
      });

      // ---------- start ----------
      function begin(aloud) {
        st.started = ctx.ms(); startRow.hidden = true; compose.hidden = false;
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
