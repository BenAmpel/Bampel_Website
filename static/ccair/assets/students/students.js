/* CCAIR Student Guide: dataset catalog search and category filter, and the print button on the printable one-pagers
   (progressive enhancement). Without JavaScript the full list shows and the controls stay hidden. Nothing typed here
   is stored or sent, and no analytics event is recorded. */
(function () {
  'use strict';
  var printBtn = document.querySelector('[data-print]');
  if (printBtn) {
    printBtn.hidden = false;
    printBtn.addEventListener('click', function () { window.print(); });
  }

  var form = document.querySelector('[data-ds-controls]');
  var list = document.getElementById('ds-list');
  if (!form || !list) return;
  var q = document.getElementById('ds-q'), cat = document.getElementById('ds-cat');
  var status = document.getElementById('ds-status'), empty = document.getElementById('ds-empty');
  var items = Array.prototype.slice.call(list.querySelectorAll('.ds'));
  // Search text: everything shown in the entry (name, category, description, caveats, access, license, type, dates).
  var texts = items.map(function (li) { return li.textContent.replace(/\s+/g, ' ').toLowerCase(); });
  var total = items.length;
  var word = function (n) { return n + ' dataset' + (n === 1 ? '' : 's'); };
  var timer;

  function apply() {
    var terms = q.value.toLowerCase().split(/\s+/).filter(Boolean), c = cat.value, shown = 0;
    items.forEach(function (li, i) {
      var text = texts[i];
      var ok = (!c || li.getAttribute('data-cat') === c) && terms.every(function (t) { return text.indexOf(t) !== -1; });
      li.hidden = !ok;
      if (ok) { shown++; li.classList.add('in'); }
    });
    empty.hidden = shown !== 0;
    status.textContent = shown === total ? 'Showing ' + word(total) + '.' : 'Showing ' + shown + ' of ' + word(total) + '.';
  }

  form.hidden = false;
  form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
  q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(apply, 150); });
  cat.addEventListener('change', apply);
})();
