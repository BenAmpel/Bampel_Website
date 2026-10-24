/* Moved out of layouts/shortcodes/selected_publications.html so the site CSP can drop script-src 'unsafe-inline'. */
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var PRESTIGE_VENUES = {
    'MIS Quarterly': ['FT50', 'UTD24'],
    'Journal of Management Information Systems': ['FT50']
  };

  function badgesFor(pub) {
    var chips = (PRESTIGE_VENUES[pub.venue] || []).map(function (b) {
      var title = b === 'FT50' ? 'Financial Times Top 50 journal' : 'UT Dallas Top 24 journal';
      return '<span class="pub-badge pub-badge--' + b.toLowerCase() + '" title="' + title + '">' + b + '</span>';
    });
    if (pub.award) {
      chips.push('<span class="pub-badge pub-badge--award" title="' + esc(pub.award) + '"><i class="fas fa-trophy" aria-hidden="true"></i> ' + esc(pub.award) + '</span>');
    }
    return chips.length ? '<span class="pub-badges">' + chips.join('') + '</span>' : '';
  }

  function render(pubs) {
    var featured = pubs.filter(function (p) { return p.featured; });
    if (!featured.length) return;

    featured.sort(function (a, b) {
      var typeDiff = (a.type === 'journal' ? 0 : 1) - (b.type === 'journal' ? 0 : 1);
      if (typeDiff !== 0) return typeDiff;
      return (b.year || 0) - (a.year || 0);
    });

    var list = document.getElementById('selected-pubs-list');
    var wrap = document.getElementById('selected-pubs');
    if (!list || !wrap) return;

    list.innerHTML = featured.slice(0, 6).map(function (pub) {
      var authors = Array.isArray(pub.authors) ? pub.authors.join(', ') : '';
      var meta = [pub.year, pub.venue].filter(Boolean).join(' · ');
      var title = pub.url
        ? '<a href="' + esc(pub.url) + '" class="pub-title">' + esc(pub.title) + '</a>'
        : '<span class="pub-title">' + esc(pub.title) + '</span>';
      return '<div class="pub-item">' + title + badgesFor(pub) +
        '<div class="pub-meta">' + esc(meta) + '</div>' +
        '<div class="pub-authors">' + esc(authors) + '</div></div>';
    }).join('');

    wrap.hidden = false;
  }

  function init() {
    (typeof loadPublications === 'function'
      ? loadPublications()
      : fetch('/data/publications.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
    ).then(render).catch(function () { /* leave hidden on failure */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
