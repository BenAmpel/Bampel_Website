/* CCAIR Behavioral Lab: checks of the participant's setup before a session (loaded by participant.js only when the
   study asks for one; settings in content.environment, edited on Study content → Devices & timing).
   - device:    a computer with a mouse or trackpad (no phones or tablets); a browser that understands speech (Chrome, Edge)
   - mic:       the microphone hears the participant: a live level meter, passed after half a second of speech-level sound
   - headphone: Huggins-pitch test (Milne et al. 2021, Behavior Research Methods 53: 1551-1562): three noises, one hides a
                faint tone that only headphones reveal; 6 trials, passed at 5 or more correct
   - fullscreen: entering full screen (needs a click) and noticing every exit
   Everything runs in the browser; the results go to the server once per session (participant route "checks"). */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;   // Node loads it in the tests
  var Ctx = root.AudioContext || root.webkitAudioContext;

  // ---------- device and browser ----------
  function device() {
    var ua = navigator.userAgent || '', mm = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
    var mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || (mm('(pointer: coarse)') && !mm('(any-pointer: fine)'));
    var browser = /Edg\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
    var speech = !!(window.SpeechRecognition || window.webkitSpeechRecognition) && (browser === 'chrome' || browser === 'edge');
    return { mobile: mobile, browser: browser, speech: speech, screenW: screen.width, screenH: screen.height, dpr: window.devicePixelRatio || 1 };
  }
  function deviceProblems(env, d) {
    var out = [];
    if (env.desktopOnly && d.mobile) out.push('desktop');
    if (env.speechBrowser && !d.speech) out.push('speech');
    return out;
  }

  // ---------- microphone with a level meter ----------
  // Resolves { ok, peakDb } once sound above -45 dBFS has lasted 500 ms in total, or after 20 seconds without it.
  function micLevel(meter, onLevel) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !Ctx) return Promise.resolve({ ok: false, peakDb: null, error: 'unsupported' });
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var ac = new Ctx(), an = ac.createAnalyser(), buf = new Float32Array(2048), loud = 0, last = performance.now(), start = last, peak = -120;
      an.fftSize = 2048; ac.createMediaStreamSource(stream).connect(an);
      return new Promise(function (res) {
        function stop(ok) { stream.getTracks().forEach(function (t) { t.stop(); }); try { ac.close(); } catch (e) {} res({ ok: ok, peakDb: Math.round(peak) }); }
        (function frame() {
          an.getFloatTimeDomainData(buf);
          var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          var db = 20 * Math.log10(Math.sqrt(s / buf.length) || 1e-6), now = performance.now();
          peak = Math.max(peak, db);
          if (db > -45) loud += now - last;
          last = now;
          if (meter) { meter.value = Math.max(0, Math.min(100, db + 90)); }
          if (onLevel) onLevel(db, loud);
          if (loud >= 500) return stop(true);
          if (now - start > 20000) return stop(false);
          requestAnimationFrame(frame);
        })();
      });
    }, function (e) { return { ok: false, peakDb: null, error: e && e.name === 'NotAllowedError' ? 'denied' : 'no_mic' }; });
  }

  // ---------- headphone check (Huggins pitch) ----------
  // Noise with the same waveform in both ears, except that in one interval the right ear's noise is phase-inverted
  // in a narrow band around 600 Hz (±6%). Over headphones that band is heard as a faint tone; over loudspeakers the
  // ears mix and it disappears. Made in the frequency domain (random phase, flat magnitude) with an inverse FFT.
  function fft(re, im, inverse) {
    var n = re.length, i, j, k, len, ang, wr, wi, ur, ui, vr, vi, tr;
    for (i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { tr = re[i]; re[i] = re[j]; re[j] = tr; tr = im[i]; im[i] = im[j]; im[j] = tr; } }
    for (len = 2; len <= n; len <<= 1) {
      ang = 2 * Math.PI / len * (inverse ? 1 : -1); wr = Math.cos(ang); wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          ur = re[i + k]; ui = im[i + k]; vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci; vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          tr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = tr;
        }
      }
    }
    if (inverse) for (i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  // One noise interval as [left, right] of `len` samples; huggins = true inverts the 600 Hz band in the right ear.
  function noisePair(sr, len, huggins, rand) {
    var n = 1; while (n < len) n <<= 1;
    var lr = new Float64Array(n), li = new Float64Array(n), rr = new Float64Array(n), ri = new Float64Array(n), lo = 600 * 0.94, hi = 600 * 1.06;
    for (var k = 1; k < n / 2; k++) {
      var f = k * sr / n, ph = rand() * 2 * Math.PI, c = Math.cos(ph), s = Math.sin(ph), flip = huggins && f >= lo && f <= hi ? -1 : 1;
      lr[k] = c; li[k] = s; lr[n - k] = c; li[n - k] = -s;
      rr[k] = c * flip; ri[k] = s * flip; rr[n - k] = c * flip; ri[n - k] = -s * flip;
    }
    fft(lr, li, true); fft(rr, ri, true);
    var peak = 0, i; for (i = 0; i < len; i++) peak = Math.max(peak, Math.abs(lr[i]), Math.abs(rr[i]));
    var g = 0.25 / (peak || 1), ramp = Math.round(sr * 0.02), L = new Float32Array(len), R = new Float32Array(len);
    for (i = 0; i < len; i++) { var w = Math.min(1, i / ramp, (len - 1 - i) / ramp); L[i] = lr[i] * g * w; R[i] = rr[i] * g * w; }
    return [L, R];
  }
  // A trial: three 1-second noises with 0.5-second gaps; `target` (0 to 2) holds the Huggins pitch.
  function trialBuffer(ac, target, rand) {
    var sr = ac.sampleRate, one = Math.round(sr), gap = Math.round(sr / 2), buf = ac.createBuffer(2, one * 3 + gap * 2, sr);
    for (var t = 0; t < 3; t++) {
      var pr = noisePair(sr, one, t === target, rand), off = t * (one + gap);
      buf.getChannelData(0).set(pr[0], off); buf.getChannelData(1).set(pr[1], off);
    }
    return buf;
  }
  function score(answers, targets) { var n = 0; for (var i = 0; i < targets.length; i++) if (answers[i] === targets[i]) n++; return n; }

  // ---------- full screen ----------
  var fs = {
    supported: function () { return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen); },
    active: function () { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
    // Resolves true or false; some embedded browsers never answer the request, so it gives up after 2 seconds.
    enter: function () {
      var el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen;
      try {
        var p = f.call(el), late = new Promise(function (res) { setTimeout(function () { res(fs.active()); }, 2000); });
        return p && p.then ? Promise.race([p.then(function () { return true; }, function () { return false; }), late]) : Promise.resolve(true);
      } catch (e) { return Promise.resolve(false); }
    },
    // calls onExit(performance.now()) every time full screen ends
    watch: function (onExit) {
      var was = fs.active();
      function ch() { var now = fs.active(); if (was && !now) onExit(performance.now()); was = now; }
      document.addEventListener('fullscreenchange', ch); document.addEventListener('webkitfullscreenchange', ch);
    }
  };

  root.LabEnv = { device: device, deviceProblems: deviceProblems, micLevel: micLevel, noisePair: noisePair, trialBuffer: trialBuffer, fft: fft, score: score, fullscreen: fs, AudioContext: Ctx,
    HEADPHONE_TRIALS: 6, HEADPHONE_PASS: 5 };
  if (typeof module !== 'undefined') module.exports = root.LabEnv;
})();
