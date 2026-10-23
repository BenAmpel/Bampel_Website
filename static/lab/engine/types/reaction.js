/* Study type "reaction" (Stroop or flanker): the participant's trial screen. A fixation cross, then the stimulus until
   a key (or a tap on a button) or the end of the response window; in practice, "Correct" or "Wrong key". The response
   time runs from the first display frame showing the stimulus (requestAnimationFrame) to the key's event time, both
   on the performance.now() clock. Server side: netlify/lib/lab/types/reaction.mjs. */
(function () {
  'use strict';
  var COLORS = { red: '#d62828', green: '#2a9d3f', blue: '#1d6fd1', yellow: '#c99a00' };
  var ARROW = { left: '←', right: '→' };
  function label(task, v) { return task.paradigm === 'flanker' ? (v === 'left' ? 'Left' : 'Right') : v.charAt(0).toUpperCase() + v.slice(1); }
  function values(task) { return Object.keys(task.keys); }
  function keysHtml(task, ui) {
    return '<div class="rt-keys" role="group" aria-label="Answers">' + values(task).map(function (v) {
      return '<button type="button" class="secondary rt-key" data-v="' + ui.esc(v) + '"><kbd>' + ui.esc(task.keys[v].toUpperCase()) + '</kbd> ' + ui.esc(label(task, v)) + '</button>';
    }).join('') + '</div><p class="muted help">' + ui.Th('rt_buttons_note') + '</p>';
  }
  LabEngine.registerType('reaction', {
    instructions: function (plan, ui) {
      var t = plan.task;
      var what = t.paradigm === 'flanker' ? '<p>A row of arrows appears. Press the key for the direction of the <strong>middle</strong> arrow and ignore the others.</p>'
        : '<p>A colour word appears in coloured ink. Press the key for the <strong>ink colour</strong> and ignore what the word says.</p>';
      var keys = '<ul class="rt-legend">' + values(t).map(function (v) {
        return '<li><kbd>' + ui.esc(t.keys[v].toUpperCase()) + '</kbd> ' + (t.paradigm === 'stroop' ? '<span class="rt-swatch" style="background:' + COLORS[v] + '"></span>' : '') + ui.esc(label(t, v)) + '</li>';
      }).join('') + '</ul>';
      var practice = plan.trials.some(function (x) { return x.stim.practice && !x.done; }) ? ui.Tp('rt_practice_note') : '';
      return what + keys + practice;
    },
    runTrial: function (ctx, ui) {
      var t = ctx.plan.task, s = ctx.trial.stim, onset = null, done = false, timer = null;
      ui.show('<div class="rt-stage" aria-hidden="true"><span class="rt-fix">+</span></div>' + keysHtml(t, ui) + '<div id="rtmsg"></div>');
      var stageEl = document.querySelector('.rt-stage'), byKey = {};
      values(t).forEach(function (v) { byKey[t.keys[v]] = v; });
      function finish(response, key, via, at, timedOut) {
        if (done) return; done = true;
        clearTimeout(timer); document.removeEventListener('keydown', onKey, true);
        var rt = !timedOut && onset != null ? at - onset : null;
        var fb = s.practice && t.feedbackPractice ? (timedOut ? ui.T('rt_too_slow') : response === s.target ? ui.T('rt_correct') : ui.T('rt_wrong')) : timedOut ? ui.T('rt_too_slow') : '';
        stageEl.innerHTML = fb ? '<span class="rt-fb">' + ui.esc(fb) + '</span>' : '';
        setTimeout(function () {
          stageEl.innerHTML = '';
          setTimeout(function () {
            ctx.submit({ response: response, key: key, rtMs: rt, timedOut: !!timedOut, via: via }, function (msg) { document.getElementById('rtmsg').innerHTML = ui.errorBox(msg); });
          }, t.itiMs);
        }, fb ? 700 : 0);
      }
      function onKey(e) {
        if (onset == null || e.repeat) return;
        var k = String(e.key || '').toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(byKey, k)) return;
        e.preventDefault();
        finish(byKey[k], k, 'key', e.timeStamp || performance.now(), false);
      }
      document.querySelectorAll('.rt-key').forEach(function (b) {
        b.addEventListener('click', function (e) { if (onset != null) finish(b.getAttribute('data-v'), '', 'tap', e.timeStamp || performance.now(), false); });
      });
      document.addEventListener('keydown', onKey, true);
      setTimeout(function () {
        stageEl.innerHTML = t.paradigm === 'flanker'
          ? '<span class="rt-arrows">' + [s.flank, s.flank, s.target, s.flank, s.flank].map(function (d) { return ARROW[d]; }).join(' ') + '</span>'
          : '<span class="rt-word" style="color:' + COLORS[s.target] + '">' + ui.esc(String(s.word).toUpperCase()) + '</span>';
        requestAnimationFrame(function (ts) { onset = ts; });   // the first frame that shows the stimulus
        ctx.markOnset();
        timer = setTimeout(function () { finish(null, '', 'key', performance.now(), true); }, t.responseMs);
      }, t.fixationMs);
    }
  });
})();
