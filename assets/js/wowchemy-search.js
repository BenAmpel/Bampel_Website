/*************************************************
 *  Wowchemy
 *  https://github.com/wowchemy/wowchemy-hugo-themes
 *
 *  In-built Fuse based search algorithm.
 **************************************************/

import {search_config, i18n, content_type} from '@params';

/* ---------------------------------------------------------------------------
 * Configuration.
 * --------------------------------------------------------------------------- */

// Configure Fuse.
let fuseOptions = {
  shouldSort: true,
  includeMatches: true,
  tokenize: true,
  threshold: search_config.threshold, // Set to ~0.3 for parsing diacritics and CJK languages.
  location: 0,
  distance: 100,
  maxPatternLength: 32,
  minMatchCharLength: search_config.minLength, // Set to 1 for parsing CJK languages.
  keys: [
    {name: 'title', weight: 0.99} /* 1.0 doesn't work o_O */,
    {name: 'summary', weight: 0.6},
    {name: 'authors', weight: 0.5},
    {name: 'content', weight: 0.2},
    {name: 'tags', weight: 0.5},
    {name: 'categories', weight: 0.5},
  ],
};

// Configure summary.
let summaryLength = 60;

/* ---------------------------------------------------------------------------
 * Functions.
 * --------------------------------------------------------------------------- */

// No jQuery (theme plan stage 2): DOM calls replace $(), and highlight() replaces the jquery.mark plugin.
const $id = (id) => document.getElementById(id);

