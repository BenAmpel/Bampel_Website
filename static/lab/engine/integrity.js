/* CCAIR Behavioral Lab: the Integrity tab (managers and owners). Shows the integrity report from the server
   (netlify/lib/lab/integrity.mjs): for each person, the reasons worth a look in plain words, strong ones first; then
   pairs whose answers or timing line up; then what the report cannot see. The wording is fixed on purpose: "worth a
   look", never "cheating" or "bot", no scores, no ranking by likelihood. Each view is recorded in the activity log. */
(function () {
  'use strict';
  function mountTab(sec, A) {
    var esc = A.esc, includeTest = false, data = null, busy = false;
    function intro(mode) {
      return mode === 'quiz'
        ? '<p class="muted">Reasons worth a look, from how each student answered: pasting, time away from the quiz on a question most of the class missed, answers faster than the question allows, retyping, and pairs of students whose wrong answers or timing line up. A reason is a place to look, not a finding. Look at the replay and talk to the student before deciding anything, and follow the university\'s academic honesty process.</p>'
        : '<p class="muted">Reasons worth a look, from how each participant took the study: signs that software or an AI agent was doing it (automation, input no person made, machine-even typing, answers faster than reading), and pairs whose answers or timing line up (one person taking it twice, or a shared script). A reason is a place to look, not a finding. Decide your exclusion rules before you look, and preregister them.</p>';
    }
    function person(x) {
      var strong = x.reasons.filter(function (r) { return r.level === 'strong'; }), ctx = x.reasons.filter(function (r) { return r.level !== 'strong'; });
      var li = function (r) { return '<li class="int-' + (r.level === 'strong' ? 'strong' : 'ctx') + '">' + (r.level === 'strong' ? '<span class="pill">Strong</span> ' : '') + esc(r.text) + '</li>'; };
      return '<li class="vcard int-person"><div class="row" style="justify-content:space-between;align-items:baseline"><strong class="mono">' + esc(x.name) + '</strong>' +
        '<span class="muted small">' + x.reasons.length + ' reason' + (x.reasons.length === 1 ? '' : 's') + (strong.length ? ', ' + strong.length + ' strong' : '') +
        (x.condition ? ' · ' + esc(x.condition) : '') + (x.test ? ' · test' : '') + (x.finished ? '' : ' · not finished') + (x.extraTime ? ' · extra time ×' + esc(x.extraTime) : '') + '</span></div>' +
        '<ul class="int-reasons">' + strong.concat(ctx).map(li).join('') + '</ul>' +
        '<div class="row">' + '<button type="button" class="secondary small" data-int-replay="' + esc(x.code) + '">Replay</button></div></li>';
    }
    function render() {
      var d = data, h = '<h2>Integrity</h2>' + (d ? intro(d.mode) : '') +
        '<div class="row"><label class="check"><input type="checkbox" id="int-test"' + (includeTest ? ' checked' : '') + '> Include test participants</label>' +
        '<button type="button" class="secondary small" id="int-refresh"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Working…' : 'Refresh') + '</button></div>';
      if (!d) { sec.innerHTML = h + '<p class="muted" role="status">' + (busy ? 'Reading every answer and trace…' : '') + '</p>'; return; }
      var c = d.counts, who = d.mode === 'quiz' ? 'student' : 'participant';
      h += '<p role="status"><strong>' + c.withReasons + '</strong> of ' + c.people + ' ' + who + (c.people === 1 ? '' : 's') + ' have reasons worth a look; <strong>' + c.pairs + '</strong> pair' + (c.pairs === 1 ? '' : 's') + '. ' +
        c.finished + ' finished. <span class="muted">As of ' + esc(new Date(d.generatedAt).toLocaleString()) + '.</span></p>';
      if (d.mode === 'quiz' && c.finished < c.people) h += '<p class="muted">Comparisons with the class (how hard a question was, how fast, shared wrong answers) settle once everyone has finished.</p>';
      h += '<h3>People</h3>' + (d.people.length ? '<ol class="int-list">' + d.people.map(person).join('') + '</ol>' : '<p class="muted">Nobody has a reason worth a look.</p>');
      h += '<h3>Pairs</h3>' + (d.pairsSkipped ? '<p class="muted">Too many people to compare every pair here; use the downloads.</p>'
        : d.pairs.length ? '<ul class="int-list">' + d.pairs.map(function (p) {
          return '<li class="vcard"><strong class="mono">' + esc(p.aName) + '</strong> and <strong class="mono">' + esc(p.bName) + '</strong><ul class="int-reasons">' +
            p.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul><div class="row"><button type="button" class="secondary small" data-int-replay="' + esc(p.a) + '">Replay ' + esc(p.aName) + '</button>' +
            '<button type="button" class="secondary small" data-int-replay="' + esc(p.b) + '">Replay ' + esc(p.bName) + '</button></div></li>';
        }).join('') + '</ul>' : '<p class="muted">No pairs line up.</p>');
      h += '<h3>What this cannot see</h3><ul class="muted">' + d.cannotSee.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      sec.innerHTML = h;
    }
    function load() {
      busy = true; render();
      A.getJSON('integrity' + (includeTest ? '?test=1' : '')).then(function (r) { if (r && r.error) throw new Error(r.error); data = r; })
        .catch(function (e) { A.err(e.message); }).then(function () { busy = false; render(); });
    }
    sec.addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'int-refresh') return load();
      var code = t.getAttribute && t.getAttribute('data-int-replay');
      if (code && A.replay) A.replay(code, t);
    });
    sec.addEventListener('change', function (e) { if (e.target.id === 'int-test') { includeTest = e.target.checked; load(); } });
    load();
  }
  window.LabIntegrity = { mountTab: mountTab };
})();
