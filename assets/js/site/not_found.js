// 404 page: turn the missing address into a search. A mistyped or outdated paper link usually still holds the paper's
// keywords (/conference_publication/vuln-github-isi/ -> "vuln github isi"), so pre-fill the search box with them and
// offer a link that opens site search for them (the ?q= link runs the search on load).
(function () {
  const box = document.querySelector('.universal-wrapper input[name="q"]');
  const stop = new Set(['index', 'html', 'htm', 'php', 'page', 'pages', 'post', 'posts', 'publication', 'publications',
    'conference', 'journal', 'workshop', 'the', 'and', 'for', 'with', 'from', 'pdf']);
  const words = decodeURIComponent(location.pathname)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !stop.has(w));
  const terms = [...new Set(words)].slice(0, 6).join(' ');
  if (!terms) return;
  if (box && !box.value) box.value = terms;
  const p = document.createElement('p');
  const a = document.createElement('a');
  a.href = '/?q=' + encodeURIComponent(terms);
  a.textContent = 'Search the site for “' + terms + '”';
  p.appendChild(a);
  const form = box && box.closest('form');
  if (form) form.insertAdjacentElement('afterend', p);
})();
