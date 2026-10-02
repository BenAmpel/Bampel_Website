/* Study type "alert-triage": item screen. A security alert with click-to-reveal evidence tabs, optional
   AI advice (shown first, or after an initial answer), a judgment, confidence, and what influenced it.
   Server side: netlify/lib/lab/types/alert-triage.mjs. Ground truth never reaches the browser. */
(function () {
  'use strict';
  LabEngine.registerType('alert-triage', {
    instructions: function (p, ui) {
      var how = p.mode === 'ai_first' ? 'instr_ai_first' : p.mode === 'evidence_first' ? 'instr_evidence_first' : p.aiRemoved ? 'instr_ai_removed' : 'instr_none';
      return ui.Tp(how) + ui.Tp('instr_outro');
    },

    runTrial: function (ctx, ui) {
      var esc = ui.esc, Th = ui.Th, T = ui.T, p = ctx.plan, stage = ui.stage;
      var alert = ctx.trial.alert, ai = ctx.trial.ai, mode = ai ? p.mode : 'none';
      var opens = [], openNow = null, aiShownAtMs = null, answers = {}, initial = null;

      // AI advice looks the same in every AI condition: same box, wording, and neutral styling; only its
      // timing differs (Buçinca et al. 2021; Fogliato et al. 2022).
      function aiBox() {
        if (!ai) return '';
        var v = ai.verdict === 'malicious' ? Th('label_malicious') : Th('label_benign');
        return '<section class="ai-box" data-trace="ai_box" aria-label="' + Th('ai_label') + '"><div class="label">' + Th('ai_label') + '</div><div class="verdict">' + v + ' · ' + Th('ai_confidence', { confidence: ai.confidence }) + '</div><p>' + esc(ai.rationale) + '</p></section>';
      }
      var aiAtTop = mode === 'ai_first' && ai, twoStep = mode === 'evidence_first' && ai;
      // Answer order is fixed per participant and counterbalanced across participants (server-assigned).
      var answerOpts = (p.answerOrder || ['malicious', 'benign']).map(function (v) { return [v, Th(v === 'malicious' ? 'label_malicious' : 'label_benign')]; });

      // Evidence: click-to-reveal tabs (manual activation), one open at a time, order fixed per participant.
      ui.show('<div class="alert-head"><h2>' + esc(alert.title) + '</h2><span class="sev">' + Th('severity_label') + ': ' + esc(alert.severity) + '</span></div>' +
        '<p class="summary" data-trace="summary">' + esc(alert.summary) + '</p>' + (aiAtTop ? aiBox() : '') +
        '<div class="evidence"><div class="tabs" role="tablist" aria-label="Evidence">' + alert.panels.map(function (x, i) {
          return '<button type="button" role="tab" id="tab-' + i + '" aria-selected="false" aria-controls="pbody" tabindex="' + (i ? -1 : 0) + '" data-panel="' + esc(x.key) + '" data-trace="tab:' + esc(x.key) + '">' + esc(x.label) + '</button>';
        }).join('') + '</div><div class="panel-body" id="pbody" role="tabpanel" tabindex="0" data-trace="panel_body"><p class="placeholder">' + Th('evidence_placeholder') + '</p></div></div>' +
        (twoStep ? '<div class="step" id="step1">' + ui.choiceGroup('initial_judgment', Th('q_initial'), answerOpts, 'initial') + ui.vas('initial_confidence', Th('q_initial_conf')) +
          '<div class="actions"><button id="lock">' + Th('lock_button') + '</button></div></div><div id="step2" hidden></div>' : '<div class="step" id="step2"></div>'));

      var pbody = document.getElementById('pbody'), tabs = Array.prototype.slice.call(stage.querySelectorAll('[role=tab]'));
      function closePanel() {
        if (!openNow) return;
        if (openNow.hiddenAt != null) { openNow.hiddenMs += ctx.ms() - openNow.hiddenAt; openNow.hiddenAt = null; }
        openNow.dwellMs = Math.max(0, ctx.ms() - openNow.atMs - openNow.hiddenMs);   // time on screen, excluding a hidden tab
        openNow.afterAI = aiShownAtMs != null && openNow.atMs >= aiShownAtMs; delete openNow.hiddenAt; openNow = null;
      }
      function onVis() { if (!openNow) return; if (document.hidden) openNow.hiddenAt = ctx.ms(); else if (openNow.hiddenAt != null) { openNow.hiddenMs += ctx.ms() - openNow.hiddenAt; openNow.hiddenAt = null; } }
      document.addEventListener('visibilitychange', onVis);
      function openTab(b) {
        var key = b.getAttribute('data-panel');
        if (openNow && openNow.panel === key) return;
        closePanel();
        tabs.forEach(function (x) { var on = x === b; x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
        var panel = alert.panels.filter(function (x) { return x.key === key; })[0];
        pbody.setAttribute('aria-labelledby', b.id);
        pbody.innerHTML = '<p>' + esc(panel.text) + '</p>';
        openNow = { panel: key, atMs: ctx.ms(), hiddenMs: 0, hiddenAt: null }; opens.push(openNow);
      }
      tabs.forEach(function (b, i) {
        b.addEventListener('click', function () { openTab(b); });
        // Arrow keys move between tabs; Enter/Space opens (manual activation keeps reveals deliberate).
        b.addEventListener('keydown', function (e) {
          var j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
          if (j == null) return;
          e.preventDefault(); j = (j + tabs.length) % tabs.length; tabs[j].focus();
        });
      });

      function finalBlock() {
        var opts = alert.panels.map(function (x) { return [x.key, esc(x.label)]; }).concat([['summary', Th('infl_summary')]]).concat(ai ? [['ai', Th('infl_ai')]] : []);
        return ui.choiceGroup('final_judgment', Th(twoStep ? 'q_final_two' : 'q_final'), answerOpts, 'final') + ui.vas('final_confidence', Th('q_conf')) +
          '<fieldset class="q-group" data-name="influential"><legend class="q">' + Th('q_influence') + '</legend><div class="checks">' +
          opts.map(function (o) { return '<label class="option" data-trace="infl:' + esc(o[0]) + '"><input type="checkbox" name="influential" value="' + esc(o[0]) + '"><span>' + o[1] + '</span></label>'; }).join('') + '</div></fieldset>' +
          '<div id="trialmsg"></div><div class="actions"><button id="submit">' + Th(ctx.isPractice ? 'practice_submit' : 'submit_button') + '</button></div>';
      }
      if (aiAtTop) aiShownAtMs = 0;
      function record(n, v) { answers[n] = v; ctx.record(n, v); }

      function mountFinal() {
        var step2 = document.getElementById('step2'), need = ['final_judgment', 'final_confidence', 'influential'];
        step2.hidden = false;
        step2.innerHTML = (twoStep ? aiBox() : '') + finalBlock();
        ui.wire(step2, function (n, v) {
          record(n, v);
          if (step2.querySelector('.missing')) { var m = ui.blank(answers, need); ui.flag(step2, m); if (!m.length) document.getElementById('trialmsg').innerHTML = ''; }
        });
        var submit = document.getElementById('submit'), msg = document.getElementById('trialmsg');
        // Trial answers are required (they are the task). The button explains what is missing rather than
        // sitting disabled (WCAG 3.3.1).
        submit.addEventListener('click', function () {
          var miss = ui.blank(answers, need);
          if (miss.length) { ui.flag(step2, miss, true); msg.innerHTML = ui.errorBox(miss.length === 1 && miss[0] === 'final_confidence' ? T('conf_needed') : T('required_prompt')); return; }
          msg.innerHTML = ''; submit.disabled = true; closePanel(); document.removeEventListener('visibilitychange', onVis);
          ctx.submit({
            mode: mode, aiShownAtMs: aiShownAtMs, initial: initial,
            final: { judgment: answers.final_judgment, confidence: answers.final_confidence, influential: answers.influential, rtMs: ctx.ms() },
            evidence: { opens: opens }
          }, function (err) { submit.disabled = false; document.addEventListener('visibilitychange', onVis); msg.innerHTML = ui.errorBox(err); });
        });
      }

      if (!twoStep) return mountFinal();
      var step1 = document.getElementById('step1'), lock = document.getElementById('lock'), need1 = ['initial_judgment', 'initial_confidence'];
      ui.wire(step1, function (n, v) {
        record(n, v);
        if (step1.querySelector('.missing')) { var m = ui.blank(answers, need1); ui.flag(step1, m); if (!m.length) { var e = step1.querySelector('.error'); if (e) e.remove(); } }
      });
      lock.addEventListener('click', function () {
        var miss = ui.blank(answers, need1);
        if (miss.length) { ui.flag(step1, miss, true); if (!step1.querySelector('.error')) lock.parentNode.insertAdjacentHTML('beforebegin', ui.errorBox(T('required_prompt'))); return; }
        initial = { judgment: answers.initial_judgment, confidence: answers.initial_confidence, rtMs: ctx.ms() };
        step1.classList.add('locked');
        step1.querySelectorAll('input').forEach(function (x) { x.disabled = true; });
        step1.querySelectorAll('.vas').forEach(function (x) { x.setAttribute('aria-disabled', 'true'); x.tabIndex = -1; });
        var err = step1.querySelector('.error'); if (err) err.remove();
        lock.parentNode.remove();
        aiShownAtMs = ctx.ms(); ctx.record('ai_shown', true);
        mountFinal();
        var s2 = document.getElementById('step2');
        s2.scrollIntoView({ behavior: ui.reduceMotion ? 'auto' : 'smooth', block: 'start' });
        var box = s2.querySelector('.ai-box'); if (box) { box.setAttribute('tabindex', '-1'); box.focus({ preventScroll: true }); }
      });
    }
  });
})();
