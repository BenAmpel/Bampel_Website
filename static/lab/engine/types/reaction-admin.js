/* Study type "reaction" (Stroop or flanker): the Task tab of the content editor. Loaded by static/lab/engine/admin.js. */
(function () {
  'use strict';
  var DEFAULT_KEYS = { stroop: { red: 'd', green: 'f', blue: 'j', yellow: 'k' }, flanker: { left: 'f', right: 'j' } };
  LabAdmin.registerType('reaction', {
    subtabs: [['task', 'Task']],
    render: function (sub, A) {
      var t = A.draft.task, meta = A.meta().paradigms || {}, vals = (meta[t.paradigm] || {}).values || Object.keys(t.keys || {});
      return '<p class="muted">A choice reaction-time task for a classic interference effect. Each participant gets the same number of congruent and incongruent trials (for Stroop, the word names the ink colour or another colour; for flanker, the outer arrows point the same way as the middle one or the other way), each answer equally often, in a shuffled order. Response times run from the first display frame of the stimulus to the key press. People who cannot use a keyboard can tap the answer buttons, which are recorded as taps.</p>' +
        '<div class="grid3">' + A.field('Task', A.sel('task.paradigm', t.paradigm, Object.keys(meta).map(function (k) { return [k, meta[k].label]; }))) +
        A.field('Trials per session', A.num('task.trialsPerSession', t.trialsPerSession, 4, 400)) + A.field('Practice trials (session 1, with feedback)', A.num('task.practiceTrials', t.practiceTrials, 0, 40)) +
        A.field('Fixation cross (ms)', A.num('task.fixationMs', t.fixationMs, 100, 3000)) + A.field('Response window (ms)', A.num('task.responseMs', t.responseMs, 300, 10000)) + A.field('Pause between trials (ms)', A.num('task.itiMs', t.itiMs, 0, 5000)) +
        A.field('Sessions', '<input type="number" min="1" max="20" data-rtsessions="1" value="' + A.draft.design.sessions.length + '">') + '</div>' +
        A.checkbox('data-path="task.feedbackPractice" data-bool="1"', t.feedbackPractice, 'Practice trials say "Correct" or "Wrong key"') +
        '<h3>Keys</h3><div class="grid3">' + vals.map(function (v) { return A.field('Key for ' + A.esc(v), A.inp('task.keys.' + v, (t.keys || {})[v] || '', ' class="mono" maxlength="1" style="max-width:80px"')); }).join('') + '</div>' +
        '<p class="muted">With 96 trials (48 congruent, 48 incongruent), about 30 participants are typically enough to see the classic Stroop or flanker effect: slower and less accurate answers on incongruent trials. Use the pilot data to check, and ask participants to use a physical keyboard. Stroop needs colour vision; offer the flanker task where that matters.</p>';
    },
    applyEdit: function (t, A) {
      if (t.getAttribute('data-path') === 'task.paradigm') { A.draft.task.paradigm = t.value; A.draft.task.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS[t.value] || {})); return true; }
      if (t.hasAttribute('data-rtsessions')) {
        var n = Math.max(1, Math.min(20, parseInt(t.value, 10) || 1)), s = A.draft.design.sessions;
        while (s.length < n) s.push({ name: 'Session ' + (s.length + 1) });
        s.length = n; return false;
      }
      if (/^task\.keys\./.test(t.getAttribute('data-path') || '')) { A.draft.task.keys[t.getAttribute('data-path').slice(10)] = t.value.trim().toLowerCase(); return false; }
      return undefined;
    }
  });
})();
