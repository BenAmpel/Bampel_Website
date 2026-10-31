/* Study type "quiz": the Questions tab of the content editor (settings, then one card per question). Loaded by
   static/lab/engine/admin.js. Options are typed one per line and numbered from 1; the right answer is given by
   those numbers, so editing the options never needs a redraw. Move, copy, and remove use the editor's own
   data-move / data-dupq / data-remove buttons on the quiz.items list. */
(function () {
  'use strict';
  function blankAnswer(kind) { return kind === 'multi' ? [] : kind === 'number' ? { value: 0, tolerance: 0 } : null; }
  function slots(items) { var seen = {}, n = 0; items.forEach(function (it) { var k = it.pool ? 'p:' + it.pool : 'i:' + it.id; if (!seen[k]) { seen[k] = 1; n++; } }); return n; }
  function slotPoints(items) { var seen = {}, sum = 0; items.forEach(function (it) { var k = it.pool ? 'p:' + it.pool : 'i:' + it.id; if (!seen[k]) { seen[k] = 1; sum += Number(it.points) || 0; } }); return sum; }
  function answerText(it) {
    if (it.kind === 'single') return it.answer == null ? '' : String(it.answer + 1);
    if (it.kind === 'multi') return (it.answer || []).map(function (a) { return a + 1; }).join(', ');
    return '';
  }

  LabAdmin.registerType('quiz', {
    subtabs: [['quiz', 'Questions']],
    render: function (sub, A) {
      var esc = A.esc, z = A.draft.quiz, items = z.items, kinds = (A.meta().kinds) || { single: 'One answer', multi: 'Several answers', number: 'Number', text: 'Short text (graded by hand)' };
      var h = '<p class="muted">A graded quiz. Students see one question at a time and cannot go back. Answer keys stay on the server and the browser never receives them; scoring happens there, from a copy of each question as the student saw it. Every question also keeps the behavior traces the lab records for any study (time, tab switches, pastes, typing rhythm) for the Participants and Figures tabs.</p>' +
        '<div class="grid3">' + A.field('Time limit in minutes (0 = none)', A.num('quiz.timeLimitMin', z.timeLimitMin, 0, 600)) +
        A.field('Attempts (sessions)', '<input type="number" min="1" max="20" data-qzsessions="1" value="' + A.draft.design.sessions.length + '">') + '</div>' +
        A.checkbox('data-path="quiz.shuffleItems" data-bool="1"', z.shuffleItems, 'Shuffle the order of the questions for each student') +
        A.checkbox('data-path="quiz.shuffleOptions" data-bool="1"', z.shuffleOptions, 'Shuffle the options of each question (a question can keep its order, for example for "All of the above")') +
        '<p class="muted">The clock starts when a student opens the quiz and is kept on the server, so closing the page or changing the computer\'s clock does not stop it. Answers that arrive more than 30 seconds after the limit are kept and marked late, and score 0. ' +
        '<strong>' + items.length + '</strong> question' + (items.length === 1 ? '' : 's') + ' in <strong>' + slots(items) + '</strong> slot' + (slots(items) === 1 ? '' : 's') + ', <strong>' + slotPoints(items) + '</strong> points per student. Questions with the same pool name share one slot: each student gets one of them at random.</p>';
      h += items.map(function (it, i) {
        var b = 'quiz.items.' + i, opts = it.kind === 'single' || it.kind === 'multi';
        return '<div class="vcard"><div class="row" style="justify-content:space-between;align-items:center"><strong>Question ' + (i + 1) + '</strong><span class="row">' +
          A.btn('data-move="quiz.items|' + i + '|-1"', 'Move up', null, i === 0) + A.btn('data-move="quiz.items|' + i + '|1"', 'Move down', null, i === items.length - 1) +
          A.btn('data-dupq="quiz.items|' + i + '"', 'Copy') + A.btn('data-remove="quiz.items|' + i + '"', 'Remove', 'danger secondary') + '</span></div>' +
          '<div class="grid3">' + A.field('ID (column name)', A.inp(b + '.id', it.id, ' class="mono" spellcheck="false"')) +
          A.field('Kind', '<select data-qzkind="' + i + '">' + Object.keys(kinds).map(function (k) { return '<option value="' + k + '"' + (k === it.kind ? ' selected' : '') + '>' + esc(kinds[k]) + '</option>'; }).join('') + '</select>') +
          A.field('Points', '<input type="number" min="0" max="100" step="any" data-path="' + b + '.points" data-num="1" value="' + esc(it.points) + '">') +
          A.field('Pool (optional)', A.inp(b + '.pool', it.pool || '', ' class="mono" spellcheck="false" placeholder="none"')) + '</div>' +
          A.field('Question', A.area(b + '.prompt', it.prompt, 3)) +
          (opts ? A.field('Options, one per line (numbered from 1)', '<textarea data-qzopts="' + i + '" rows="' + Math.max(3, it.options.length + 1) + '">' + esc(it.options.join('\n')) + '</textarea>') +
            '<ol class="muted" style="margin:0 0 8px">' + it.options.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ol>' +
            A.field(it.kind === 'single' ? 'Right option (its number)' : 'Right options (their numbers, separated by commas; all of them and nothing else earns the points)', '<input type="text" class="mono" data-qzans="' + i + '" value="' + esc(answerText(it)) + '" style="max-width:220px">') +
            A.checkbox('data-path="' + b + '.keepOrder" data-bool="1"', it.keepOrder, 'Keep these options in this order') : '') +
          (it.kind === 'number' ? '<div class="grid3">' + A.field('Right number', '<input type="text" class="mono" data-qznum="' + i + '|value" value="' + esc(it.answer ? it.answer.value : '') + '">') +
            A.field('Accept answers within ±', '<input type="text" class="mono" data-qznum="' + i + '|tolerance" value="' + esc(it.answer ? it.answer.tolerance : '') + '">') + '</div>' : '') +
          (it.kind === 'text' ? '<p class="muted">Graded by hand: the answer is in the trials download (column <code>response_text</code>, encrypted when the study has a key), and these points are left out of the automatic score until then.</p>' : '') +
          '</div>';
      }).join('');
      return h + '<div class="row">' + A.btn('data-qzadd="1"', 'Add question') + '</div>';
    },
    applyEdit: function (t, A) {
      var v, items = A.draft.quiz.items;
      if ((v = t.getAttribute('data-qzkind'))) { var it = items[Number(v)]; it.kind = t.value; it.answer = blankAnswer(t.value); if (!Array.isArray(it.options)) it.options = []; return true; }
      if ((v = t.getAttribute('data-qzopts'))) { items[Number(v)].options = t.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean); return false; }
      if ((v = t.getAttribute('data-qzans'))) {
        var q = items[Number(v)], nums = t.value.split(/[\s,;]+/).filter(Boolean).map(function (x) { return parseInt(x, 10) - 1; }).filter(function (x) { return x >= 0; });
        q.answer = q.kind === 'single' ? (nums.length ? nums[0] : null) : nums.filter(function (x, k) { return nums.indexOf(x) === k; }).sort(function (a, b) { return a - b; });
        return false;
      }
      if ((v = t.getAttribute('data-qznum'))) {
        var p = v.split('|'), n = items[Number(p[0])], x = t.value.trim();
        n.answer = n.answer && typeof n.answer === 'object' ? n.answer : { value: 0, tolerance: 0 };
        n.answer[p[1]] = x === '' || !isFinite(Number(x)) ? null : Number(x);
        return false;
      }
      if (t.hasAttribute('data-qzsessions')) {
        var c = Math.max(1, Math.min(20, parseInt(t.value, 10) || 1)), s = A.draft.design.sessions;
        while (s.length < c) s.push({ name: 'Attempt ' + (s.length + 1) });
        s.length = c; return false;
      }
      return undefined;
    },
    click: function (t, A) {
      if (!t.hasAttribute('data-qzadd')) return false;
      var items = A.draft.quiz.items, n = items.length + 1;
      while (items.some(function (x) { return x.id === 'q' + n; })) n++;
      items.push({ id: 'q' + n, kind: 'single', prompt: '', options: [], answer: null, points: 1, pool: '', keepOrder: false });
      return true;
    }
  });
})();
