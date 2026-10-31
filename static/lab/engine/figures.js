/* CCAIR Behavioral Lab: shareable figures of pointer movement, made in the researcher's browser from the raw behavior
   traces (raw/{code}/s{n}/t{i}). A figure is a grid of panels drawn on one canvas: one participant's trail on an item,
   or many participants' trails on the same item overlaid, one panel per condition. Trails are drawn to each
   participant's own window size, coloured from blue (start) to orange (end), with numbered clicks. A figure saves as a
   PNG, or as a video (MP4 where the browser records it, else WebM) in which every panel plays on the same clock, so
   faster and slower participants can be compared. The Figures tab (mountTab) and the trial replay (replay.js) use it.
   Nothing here changes data; key events carry only a category, never the key, and are not drawn. */
(function (root) {
  'use strict';

  var FONT = '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Lato, system-ui, sans-serif';
  var SMALL = '400 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Lato, system-ui, sans-serif';
  var THEMES = {
    light: { bg: '#ffffff', panel: '#f4f6f9', screen: '#ffffff', line: '#d5dae3', text: '#1d2230', muted: '#5b6375', click: '#1d2230' },
    dark: { bg: '#0d1424', panel: '#162036', screen: '#0f182b', line: '#2b3a5c', text: '#eef2f8', muted: '#a9b4c8', click: '#ffffff' }
  };
  // Distinct, colour-blind-friendly hues for overlaid groups (Okabe-Ito order).
  var GROUP = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#F0E442'];

  // Blue at the start of a trail to orange at the end, through violet: readable on white and on navy.
  function timeColor(f) {
    var stops = [[0, [0, 114, 178]], [0.5, [150, 80, 170]], [1, [230, 110, 20]]], i = f <= 0.5 ? 0 : 1;
    var a = stops[i], b = stops[i + 1], u = (Math.max(0, Math.min(1, f)) - a[0]) / (b[0] - a[0]);
    return 'rgb(' + a[1].map(function (c, k) { return Math.round(c + (b[1][k] - c) * u); }).join(',') + ')';
  }
  // Where a participant's window sits inside a panel box: scaled to fit, centred, aspect kept.
  function fit(vw, vh, box) {
    var s = Math.min(box.w / vw, box.h / vh);
    return { s: s, x: box.x + (box.w - vw * s) / 2, y: box.y + (box.h - vh * s) / 2, w: vw * s, h: vh * s };
  }
  function secs(ms) { return (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s'; }

  // A trail: { moves: [{x, y, rt}], clicks: [...], end, vw, vh } (the output of LabReplay.prepare plus the window size).
  function drawTrail(ctx, tr, frame, o) {
    var upTo = o.upTo == null ? Infinity : o.upTo, mv = tr.moves, lw = Math.max(2.2, 4.2 * Math.sqrt(frame.s)) * (o.overlay ? 0.75 : 1), last = null;
    ctx.save(); ctx.beginPath(); ctx.rect(frame.x, frame.y, frame.w, frame.h); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.globalAlpha = o.alpha || 1;
    for (var i = 1; i < mv.length && mv[i].rt <= upTo; i++) {
      var a = mv[i - 1], b = mv[i];
      ctx.strokeStyle = o.color || timeColor(b.rt / tr.end);
      ctx.beginPath(); ctx.moveTo(frame.x + a.x * frame.s, frame.y + a.y * frame.s); ctx.lineTo(frame.x + b.x * frame.s, frame.y + b.y * frame.s); ctx.stroke();
      last = b;
    }
    if (mv.length && mv[0].rt <= upTo) {   // start: an open ring
      ctx.globalAlpha = Math.min(1, (o.alpha || 1) * 1.6); ctx.lineWidth = Math.max(1.5, lw * 0.8); ctx.strokeStyle = o.color || timeColor(0);
      ctx.beginPath(); ctx.arc(frame.x + mv[0].x * frame.s, frame.y + mv[0].y * frame.s, lw * 2.4, 0, Math.PI * 2); ctx.stroke();
    }
    if (last && !o.overlay) {   // where the pointer is now (or ended): a filled dot
      ctx.globalAlpha = 1; ctx.fillStyle = o.color || timeColor(last.rt / tr.end);
      ctx.beginPath(); ctx.arc(frame.x + last.x * frame.s, frame.y + last.y * frame.s, lw * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    if (o.clicks !== false) tr.clicks.forEach(function (c, n) {
      if (typeof c.x !== 'number' || c.rt > upTo) return;
      var cx = frame.x + c.x * frame.s, cy = frame.y + c.y * frame.s, r = o.overlay ? lw * 1.6 : Math.max(8, lw * 4);
      ctx.globalAlpha = o.overlay ? Math.min(1, (o.alpha || 1) * 2) : 1;
      ctx.fillStyle = o.overlay ? (o.color || o.theme.click) : o.theme.click; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      if (!o.overlay) { ctx.fillStyle = o.theme.bg; ctx.font = '700 ' + Math.round(r * 1.15) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n + 1), cx, cy + 0.5); }
    });
    ctx.restore();
  }

  // A figure: { title, caption, panels: [{ title, sub, trails: [trail], overlay?, color? }] } → a canvas with render(t).
  function build(fig, opts) {
    opts = opts || {};
    var theme = THEMES[opts.theme] || THEMES.light, n = fig.panels.length, cols = n <= 3 ? n || 1 : n === 4 ? 2 : 3, rows = Math.ceil(n / cols);
    var first = (fig.panels[0] && fig.panels[0].trails[0]) || { vw: 1280, vh: 800 };
    var aspect = Math.max(0.45, Math.min(1.2, first.vh / first.vw)), W = opts.width || 1600, pad = 28, gap = 22, head = fig.title ? 64 : 24, foot = 40, label = 46;
    var pw = (W - pad * 2 - gap * (cols - 1)) / cols, ph = pw * aspect + label, H = Math.round(head + rows * ph + (rows - 1) * gap + foot);
    var canvas = document.createElement('canvas'), dpr = opts.scale || 1; canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    var duration = Math.max.apply(null, [1].concat(fig.panels.map(function (p) { return Math.max.apply(null, [0].concat(p.trails.map(function (t) { return t.end; }))); })));
    function render(t) {
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);
      if (fig.title) { ctx.fillStyle = theme.text; ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Lato, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillText(fig.title, pad, 42); }
      fig.panels.forEach(function (p, i) {
        var c = i % cols, r = Math.floor(i / cols), x = pad + c * (pw + gap), y = head + r * (ph + gap);
        ctx.fillStyle = theme.panel; roundRect(ctx, x, y, pw, ph, 14); ctx.fill();
        ctx.fillStyle = theme.text; ctx.font = FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(clip(ctx, p.title || '', pw - 28), x + 14, y + 24);
        ctx.fillStyle = theme.muted; ctx.font = SMALL; ctx.fillText(clip(ctx, p.sub || '', pw - 28), x + 14, y + 41);
        var box = { x: x + 12, y: y + label, w: pw - 24, h: ph - label - 12 }, base = p.trails[0] || first, fr = fit(base.vw, base.vh, box);
        ctx.fillStyle = theme.screen; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); ctx.strokeStyle = theme.line; ctx.lineWidth = 1; ctx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);
        p.trails.forEach(function (tr) {
          var f = p.overlay ? fit(tr.vw, tr.vh, { x: fr.x, y: fr.y, w: fr.w, h: fr.h }) : fr;
          drawTrail(ctx, tr, f, { upTo: t, theme: theme, overlay: !!p.overlay, alpha: p.overlay ? Math.max(0.12, Math.min(0.55, 2.4 / p.trails.length)) : 1, color: p.overlay ? p.color : null, clicks: opts.clicks });
        });
        if (!p.trails.length) { ctx.fillStyle = theme.muted; ctx.font = SMALL; ctx.textAlign = 'center'; ctx.fillText('No pointer movement recorded', fr.x + fr.w / 2, fr.y + fr.h / 2); }
      });
      ctx.fillStyle = theme.muted; ctx.font = SMALL; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(fig.caption || '', pad, H - 14);
      ctx.textAlign = 'right'; ctx.fillText(t == null || t >= duration ? 'Full trial' : secs(t) + ' of ' + secs(duration), W - pad, H - 14);
      if (!opts.solidLegend) legend(ctx, W - pad - 210, H - 32, theme);
    }
    render(null);
    return { canvas: canvas, render: render, duration: duration };
  }
  function legend(ctx, x, y, theme) {   // the time colour bar, start to end
    var w = 90;
    for (var i = 0; i < w; i++) { ctx.fillStyle = timeColor(i / (w - 1)); ctx.fillRect(x + 40 + i, y - 4, 1, 6); }
    ctx.fillStyle = theme.muted; ctx.font = SMALL; ctx.textAlign = 'right'; ctx.fillText('start', x + 36, y + 2); ctx.textAlign = 'left'; ctx.fillText('end', x + 40 + w + 4, y + 2);
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function clip(ctx, s, max) { s = String(s); if (ctx.measureText(s).width <= max) return s; while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; }

  function png(f) { f.render(null); return new Promise(function (res) { f.canvas.toBlob(res, 'image/png'); }); }
  // The figure played on one clock, compressed into `seconds`, then held on the full trails for a second.
  function videoType() {
    if (!root.MediaRecorder) return null;
    var types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    return null;
  }
  function video(f, o) {
    o = o || {};
    var type = videoType(); if (!type || !f.canvas.captureStream) return Promise.reject(new Error('This browser cannot record video. Use Chrome, Edge, Firefox, or Safari 14.1 or later.'));
    var seconds = o.seconds || 8, stream = f.canvas.captureStream(30), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 }), chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    return new Promise(function (res, rej) {
      rec.onerror = function (e) { rej(e.error || new Error('Recording failed.')); };
      rec.onstop = function () { res({ blob: new Blob(chunks, { type: type.split(';')[0] }), ext: /mp4/.test(type) ? 'mp4' : 'webm' }); };
      rec.start(250);
      var t0 = performance.now(), hold = 1000;
      (function frame(now) {
        var k = (now - t0) / (seconds * 1000);
        f.render(Math.min(1, k) * f.duration);
        if (o.progress) o.progress(Math.min(1, (now - t0) / (seconds * 1000 + hold)));
        if (now - t0 < seconds * 1000 + hold) requestAnimationFrame(frame); else { f.render(null); setTimeout(function () { rec.stop(); stream.getTracks().forEach(function (tr) { tr.stop(); }); }, 120); }
      })(t0);
    });
  }

  // A trail from one raw trace record and its trials-CSV row (window size from viewport_w/h, else the path's extent).
  function trailFrom(rec, row, prepare) {
    var p = prepare(rec), vw = Number(row && row.viewport_w), vh = Number(row && row.viewport_h);
    if (!(vw > 0)) vw = Math.max.apply(null, [800].concat(p.moves.map(function (m) { return m.x + 20; })));
    if (!(vh > 0)) vh = Math.max.apply(null, [600].concat(p.moves.map(function (m) { return m.y + 20; })));
    return { moves: p.moves, clicks: p.clicks, end: p.end, vw: vw, vh: vh };
  }

  // ---------- the Figures tab ----------
  // api (from admin.js): { getJSON, rowsFor, saveFile, studyId, esc, day, err, prepare }. Trials rows say which item each
  // participant saw in which session and trial; the raw traces are fetched only for the participants a figure needs.
  function itemOf(r) { return r.item_id || r.alert_id || r.item_title || (r.target ? r.target + (r.distractor ? ' / ' + r.distractor : '') : '') || ('Session ' + r.session + ', trial ' + r.trial_index); }
  function mountTab(sec, api) {
    var esc = api.esc, rows = null, fig = null, rawCache = {};
    sec.innerHTML = '<p class="muted">Pointer trails as images or videos for talks, papers and posts: participants side by side on the same item, or every participant\'s trail overlaid, one panel per condition. Real participants only. Trails are drawn to each participant\'s window, from blue (start) to orange (end), with clicks numbered.</p>' +
      '<div class="row"><button type="button" id="fg-load">Load trials</button><span class="muted" id="fg-prog" role="status"></span></div>' +
      '<div id="fg-ui" hidden>' +
        '<div class="fg-controls">' +
          '<label class="f">Item<select id="fg-item"></select></label>' +
          '<div class="f"><span>Layout</span><div class="ptseg" role="radiogroup" aria-label="Layout" id="fg-mode"><button type="button" role="radio" data-mode="side" aria-checked="true">Side by side</button><button type="button" role="radio" data-mode="cond" aria-checked="false" tabindex="-1">By condition</button></div></div>' +
          '<div class="f"><span>Style</span><div class="row fg-style"><label class="check"><input type="checkbox" id="fg-dark"> Dark background</label><label class="check"><input type="checkbox" id="fg-clicks" checked> Show clicks</label></div></div>' +
        '</div>' +
        '<div id="fg-side"><p class="muted fg-hint">Choose up to six participants who saw this item.</p><input type="search" id="fg-q" placeholder="Search ID, condition or label" aria-label="Search participants"><div class="fg-pick" id="fg-pick"></div></div>' +
        '<div id="fg-cond" hidden><label class="f" style="max-width:280px">Participants per condition (random sample)<input type="number" id="fg-per" min="1" max="60" value="15"></label></div>' +
        '<div class="row"><button type="button" class="primary" id="fg-make">Make figure</button><span class="muted" id="fg-mprog" role="status"></span></div>' +
        '<div class="fg-out" id="fg-out" hidden><div class="fg-canvas" id="fg-canvas"></div>' +
          '<div class="row"><button type="button" class="secondary" id="fg-png">Save image (PNG)</button>' +
          '<label>Video length <select id="fg-len"><option value="6">6 s</option><option value="10" selected>10 s</option><option value="20">20 s</option></select></label>' +
          '<button type="button" class="secondary" id="fg-vid">Save video</button><span class="muted" id="fg-vprog" role="status"></span></div></div>' +
      '</div>';
    var $ = function (id) { return sec.querySelector('#' + id); }, mode = 'side', chosen = [];
    function rowsFor(item) { return rows.filter(function (r) { return itemOf(r) === item; }); }
    $('fg-load').addEventListener('click', function () {
      $('fg-load').disabled = true; $('fg-prog').textContent = 'Loading…'; api.err();
      api.getJSON('codes').then(function (list) {
        var codes = list.filter(function (p) { return !p.test; }).map(function (p) { return p.code; });
        if (!codes.length) throw new Error('No real participants yet. Figures use real participants only.');
        return api.rowsFor(codes, 'trials', function (f) { $('fg-prog').textContent = 'Loading trials… ' + Math.round(f * 100) + '%'; });
      }).then(function (r) {
        rows = r.filter(function (x) { return x.trial_index != null; });
        var count = {}; rows.forEach(function (x) { var k = itemOf(x); count[k] = (count[k] || 0) + 1; });
        var items = Object.keys(count).sort();
        if (!items.length) throw new Error('No trials yet. Figures need participants who reached the items.');
        $('fg-item').innerHTML = items.map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + ' (' + count[k] + ')</option>'; }).join('');
        $('fg-ui').hidden = false; $('fg-prog').textContent = rows.length + ' trials from ' + new Set(rows.map(function (x) { return x.code; })).size + ' participants.'; $('fg-load').textContent = 'Reload trials';
        pickList();
      }).catch(function (e) { api.err(e.message); $('fg-prog').textContent = ''; }).then(function () { $('fg-load').disabled = false; });
    });
    function pickList() {
      var rs = rowsFor($('fg-item').value), q = $('fg-q').value.trim().toLowerCase();
      chosen = chosen.filter(function (c) { return rs.some(function (r) { return r.code === c; }); });
      if (!chosen.length) {   // a first pick that shows contrast: one participant from each of the first four conditions
        var seen = {}; rs.forEach(function (r) { if (chosen.length < 4 && !seen[r.condition]) { seen[r.condition] = 1; chosen.push(r.code); } });
      }
      $('fg-pick').innerHTML = rs.filter(function (r) { return !q || [r.code, r.condition, r.label].some(function (x) { return String(x || '').toLowerCase().indexOf(q) >= 0; }); }).slice(0, 200).map(function (r) {
        var on = chosen.indexOf(r.code) >= 0;
        return '<label class="check fg-p"><input type="checkbox" data-code="' + esc(r.code) + '"' + (on ? ' checked' : '') + (!on && chosen.length >= 6 ? ' disabled' : '') + '> <code>' + esc(r.code) + '</code> <span class="muted">' + esc(r.condition || '') + (r.rt_ms ? ' · ' + (Number(r.rt_ms) / 1000).toFixed(1) + ' s' : '') + '</span></label>';
      }).join('') || '<p class="muted">No participants match.</p>';
    }
    $('fg-item').addEventListener('change', function () { chosen = []; pickList(); });
    $('fg-q').addEventListener('input', pickList);
    $('fg-pick').addEventListener('change', function (e) {
      var c = e.target.getAttribute('data-code'); if (!c) return;
      if (e.target.checked) { if (chosen.indexOf(c) < 0) chosen.push(c); } else chosen = chosen.filter(function (x) { return x !== c; });
      pickList();
    });
    $('fg-mode').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-mode]'); if (!b) return;
      mode = b.getAttribute('data-mode');
      $('fg-mode').querySelectorAll('[data-mode]').forEach(function (x) { var on = x === b; x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; });
      $('fg-side').hidden = mode !== 'side'; $('fg-cond').hidden = mode !== 'cond';
    });
    function raw(code) {   // every trial of one participant, once per tab
      if (!rawCache[code]) rawCache[code] = api.getJSON('raw?codes=' + encodeURIComponent(code)).then(function (r) { if (r && r.error) throw new Error(r.error); return r; });
      return rawCache[code];
    }
    function trailOf(row) {
      return raw(row.code).then(function (recs) {
        var rec = recs.filter(function (x) { return x.session === row.session && x.index === row.trial_index; })[0];
        return rec ? trailFrom(rec, row, api.prepare) : null;
      });
    }
    function sample(a, n) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a.slice(0, n); }
    $('fg-make').addEventListener('click', function () {
      var item = $('fg-item').value, rs = rowsFor(item), jobs, done = 0;
      api.err(); $('fg-make').disabled = true;
      var tick = function (x) { done++; $('fg-mprog').textContent = 'Reading traces… ' + done + ' of ' + jobs; return x; };
      var made;
      if (mode === 'side') {
        var pick = chosen.map(function (c) { return rs.filter(function (r) { return r.code === c; })[0]; }).filter(Boolean);
        if (!pick.length) { $('fg-make').disabled = false; return api.err('Choose at least one participant.'); }
        jobs = pick.length;
        made = Promise.all(pick.map(function (r) { return trailOf(r).then(tick); })).then(function (ts) {
          return { title: item, caption: api.studyId + ' · CCAIR Behavioral Lab · ' + api.day(), panels: pick.map(function (r, i) {
            return { title: r.code, sub: [r.condition, r.rt_ms ? (Number(r.rt_ms) / 1000).toFixed(1) + ' s' : '', ts[i] ? ts[i].clicks.length + ' click' + (ts[i].clicks.length === 1 ? '' : 's') : ''].filter(Boolean).join(' · '), trails: ts[i] && ts[i].moves.length ? [ts[i]] : [] };
          }) };
        });
      } else {
        var per = Math.max(1, Math.min(60, Number($('fg-per').value) || 15)), by = {};
        rs.forEach(function (r) { (by[r.condition || '(none)'] = by[r.condition || '(none)'] || []).push(r); });
        var conds = Object.keys(by).sort(), picks = conds.map(function (c) { return sample(by[c], per); });
        jobs = picks.reduce(function (n, p) { return n + p.length; }, 0);
        made = Promise.all(picks.map(function (p) { return Promise.all(p.map(function (r) { return trailOf(r).then(tick); })); })).then(function (all) {
          return { title: item + ': pointer trails by condition', caption: api.studyId + ' · up to ' + per + ' participants per condition · CCAIR Behavioral Lab · ' + api.day(), panels: conds.map(function (c, i) {
            var ts = all[i].filter(function (t) { return t && t.moves.length; });
            return { title: c, sub: ts.length + ' participant' + (ts.length === 1 ? '' : 's'), trails: ts, overlay: true, color: GROUP[i % GROUP.length] };
          }) };
        });
      }
      made.then(function (spec) {
        fig = build(spec, { theme: $('fg-dark').checked ? 'dark' : 'light', clicks: $('fg-clicks').checked, solidLegend: mode === 'cond' });
        var box = $('fg-canvas'); box.innerHTML = ''; fig.canvas.setAttribute('role', 'img'); fig.canvas.setAttribute('aria-label', spec.title + ': ' + spec.panels.map(function (p) { return p.title + ' (' + p.sub + ')'; }).join('; '));
        box.appendChild(fig.canvas); $('fg-out').hidden = false; $('fg-mprog').textContent = '';
        $('fg-vid').disabled = !videoType(); if (!videoType()) $('fg-vprog').textContent = 'This browser cannot record video.';
        fig.name = api.studyId + '_' + String(item).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) + '_' + (mode === 'side' ? 'side-by-side' : 'by-condition');
      }).catch(function (e) { api.err(e.message); $('fg-mprog').textContent = ''; }).then(function () { $('fg-make').disabled = false; });
    });
    $('fg-png').addEventListener('click', function () { png(fig).then(function (b) { api.saveFile(b, fig.name + '.png'); }); });
    $('fg-vid').addEventListener('click', function () {
      var b = $('fg-vid'); b.disabled = true; $('fg-png').disabled = true;
      video(fig, { seconds: Number($('fg-len').value), progress: function (f) { $('fg-vprog').textContent = 'Recording… ' + Math.round(f * 100) + '%'; } })
        .then(function (v) { api.saveFile(v.blob, fig.name + '.' + v.ext); $('fg-vprog').textContent = 'Saved as ' + v.ext.toUpperCase() + '.'; })
        .catch(function (e) { api.err(e.message); $('fg-vprog').textContent = ''; }).then(function () { b.disabled = false; $('fg-png').disabled = false; });
    });
  }

  root.LabFigures = { build: build, png: png, video: video, videoType: videoType, trailFrom: trailFrom, timeColor: timeColor, fit: fit, GROUP: GROUP, mountTab: mountTab, itemOf: itemOf };
})(typeof window !== 'undefined' ? window : this);