// Wrap each word of `query` in <mark data-markjs="true"> inside el's text, as jquery.mark's defaults did: words
// separately, longest first, case-insensitive, ignoring accents, anywhere in a word.
function highlight(el, query) {
  if (!el) return;
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = [...new Set(query.split(/\s+/).map(fold).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!words.length) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentNode.closest('mark[data-markjs]')) nodes.push(n);
  for (const node of nodes) {
    // Fold the text one character at a time, keeping where each folded character came from.
    const text = node.nodeValue;
    let folded = '';
    const from = [];
    for (let i = 0; i < text.length; i++) {
      const f = fold(text[i]);
      for (let k = 0; k < f.length; k++) from.push(i);
      folded += f;
    }
    const hits = [];
    for (const w of words) {
      for (let at = folded.indexOf(w); at !== -1; at = folded.indexOf(w, at + w.length)) {
        const s = from[at], e = from[at + w.length - 1] + 1;
        if (!hits.some((h) => s < h[1] && e > h[0])) hits.push([s, e]);
      }
    }
    if (!hits.length) continue;
    hits.sort((a, b) => a[0] - b[0]);
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const [s, e] of hits) {
      if (s > last) frag.appendChild(document.createTextNode(text.slice(last, s)));
      const m = document.createElement('mark');
      m.setAttribute('data-markjs', 'true');
      m.textContent = text.slice(s, e);
      frag.appendChild(m);
      last = e;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}

// Get query from URI.
function getSearchQuery(name) {
  return decodeURIComponent((location.search.split(name + '=')[1] || '').split('&')[0]).replace(/\+/g, ' ');
}

// Set query in URI without reloading the page.
function updateURL(url) {
  if (history.replaceState) {
    window.history.replaceState({path: url}, '', url);
  }
}

// Pre-process new search query.
function initSearch(force, fuse) {
  let query = $id('search-query').value;
  const hits = $id('search-hits'), common = $id('search-common-queries');

  // If query deleted, clear results.
  if (query.length < 1) {
    hits.replaceChildren();
    if (common) common.style.display = '';
  }

  // Check for timer event (enter key not pressed) and query less than minimum length required.
  if (!force && query.length < fuseOptions.minMatchCharLength) return;

  // Do search.
  hits.replaceChildren();
  if (common) common.style.display = 'none';
  searchAcademic(query, fuse);
  let newURL =
    window.location.protocol +
    '//' +
    window.location.host +
    window.location.pathname +
    '?q=' +
    encodeURIComponent(query) +
    window.location.hash;
  updateURL(newURL);
}

// Perform search.
function searchAcademic(query, fuse) {
  let results = fuse.search(query);
  // console.log({"results": results});

  if (results.length > 0) {
    $id('search-hits').insertAdjacentHTML('beforeend', '<h3 class="mt-0">' + results.length + ' ' + i18n.results + '</h3>');
    parseResults(query, results);
  } else {
    $id('search-hits').insertAdjacentHTML('beforeend', '<div class="search-no-results">' + i18n.no_results + '</div>');
  }
}

// Parse search results.
function parseResults(query, results) {
  results.forEach(function (value, key) {
    let content_key = value.item.section;
    let content = '';
    let snippet = '';
    let snippetHighlights = [];

    // Show abstract in results for content types where the abstract is often the primary content.
    if (['publication', 'event'].includes(content_key)) {
      content = value.item.summary;
    } else {
      content = value.item.content;
    }

    if (fuseOptions.tokenize) {
      snippetHighlights.push(query);
    } else {
      value.matches.forEach(function (matchValue) {
        if (matchValue.key == 'content') {
          let start = matchValue.indices[0][0] - summaryLength > 0 ? matchValue.indices[0][0] - summaryLength : 0;
          let end =
            matchValue.indices[0][1] + summaryLength < content.length
              ? matchValue.indices[0][1] + summaryLength
              : content.length;
          snippet += content.substring(start, end);
          snippetHighlights.push(
            matchValue.value.substring(
              matchValue.indices[0][0],
              matchValue.indices[0][1] - matchValue.indices[0][0] + 1,
            ),
          );
        }
      });
    }

    if (snippet.length < 1) {
      snippet += value.item.summary; // Alternative fallback: `content.substring(0, summaryLength*2);`
    }

    // Load template.
    let template = $id('search-hit-fuse-template').innerHTML;

    // Localize content types.
    if (content_key in content_type) {
      content_key = content_type[content_key];
    }

    // Parse template.
    let templateData = {
      key: key,
      title: value.item.title,
      type: content_key,
      relpermalink: value.item.relpermalink,
      snippet: snippet,
    };
    let output = render(template, templateData);
    $id('search-hits').insertAdjacentHTML('beforeend', output);

    // Highlight search terms in result.
    snippetHighlights.forEach(function (hlValue) {
      highlight($id('summary-' + key), hlValue);
    });
  });
}

function render(template, data) {
  // Replace placeholders with their values.
  let key, find, re;
  for (key in data) {
    find = '\\{\\{\\s*' + key + '\\s*\\}\\}'; // Expect placeholder in the form `{{x}}`.
    re = new RegExp(find, 'g');
    template = template.replace(re, data[key]);
  }
  return template;
}

/* ---------------------------------------------------------------------------
 * Initialize.
 * --------------------------------------------------------------------------- */

// Shadowed from Wowchemy v5 (2026-10-24): the search index (/index.json, about 170 KB) used to load on every page view.
// It now loads the first time it is needed (and, since 2026-10-26, the Fuse library with it): when the search dialog opens (wowchemy.js adds "searching" to <body>), when
// the search box gets focus, or at once when the page was opened from a search link (?q=...). A query typed before the
// index arrives runs as soon as it does.
{
  let fuse = null;
  let loading = false;
  let pending = null; // force flag of a query typed before the index arrived

  function run(force) {
    if (fuse) initSearch(force, fuse);
    else pending = pending || force;
  }

  // Fuse itself also loads on first use (2026-10-26), in parallel with the index, with the integrity hash the old
  // <script> tag carried.
  function loadFuse() {
    if (typeof Fuse === 'function') return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = search_config.fuseURI;
      s.integrity = search_config.fuseSRI;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = function () { s.remove(); reject(new Error('Fuse did not load')); };
      document.head.appendChild(s);
    });
  }

  function loadIndex() {
    if (loading) return;
    loading = true;
    Promise.all([loadFuse(), fetch(search_config.indexURI).then((r) => r.json())])
      .then(function ([, search_index]) {
        fuse = new Fuse(search_index, fuseOptions);
        if (pending !== null) {
          initSearch(pending, fuse);
          pending = null;
        }
      })
      .catch(function () {
        loading = false; // try again on the next keystroke
      });
  }

  // On page load, check for search query in URL.
  let query = getSearchQuery('q');
  if (query) {
    document.querySelector('body').classList.add('searching');
    document.querySelectorAll('.search-results').forEach(function (el) {
      el.style.visibility = 'visible';
      el.style.opacity = 1;
      if (el.animate) el.animate([{opacity: 0}, {opacity: 1}], {duration: 200});
    });
    const box = $id('search-query');
    if (box) {
      box.value = query;
      box.focus();
    }
    loadIndex();
    run(true);
  }

  const body = document.querySelector('body');
  new MutationObserver(function () {
    if (body.classList.contains('searching')) loadIndex();
  }).observe(body, {attributes: true, attributeFilter: ['class']});
  const box = $id('search-query');
  if (box) {
    box.addEventListener('focus', loadIndex);

    // On search box key up, process query.
    let searchTimer;
    box.addEventListener('keyup', function (e) {
      loadIndex();
      clearTimeout(searchTimer); // Ensure only one timer runs!
      if (e.key === 'Enter' || e.keyCode == 13) {
        run(true);
      } else {
        searchTimer = setTimeout(function () {
          run(false);
        }, 250);
      }
    });
  }
}
