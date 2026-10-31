/* Study type "quiz": the question screen. One question per screen, answered with radios, checkboxes, a number box,
   or a text box; Next saves it (answers are final). The clock counts down from what the server says is left, so a
   reload or a wrong computer clock cannot add time; when it reaches zero the current answer is sent and every
   question left is sent empty, marked timed out. The answer key never reaches this page.
   Server side: netlify/lib/lab/types/quiz.mjs. */
(function () {
  'use strict';
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/lab/engine/types/quiz.css'; document.head.appendChild(css);

  function paras(text, esc) {
    return String(text || '').split(/\n\s*\n/).map(function (p) { return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  // The deadline on this page's performance.now() clock, from the time left the server reported with the plan.
  function deadline(plan) {
    if (!plan.quiz || !plan.quiz.limitMs || plan.quiz.remainingMs == null) return null;
    if (plan._qzDeadline == null) plan._qzDeadline = performance.now() + plan.quiz.remainingMs;
    return plan._qzDeadline;
  }

  LabEngine.registerType('quiz', {
    instructions: function (plan, ui) {
      var z = plan.quiz || {}, out = ui.Tp('quiz_final_note');
      if (z.limitMs) out += ui.Tp('quiz_time_note', { minutes: Math.round(z.limitMs / 60000 * 10) / 10 });
      return out;
    },
    runTrial: function (ctx, ui) {
      var esc = ui.esc, q = ctx.trial.q, plan = ctx.plan, end = deadline(plan), done = false, warned = false, ticker = null;
      var left = plan.trials.filter(function (x) { return !x.done; }).length, last = left <= 1;
      function send(fields, timedOut) {
        if (done) return; done = true;
        clearInterval(ticker);
        fields.rtMs = ctx.ms(); fields.timedOut = !!timedOut;
        var btn = document.getElementById('qznext'); if (btn) btn.disabled = true;
        ctx.submit(fields, function (msg) {
          done = false; if (btn) btn.disabled = false;
          document.getElementById('qzmsg').innerHTML = ui.errorBox(msg);
          if (timedOut) setTimeout(function () { send(fields, true); }, 3000);   // time is up: keep trying, there is nothing to answer
        });
      }
      // Time already up (a reload after the limit, or the questions after the one that ran out): send it empty.
      if (end != null && performance.now() >= end) {
        ui.show('<h2>' + ui.Th('quiz_time_up') + '</h2><div id="qzmsg"></div>');
        return send({}, true);
      }

      var input;
      if (q.kind === 'single' || q.kind === 'multi') {
        input = '<p class="qz-hint" id="qzhint">' + ui.Th(q.kind === 'single' ? 'quiz_choose_one' : 'quiz_choose_all') + '</p><div class="options">' + q.options.map(function (o, i) {
          var id = ui.nextId('qo');
          return '<label class="option" for="' + id + '" data-trace="option:' + i + '"><input type="' + (q.kind === 'single' ? 'radio' : 'checkbox') + '" name="qz" value="' + i + '" id="' + id + '"><span>' + esc(o) + '</span></label>';
        }).join('') + '</div>';
        // The group is named by the question on screen (aria-labelledby), so a screen reader does not read it twice.
        input = '<fieldset class="q-group" aria-labelledby="qzprompt" aria-describedby="qzhint">' + input + '</fieldset>';
      } else if (q.kind === 'number') {
        input = '<div class="q-group"><label class="q" for="qzin">' + ui.Th('quiz_number_hint') + '</label><input id="qzin" class="qz-number" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-trace="answer"></div>';
      } else {
        input = '<div class="q-group"><textarea id="qzin" class="qz-text" maxlength="5000" rows="6" aria-labelledby="qzprompt" data-trace="answer"></textarea></div>';
      }
      ui.show('<div class="qz-bar"><span class="qz-points">' + (q.points === 1 ? ui.Th('quiz_point_one') : ui.Th('quiz_points', { points: q.points })) + '</span>' +
        (end != null ? '<span class="qz-clock" id="qzclock" aria-hidden="true"></span>' : '') + '</div>' +
        '<h2 class="sr">' + ui.Th('progress_trial', { i: plan.total - left + 1, n: plan.total, session: plan.session }) + '</h2>' +
        '<div id="qzbody"><div class="qz-prompt" id="qzprompt" data-trace="item">' + paras(q.prompt, esc) + '</div>' + input + '</div>' +
        '<div id="qzmsg"></div><div class="actions"><button id="qznext">' + ui.Th(last ? 'quiz_last' : 'quiz_next') + '</button></div>' +
        '<p class="sr" id="qzlive" aria-live="polite"></p>');

      function value() {
        if (q.kind === 'single') { var r = ui.stage.querySelector('input[name="qz"]:checked'); return r ? { choice: Number(r.value) } : null; }
        if (q.kind === 'multi') { var c = [].map.call(ui.stage.querySelectorAll('input[name="qz"]:checked'), function (x) { return Number(x.value); }); return c.length ? { choices: c } : null; }
        var v = document.getElementById('qzin').value;
        if (!v.trim()) return null;
        return q.kind === 'number' ? { number: v.trim() } : { text: v };
      }
      // The answer as it changes, for TraceLab's first-answer time and answer changes.
      // (On this question's own element: the stage stays the same from question to question, so a listener there would pile up.)
      document.getElementById('qzbody').addEventListener('change', function () { var v = value(); ctx.record('answer', v ? JSON.stringify(v).slice(0, 300) : ''); });

      var msg = document.getElementById('qzmsg');
      document.getElementById('qznext').addEventListener('click', function () {
        var v = value();
        if (v && q.kind === 'number' && !isFinite(Number(v.number))) { msg.innerHTML = ui.errorBox('Type a number, like 12.5 or -3.'); document.getElementById('qzin').focus(); return; }
        if (!v && !warned) { warned = true; msg.innerHTML = '<p class="qz-note" role="alert">' + ui.Th('quiz_skip_confirm') + '</p>'; return; }
        send(v || {}, false);
      });

      if (end != null) {
        var el = document.getElementById('qzclock'), live = document.getElementById('qzlive'), prev = Infinity;
        var tick = function () {
          var ms = end - performance.now();
          el.textContent = ui.T('quiz_left', { time: clock(ms) });
          el.classList.toggle('low', ms <= 60000);
          // Screen readers hear the time as it passes 5 minutes and 1 minute left, not every second.
          if ([300000, 60000].some(function (at) { return ms <= at && prev > at; }) && prev !== Infinity) live.textContent = ui.T('quiz_left', { time: clock(ms) });
          prev = ms;
          if (ms <= 0) { msg.innerHTML = '<p class="qz-note" role="alert">' + ui.Th('quiz_time_up') + '</p>'; send(value() || {}, true); }
        };
        tick(); ticker = setInterval(tick, 1000);
      }
    }
  });
})();
