/* Study type "vignettes": item screen. A scenario as plain text or as an email (optionally with an
   image), followed by the study's questions. Links written as [text](url) are shown as links that do not
   navigate; pointing at one shows its address at the bottom of the screen, like a mail client, and the
   hover and click are recorded (TraceLab target "link:<url>").
   Server side: netlify/lib/lab/types/vignettes.mjs. */
(function () {
  'use strict';
  function body(text, esc) {
    return String(text || '').split(/\n\s*\n/).map(function (para) {
      var out = '', last = 0, re = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g, m;
      while ((m = re.exec(para))) {
        out += esc(para.slice(last, m.index)).replace(/\n/g, '<br>') +
          '<span class="vg-link" role="link" tabindex="0" data-url="' + esc(m[2]) + '" data-trace="link:' + esc(m[2]) + '">' + esc(m[1]) + '</span>';
        last = re.lastIndex;
      }
      return '<p>' + out + esc(para.slice(last)).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  LabEngine.registerType('vignettes', {
    runTrial: function (ctx, ui) {
      var esc = ui.esc, Th = ui.Th, it = ctx.trial.item, qs = ctx.plan.questions || [];
      var head = it.kind === 'email'
        ? '<div class="mail-head"><div><span class="muted">' + Th('email_from') + ':</span> ' + esc(it.from) + '</div><div><span class="muted">' + Th('email_subject') + ':</span> <strong>' + esc(it.subject) + '</strong></div></div>'
        : '';
      var img = it.image ? '<img src="' + esc(it.image) + '" alt="' + esc(it.imageAlt || '') + '" data-trace="image">' : '';
      ui.show('<h2>' + esc(it.title) + '</h2><div class="vg-item vg-' + esc(it.kind) + '" data-trace="item">' + head + img + '<div class="vg-body mail-body">' + body(it.body, esc) + '</div></div>' +
        qs.map(ui.questionHtml).join('') + '<div id="trialmsg"></div><div class="actions"><button id="submit">' + Th(ctx.isPractice ? 'practice_submit' : 'submit_button') + '</button></div>' +
        '<div class="statusbar" id="statusbar" aria-hidden="true"></div>');

      var bar = document.getElementById('statusbar');
      ui.stage.querySelectorAll('.vg-link').forEach(function (a) {
        var on = function () { bar.textContent = ui.T('link_status', { url: a.getAttribute('data-url') }); bar.classList.add('show'); };
        var off = function () { bar.classList.remove('show'); };
        a.addEventListener('mouseenter', on); a.addEventListener('focus', on);
        a.addEventListener('mouseleave', off); a.addEventListener('blur', off);
        a.addEventListener('click', function (e) { e.preventDefault(); });   // recorded by TraceLab as a click on "link:<url>"
      });

      var submit = document.getElementById('submit'), msg = document.getElementById('trialmsg');
      var set = ui.questionSet(ui.stage, qs, msg, submit, function (n, v) { ctx.record(n, v); });
      submit.addEventListener('click', function () {
        if (!set.check()) return;
        submit.disabled = true; bar.classList.remove('show');
        ctx.submit({ answers: set.answers, rtMs: ctx.ms() }, function (err) { submit.disabled = false; msg.innerHTML = ui.errorBox(err); });
      });
    }
  });
})();
