/* CCAIR Behavioral Lab: the timing self-check page (/lab/timing/). Uses the same measurements as a study's
   "Measure each participant's display" check (engine/envcheck.js), with more frames, and adds the speaker-to-
   microphone delay. Results stay in this browser unless the researcher downloads them. */
(function () {
  'use strict';
  var L = window.LabEnv, $ = function (id) { return document.getElementById(id); }, results = { page: 'timing-self-check', userAgent: navigator.userAgent, screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio || 1 } };
  var ROWS = [['refreshHz', 'Refresh rate', 'Hz'], ['frameMsMedian', 'Frame interval (median)', 'ms'], ['frameMsSd', 'Frame interval (SD)', 'ms'], ['jitterP95Ms', 'Jitter (95th percentile)', 'ms'],
    ['droppedFrames', 'Dropped frames', 'of 300'], ['timerLagMs', 'Timer lag, setTimeout(0)', 'ms'], ['audioBaseLatencyMs', 'Audio processing latency', 'ms'], ['audioOutputLatencyMs', 'Audio output latency (reported; 0 = not reported until sound plays)', 'ms'], ['audioSampleRate', 'Audio sample rate', 'Hz']];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  $('run').addEventListener('click', function () {
    var b = $('run'); b.disabled = true; $('runmsg').textContent = 'Measuring. Keep this tab in front.';
    L.timingProbe(300).then(function (t) {
      results.display = t;
      $('out').innerHTML = '<tr><th>Measure</th><th>Value</th></tr>' + ROWS.map(function (r) { return '<tr><td>' + esc(r[1]) + '</td><td>' + (t[r[0]] == null ? 'not reported' : esc(t[r[0]]) + ' ' + esc(r[2])) + '</td></tr>'; }).join('');
      $('runmsg').textContent = t.droppedFrames > 6 ? 'Done. More than 2% of frames were dropped: close other programs and tabs, plug in the laptop, and try again.' : 'Done.';
      b.disabled = false; $('save').disabled = false;
    });
  });
  // false when the site's own Permissions-Policy header turns the microphone off for this page (the browser then refuses
  // without asking, and allowing it in the browser's settings does not help); null when the browser cannot tell.
  function micAllowedBySite() {
    var pp = document.permissionsPolicy || document.featurePolicy;
    try { return pp && pp.allowsFeature ? pp.allowsFeature('microphone') : null; } catch (e) { return null; }
  }
  var SITE_BLOCKED = 'The website itself has turned the microphone off for this page (its Permissions-Policy setting), so the browser blocks it without asking. Changing the browser\'s settings will not help. Tell the lab (Support, at the top of the page) so the site setting can be fixed.';
  $('mic').addEventListener('click', function () {
    var b = $('mic');
    if (micAllowedBySite() === false) { results.sound = { ok: false, error: 'site_policy' }; $('micmsg').textContent = SITE_BLOCKED; $('save').disabled = false; return; }
    b.disabled = true; $('micmsg').textContent = 'Listening for the click.';
    L.micRoundTrip().then(function (r) {
      results.sound = r;
      $('micmsg').textContent = r.ok ? 'Speaker to microphone: ' + r.roundTripMs + ' ms (measured in blocks of ' + r.blockMs + ' ms).' :
        r.error === 'denied' ? (micAllowedBySite() === false ? SITE_BLOCKED : 'The microphone is blocked for this page. Allow it for this site in the browser (the camera or lock icon next to the address), reload, and try again. If the browser never asked, the website itself may be blocking it: tell the lab.') :
        r.error === 'not_heard' ? 'The click was not heard. Turn the volume up, unplug headphones, and try again.' : 'This browser cannot record sound here.';
      b.disabled = false; $('save').disabled = false;
    });
  });
  $('save').addEventListener('click', function () {
    results.savedAt = new Date().toISOString();
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' }));
    a.download = 'lab-timing-' + results.savedAt.slice(0, 10) + '.json'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
})();
