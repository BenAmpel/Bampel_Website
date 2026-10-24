/* CCAIR Cyber Career Pathway Finder.
   Scroll reveals and role filters on every page; the quiz only on the hub (needs #pf-data).
   Nothing is stored or sent: answers live in memory and, if the student copies a link, in the URL hash
   (never sent to the server). Analytics records only anonymous quiz_started and quiz_finished counts, with no answers
   or results attached. */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Scroll reveal ---------- */
  function initReveal(root) {
    var els = (root || document).querySelectorAll('.reveal:not(.in)');
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var heard = false;
    var io = new IntersectionObserver(function (entries) {
      heard = true;
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      // The root reaches far above the viewport, so anything scrolled past in one jump (End key, a #fragment link,
      // a scrollbar drag) also counts; an observer reports only changes, so a viewport root would never report those.
    }, { rootMargin: '100000px 0px -6% 0px', threshold: 0 });
    els.forEach(function (e) { io.observe(e); });
    // Same failsafe as the CCAIR site: the observer reports every target as soon as it is observed, so if nothing has
    // arrived after 1.5 s it never will; show everything rather than leave content hidden.
    setTimeout(function () { if (!heard) els.forEach(function (e) { e.classList.add('in'); }); }, 1500);
  }
  initReveal();

  /* ---------- Motion layer (all skipped under reduced motion) ---------- */
  // Headlines rise word by word.
  function splitWords(el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
        if (ch.nodeType === 3) {
          var frag = document.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var o = document.createElement('span'); o.className = 'w';
            var inner = document.createElement('span'); inner.textContent = part; inner.style.setProperty('--i', i++);
            o.appendChild(inner); frag.appendChild(o);
          });
          ch.parentNode.replaceChild(frag, ch);
        } else if (ch.nodeType === 1) walk(ch);
      });
    })(el);
    el.classList.add('split');
  }
  if (!reduce) document.querySelectorAll('[data-split]').forEach(splitWords);

  // Stats count up when they come into view.
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count')), pre = el.getAttribute('data-pre') || '', suf = el.getAttribute('data-suf') || '';
    if (reduce) { el.textContent = pre + target + suf; return; }
    var t0 = null, dur = 1200;
    (function tick(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + Math.round(target * e) + suf;
      if (p < 1) requestAnimationFrame(tick);
    })(performance.now());
  }
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { countUp(en.target); cio.unobserve(en.target); } }); }, { threshold: 0.6 });
    counters.forEach(function (c) { cio.observe(c); });
  } else counters.forEach(countUp);

  // Scroll progress bar, background glow parallax and step-timeline drawing, on one rAF.
  var bar = document.createElement('div'); bar.className = 'scroll-progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
  var glows = document.querySelectorAll('.glow'), timelines = document.querySelectorAll('.guide ol.list');
  var ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY, h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? y / h : 0).toFixed(4) + ')';
    if (reduce) return;
    glows.forEach(function (g, i) { g.style.translate = '0 ' + (y * (i ? -0.12 : 0.18)).toFixed(1) + 'px'; });
    timelines.forEach(function (ol) {
      var r = ol.getBoundingClientRect(), p = (innerHeight * 0.75 - r.top) / (r.height || 1);
      ol.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
    });
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // Cards follow the pointer with a soft spotlight.
  if (!reduce && window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', function (e) {
      var c = e.target.closest && e.target.closest('.role-card, .card, .res a, .match');
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ---------- Role filters (hub) ---------- */
  var chips = document.querySelectorAll('.chip[data-filter]');
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var f = c.getAttribute('data-filter');
      chips.forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
      document.querySelectorAll('.role-card[data-hiring]').forEach(function (card) {
        card.hidden = !(f === 'all' || card.getAttribute('data-hiring') === f);
      });
    });
  });

  /* ---------- Quiz ---------- */
  var dataEl = document.getElementById('pf-data');
  var mount = document.getElementById('quiz');
  if (!dataEl || !mount) return;
  var D = JSON.parse(dataEl.textContent);
  var ROLES = D.roles, BY = {};
  ROLES.forEach(function (r) { BY[r.slug] = r; });
  var HIRING = { entry: 'Entry-level', step: 'Usually a second job', emerging: 'Emerging field' };
  var FAMILIES = [
    ['Defend', ['soc-analyst', 'incident-responder', 'systems-security-administrator']],
    ['Investigate', ['digital-forensics-investigator', 'threat-intelligence-analyst']],
    ['Test', ['penetration-tester', 'ai-security-specialist']],
    ['Build', ['application-security-engineer', 'cloud-security-engineer', 'ot-ics-security-specialist']],
    ['Govern', ['grc-analyst', 'it-auditor', 'privacy-analyst']],
    ['People', ['security-awareness-specialist']]
  ];

  // Canonical step list (used for share links). Part A order is shuffled for display only.
  var A = [];
  ROLES.forEach(function (r) { r.items.forEach(function (t, i) { A.push({ kind: 'a', role: r.slug, text: t, key: A.length }); }); });
  var B = D.pairs.map(function (p, i) { return { kind: 'b', pair: p, key: i }; });
  var C = D.context.map(function (c, i) { return { kind: 'c', ctx: c, key: i }; });
  var TOTAL = A.length + B.length + C.length;

  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    // Keep a role's two items apart so the same idea never shows twice in a row.
    for (var k = 1; k < a.length; k++) if (a[k].role === a[k - 1].role) { var m = (k + 2) % a.length; var tmp = a[k]; a[k] = a[m]; a[m] = tmp; }
    return a;
  }
  var steps, pos, ansA, ansB, ansC, started;
  function reset() {
    steps = shuffled(A).concat(B, C);
    pos = 0; ansA = new Array(A.length).fill(null); ansB = new Array(B.length).fill(null); ansC = new Array(C.length).fill(null); started = false;
  }
  reset();

  function track(name, params) { try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {} }

  /* Share code: v2-<42 digits A><14 digits B><5 digits C> */
  function encode() { return 'v2-' + ansA.join('') + ansB.join('') + ansC.join(''); }
  function decode(code) {
    var m = /^v2-(\d+)$/.exec(code || ''); if (!m) return false;
    var d = m[1]; if (d.length !== TOTAL) return false;
    var a = d.slice(0, A.length).split('').map(Number), b = d.slice(A.length, A.length + B.length).split('').map(Number), c = d.slice(A.length + B.length).split('').map(Number);
    if (a.some(function (x) { return x > 2; }) || b.some(function (x) { return x > 2; })) return false;
    for (var i = 0; i < C.length; i++) if (c[i] >= C[i].ctx.options.length) return false;
    ansA = a; ansB = b; ansC = c; return true;
  }

  /* ---------- Scoring ---------- */
  function score() {
    var s = {}; ROLES.forEach(function (r) { s[r.slug] = 0; });
    // Activity taps: each role's total, standardised within the person so a student who taps "Yes!" to
    // everything (or nothing) is compared with their own average. Simulation: removes answer-style bias.
    var sums = {}; ROLES.forEach(function (r) { sums[r.slug] = 0; });
    A.forEach(function (it, i) { sums[it.role] += ansA[i] || 0; });
    var v = ROLES.map(function (r) { return sums[r.slug]; }), mean = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
    var sd = Math.sqrt(v.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / v.length);
    ROLES.forEach(function (r) { s[r.slug] = (sums[r.slug] - mean) / (sd + 0.5) * 2; });
    B.forEach(function (it, i) { if (ansB[i] === 0) s[it.pair.a[1]] += 1.5; else if (ansB[i] === 1) s[it.pair.b[1]] += 1.5; });
    C.forEach(function (it, i) {
      var o = it.ctx.options[ansC[i]]; if (!o) return;
      Object.keys(o.w || {}).forEach(function (k) { s[k] += o.w[k]; });
    });
    var soon = C.filter(function (c) { return c.ctx.id === 'soon'; })[0];
    var boost = soon && soon.ctx.options[ansC[soon.key]] && soon.ctx.options[ansC[soon.key]].entryBoost;
    if (boost) ROLES.forEach(function (r) { if (r.hiring === 'entry' && s[r.slug] > 0) s[r.slug] *= boost; });
    var order = ROLES.map(function (r) { return r.slug; }).sort(function (x, y) { return s[y] - s[x] || ROLES.indexOf(BY[x]) - ROLES.indexOf(BY[y]); });
    return { s: s, order: order };
  }
  function ctxAnswer(id) { var c = C.filter(function (x) { return x.ctx.id === id; })[0]; return c ? ansC[c.key] : null; }

  /* ---------- Rendering helpers ---------- */
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return '$' + n.toLocaleString('en-US'); }
  var R = 22, CIRC = 2 * Math.PI * R;
  function ring(done) {
    var off = CIRC * (1 - done / TOTAL);
    return '<div class="ring" role="progressbar" aria-valuemin="0" aria-valuemax="' + TOTAL + '" aria-valuenow="' + done + '" aria-label="Progress">' +
      '<svg width="54" height="54" viewBox="0 0 54 54"><circle class="track" cx="27" cy="27" r="' + R + '" fill="none" stroke-width="4"/>' +
      '<circle class="bar" cx="27" cy="27" r="' + R + '" fill="none" stroke-width="4" stroke-dasharray="' + CIRC.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '"/></svg>' +
      '<b>' + done + '/' + TOTAL + '</b></div>';
  }
  function partLabel(st) {
    if (st.kind === 'a') return 'Part 1 of 3 · Would you enjoy';
    if (st.kind === 'b') return 'Part 2 of 3 · This or that';
    return 'Part 3 of 3 · About you';
  }
  function current(st) {
    if (st.kind === 'a') return ansA[st.key];
    if (st.kind === 'b') return ansB[st.key];
    return ansC[st.key];
  }

  /* ---------- Screens ---------- */
  function intro() {
    mount.innerHTML = '';
    var w = el('div', { class: 'intro-card qcard' },
      '<p class="part">About 5 minutes · ' + TOTAL + ' taps</p>' +
      '<h3 class="qtext" style="min-height:0" tabindex="-1">Tap how much each activity appeals to you. There are no wrong answers, and you don\'t need any cyber knowledge yet.</h3>' +
      '<p>You\'ll get your top 3 roles, why they fit, the realistic first job, which certifications to start with and free places to practise.</p>' +
      '<div class="hero-cta"><button class="btn btn-primary" id="pf-start">Start <span class="arrow" aria-hidden="true">&rarr;</span></button></div>' +
      '<p class="privacy-note">Nothing you answer is saved or sent anywhere. We only count, anonymously, how many people start and finish.</p>');
    mount.appendChild(w);
    document.getElementById('pf-start').addEventListener('click', function () { show(0, 1); });
  }

  var PARTS = {
    b: ['Part 2 of 3', 'This or that', 'Nice work. Now a few either-or choices that separate jobs that sound alike.'],
    c: ['Part 3 of 3', 'About you', 'Last stretch: five short questions about your background and what you want.']
  };
  var seenPart = {};
  function interstitial(i, kind) {
    seenPart[kind] = true;
    var P = PARTS[kind], done = ansA.concat(ansB, ansC).filter(function (x) { return x !== null; }).length;
    mount.innerHTML = '<div class="quiz-head"><span class="part">Checkpoint</span>' + ring(done) + '</div>' +
      '<div class="stage"><div class="qcard interlude"><p class="part">' + P[0] + '</p><h3 class="qtext" tabindex="-1">' + P[1] + '</h3>' +
      '<p class="sub">' + P[2] + '</p><div class="hero-cta"><button class="btn btn-primary" id="pf-go">Continue <span class="arrow" aria-hidden="true">&rarr;</span></button></div>' +
      '<div class="interlude-bar" aria-hidden="true"><i></i></div></div></div>';
    var go = document.getElementById('pf-go'), card = mount.querySelector('.interlude'), t = setTimeout(function () { show(i, 1, true); }, reduce ? 2500 : 2200);
    // The screen moves on by itself, so any sign that someone is reading or using it stops the timer (WCAG 2.2.1).
    // Continue always works.
    function hold() { clearTimeout(t); card.classList.add('held'); }
    card.addEventListener('pointerenter', hold);
    go.addEventListener('focus', hold);
    card.addEventListener('keydown', hold);
    go.addEventListener('click', function () { clearTimeout(t); show(i, 1, true); });
    mount.querySelector('.qtext').focus({ preventScroll: true });
    if (!reduce) mount.querySelector('.ring').classList.add('pulse');
  }

  function show(i, dir, skipInterlude) {
    var st = steps[i];
    if (!skipInterlude && dir > 0 && st.kind !== 'a' && !seenPart[st.kind] && i > 0 && steps[i - 1].kind !== st.kind) { pos = i; return interstitial(i, st.kind); }
    pos = i;
    var done = ansA.concat(ansB, ansC).filter(function (x) { return x !== null; }).length;
    var html = '<div class="quiz-head"><span class="part">' + partLabel(st) + '</span>' + ring(done) + '</div><div class="stage"><div class="qcard' + (dir < 0 ? ' back-in' : '') + '">';
    var cur = current(st);
    if (st.kind === 'a') {
      html += '<p class="prompt">Would you enjoy&hellip;</p><h3 class="qtext" tabindex="-1">' + esc(st.text) + '</h3>' +
        '<div class="answers three" role="group" aria-label="Your answer">' +
        ['Not for me', 'Maybe', 'Yes!'].map(function (l, v) {
          return '<button class="ans' + (cur === v ? ' picked' : '') + '" data-v="' + v + '" aria-pressed="' + (cur === v) + '"><kbd aria-hidden="true">' + (v + 1) + '</kbd>' + l + '</button>';
        }).join('') + '</div>';
    } else if (st.kind === 'b') {
      html += '<p class="prompt">Which sounds more like you?</p><h3 class="qtext" tabindex="-1">This or that?</h3>' +
        '<div class="answers two" role="group" aria-label="Pick one">' +
        [st.pair.a[0], st.pair.b[0]].map(function (l, v) {
          return '<button class="ans' + (cur === v ? ' picked' : '') + '" data-v="' + v + '" aria-pressed="' + (cur === v) + '"><kbd aria-hidden="true">' + (v + 1) + '</kbd>' + esc(l) + '</button>';
        }).join('') + '</div><div class="neither"><button class="linkbtn' + (cur === 2 ? ' picked' : '') + '" data-v="2" aria-pressed="' + (cur === 2) + '">Neither appeals to me</button></div>';
    } else {
      var opts = st.ctx.options;
      html += '<p class="prompt">One of ' + C.length + ' questions about you</p><h3 class="qtext" tabindex="-1">' + esc(st.ctx.q) + '</h3>' +
        '<div class="answers' + (opts.length <= 3 ? ' three' : '') + '" role="group" aria-label="Your answer">' +
        opts.map(function (o, v) {
          return '<button class="ans' + (cur === v ? ' picked' : '') + '" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + (v < 9 ? '<kbd aria-hidden="true">' + (v + 1) + '</kbd>' : '') + esc(o.label) + '</button>';
        }).join('') + '</div>';
    }
    html += '</div></div><div class="quiz-foot"><button class="linkbtn" id="pf-back"' + (i === 0 ? ' disabled' : '') + '>&larr; Back</button>' +
      '<span>' + (i + 1) + ' of ' + TOTAL + '</span></div>';
    mount.innerHTML = html;
    mount.querySelectorAll('[data-v]').forEach(function (b) {
      b.addEventListener('click', function () { answer(Number(b.getAttribute('data-v')), b); });
    });
    document.getElementById('pf-back').addEventListener('click', back);
    var q = mount.querySelector('.qtext'); if (q && dir !== 0) q.focus({ preventScroll: true });
  }

  var busy = false;
  function answer(v, btn) {
    if (busy) return;
    var st = steps[pos];
    if (st.kind === 'a') ansA[st.key] = v; else if (st.kind === 'b') ansB[st.key] = v; else ansC[st.key] = v;
    if (!started) { started = true; track('quiz_started'); }
    btn.classList.add('picked');
    btn.setAttribute('aria-pressed', 'true');
    busy = true;
    var card = mount.querySelector('.qcard');
    setTimeout(function () {
      if (card && !reduce) card.classList.add('out');
      setTimeout(function () {
        busy = false;
        if (pos + 1 < steps.length) show(pos + 1, 1); else finish();
      }, reduce ? 0 : 180);
    }, reduce ? 0 : 160);
  }
  function back() { if (pos > 0 && !busy) show(pos - 1, -1); }

  document.addEventListener('keydown', function (e) {
    if (!mount.querySelector('.qcard [data-v]') || e.metaKey || e.ctrlKey || e.altKey) return;
    // Shortcuts belong to the quiz: act only while focus is inside it (each question moves focus to its heading), so
    // digits, Backspace and the arrow keys keep their normal job everywhere else on the page (WCAG 2.1.4).
    if (!mount.contains(document.activeElement)) return;
    var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      var b = mount.querySelector('.answers [data-v="' + (n - 1) + '"]');
      if (b) { e.preventDefault(); b.click(); }
    } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); back(); }
  });

  function finish() {
    var r = score();
    track('quiz_finished');
    try { history.replaceState(null, '', '#r=' + encode()); } catch (e) {}
    if (reduce) return results(r, true);
    // A short "matching" moment: role names flick past while the scan line sweeps.
    mount.innerHTML = '<div class="matching" role="status"><div class="scan" aria-hidden="true"></div><p class="part">Matching you to 14 roles</p>' +
      '<p class="qtext flick">&nbsp;</p><div class="interlude-bar" aria-hidden="true"><i></i></div></div>';
    var f = mount.querySelector('.flick'), names = ROLES.map(function (x) { return x.name; }), n = 0;
    var iv = setInterval(function () { f.textContent = names[n++ % names.length]; }, 110);
    setTimeout(function () { clearInterval(iv); results(r, true); }, 1500);
  }

  /* ---------- Results ---------- */
  function whyFor(slug) {
    var yes = [], maybe = [];
    A.forEach(function (it, i) { if (it.role === slug) { if (ansA[i] === 2) yes.push(it.text); else if (ansA[i] === 1) maybe.push(it.text); } });
    B.forEach(function (it, i) {
      // pair.why holds a gerund phrase for each side ("building a company's security plan") so the reason reads
      // "you would enjoy building ..."; fall back to the button label if a pair has none.
      var why = it.pair.why || [];
      if (ansB[i] === 0 && it.pair.a[1] === slug) yes.push(why[0] || it.pair.a[0]);
      if (ansB[i] === 1 && it.pair.b[1] === slug) yes.push(why[1] || it.pair.b[0]);
    });
    var list = (yes.length ? yes : maybe).filter(function (t, i, all) { return all.indexOf(t) === i; });
    if (!list.length) return '<b>Why it fits:</b> your answers about background, work setting and pace pointed here more than to other roles.';
    return '<b>Why it fits:</b> you said ' + (yes.length ? 'you would enjoy' : 'you might enjoy') + '<ul>' + list.slice(0, 3).map(function (t) { return '<li>' + esc(t.charAt(0).toLowerCase() + t.slice(1)) + '</li>'; }).join('') + '</ul>';
  }
  function radar(r) {
    var vals = FAMILIES.map(function (f) { return f[1].reduce(function (a, s) { return a + r.s[s]; }, 0) / f[1].length; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || 1;
    var norm = vals.map(function (v) { return 0.3 + 0.7 * (v - lo) / span; });
    var cx = 150, cy = 140, rad = 100, n = FAMILIES.length;
    function pt(i, k) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * rad * k, cy + Math.sin(a) * rad * k]; }
    var grid = [0.33, 0.66, 1].map(function (k) { return '<polygon class="grid" points="' + FAMILIES.map(function (_, i) { return pt(i, k).join(','); }).join(' ') + '"/>'; }).join('');
    var spokes = FAMILIES.map(function (_, i) { var p = pt(i, 1); return '<line class="grid" x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '"/>'; }).join('');
    var pts = norm.map(function (k, i) { return pt(i, k); });
    var len = 0; for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; len += Math.hypot(a[0] - b[0], a[1] - b[1]); }
    var labels = FAMILIES.map(function (f, i) { var p = pt(i, 1.2); return '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4).toFixed(1) + '" text-anchor="middle">' + f[0] + '</text>'; }).join('');
    return '<svg class="radar' + (reduce ? '' : ' draw') + '" viewBox="0 0 300 280" role="img" aria-label="Your interest shape across six areas of cybersecurity: ' +
      FAMILIES.map(function (f, i) { return f[0] + ' ' + Math.round(norm[i] * 100) + ' percent'; }).join(', ') + '" style="--len:' + len.toFixed(0) + '">' +
      grid + spokes + '<polygon class="you" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>' + labels + '</svg>';
  }
  function results(r, animate) {
    var top = r.order.slice(0, 3);
    var soon = ctxAnswer('soon') === 0, code = ctxAnswer('code'), setting = ctxAnswer('setting');
    var html = '<div class="results"><p class="kicker">Your results</p><h2>Your top 3 cyber paths</h2>' +
      '<p class="sub">This is a starting point based on your interests, not a test of ability. Read the guides, try a free lab in each, and see which one you keep coming back to.</p>' +
      '<p class="print-only sub">CCAIR Cyber Career Pathway Finder · bampel.com/ccair/pathways/</p><div class="top3">';
    top.forEach(function (slug, i) {
      var ro = BY[slug], pay = ro.bls && D.bls[ro.bls];
      var route = ro.hiring === 'entry' ? 'You can often start here straight from school.' : 'Usual first job: ' + ro.feeder;
      html += '<article class="match' + (i === 0 ? ' first' : '') + '"><div class="rank">0' + (i + 1) + '</div><div>' +
        '<h3>' + esc(ro.name) + ' <span class="badge ' + ro.hiring + '">' + HIRING[ro.hiring] + '</span></h3>' +
        '<p class="tag">' + esc(ro.tagline) + '</p><div class="why">' + whyFor(slug) + '</div><dl class="facts">' +
        '<div><dt>Getting in</dt><dd>' + esc(route) + '</dd></div>' +
        '<div><dt>Start with</dt><dd>' + esc(ro.certsStart.join(', ')) + '</dd></div>' +
        '<div><dt>Practise free</dt><dd>' + ro.resources.slice(0, 2).map(function (x) { return '<a href="' + esc(x.url) + '" rel="noopener" target="_blank">' + esc(x.name) + '</a>'; }).join(', ') + '</dd></div>' +
        (pay ? '<div><dt>Median US pay</dt><dd>' + money(pay.median) + ' <span class="mono" style="color:var(--muted);font-size:12px">BLS, ' + esc(D.sources.blsDate) + '</span></dd></div>' : '') +
        '</dl><a class="go" href="' + slug + '/">Read the full ' + esc(ro.name) + ' guide &rarr;</a></div></article>';
    });
    html += '</div>';
    var notes = [];
    var s1 = r.s[top[0]], s2 = r.s[top[1]];
    if (Math.abs(s1 - s2) <= 1) {
      var c = BY[top[0]].close && BY[top[0]].close.role === top[1] ? BY[top[0]].close.note : null;
      notes.push('<b>Your top two are close.</b> ' + (c ? esc(c) : 'Read both guides; the "day in the life" section usually decides it.'));
    }
    if (soon && BY[top[0]].hiring !== 'entry') notes.push('<b>You want a job soon.</b> ' + esc(BY[top[0]].name) + ' is usually a second job. The fastest route in: ' + esc(BY[top[0]].feeder));
    if (code === 2 && top.some(function (s) { return BY[s].code === 'lots'; })) notes.push('<b>About coding.</b> One of your matches usually involves regular programming. Plenty of cyber roles need little or none, such as GRC, IT audit, privacy and security awareness.');
    if (setting === 0) notes.push('<b>Government work.</b> Many government and law enforcement cyber jobs need a security clearance, which usually requires US citizenship and a background check. Agencies sponsor the clearance after hiring.');
    notes.forEach(function (n) { html += '<div class="note">' + n + '</div>'; });
    html += '<div class="shape"><div>' + radar(r) + '</div><div><h3>Your cyber shape</h3><p class="sub">How your answers spread across six areas of the field. Most people lean toward two or three.</p>' +
      '<details class="all"><summary>See all 14 roles ranked</summary><ul class="bars">';
    var vals = r.order.map(function (s) { return r.s[s]; }), lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || 1;
    r.order.forEach(function (s, i) {
      var w = Math.max(4, Math.round(100 * (r.s[s] - lo) / span));
      html += '<li><a href="' + s + '/">' + esc(BY[s].name) + '</a><span class="b"><i style="width:' + w + '%;animation-delay:' + (i * 0.04).toFixed(2) + 's"></i></span></li>';
    });
    html += '</ul></details></div></div>' +
      '<div class="res-actions no-print"><button class="btn btn-primary" id="pf-copy">Copy link to my results</button>' +
      '<button class="btn btn-ghost" id="pf-print">Print or save as PDF</button>' +
      '<button class="btn btn-ghost" id="pf-again">Start over</button></div></div>';
    mount.innerHTML = html;
    var rh = mount.querySelector('.results h2');
    if (rh) rh.setAttribute('tabindex', '-1');
    if (animate) {
      mount.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      // Move focus to the results heading (the questions' DOM was replaced, so focus would fall to <body>) and say what
      // is there. Only the status line is a live region; the results themselves are not.
      if (rh) rh.focus({ preventScroll: true });
      var live = document.getElementById('pf-status');
      if (live) live.textContent = 'Your results are ready. Top match: ' + BY[top[0]].name + '. Then ' + BY[top[1]].name + ' and ' + BY[top[2]].name + '.';
    }
    document.getElementById('pf-copy').addEventListener('click', function () {
      var url = location.origin + location.pathname + '#r=' + encode();
      var ok = function () { toast('Link copied. Only you have it: nothing is stored on our side.'); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, function () { prompt('Copy this link:', url); });
      else prompt('Copy this link:', url);
    });
    document.getElementById('pf-print').addEventListener('click', function () { window.print(); });
    document.getElementById('pf-again').addEventListener('click', function () {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      reset(); seenPart = {}; show(0, 1);
    });
  }
  function toast(msg) {
    var t = document.querySelector('.toast') || document.body.appendChild(el('div', { class: 'toast', role: 'status' }));
    t.textContent = msg; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* Entry: shared results link, a "start" button elsewhere on the page, or the intro card. */
  var m = /#r=([^&]+)/.exec(location.hash);
  if (m && decode(decodeURIComponent(m[1]))) results(score(), false);
  else intro();
  document.querySelectorAll('[data-start-quiz]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      document.getElementById('finder').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      if (!mount.querySelector('.qcard [data-v]') && !mount.querySelector('.results')) setTimeout(function () { show(0, 1); }, reduce ? 0 : 450);
    });
  });
})();
