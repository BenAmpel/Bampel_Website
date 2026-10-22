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

  // ---------- timing self-check ----------
  // The display: n animation-frame intervals (median, mean, SD, 95th percentile of the deviation from the median, and
  // frames that took longer than 1.5 intervals, which are dropped frames); timer lag (setTimeout(0) after 10 tries); and
  // the audio output latency the browser reports. Browser estimates only: a photodiode or a microphone at the speaker
  // is still the reference (Bridges et al. 2020; Anwyl-Irvine et al. 2021).
  function stats(xs) {
    var s = xs.slice().sort(function (a, b) { return a - b; }), n = s.length, mean = s.reduce(function (a, b) { return a + b; }, 0) / n;
    var sd = Math.sqrt(s.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / Math.max(1, n - 1)), q = function (p) { return s[Math.min(n - 1, Math.floor(p * n))]; };
    return { n: n, median: q(0.5), mean: mean, sd: sd, p95: q(0.95), min: s[0], max: s[n - 1] };
  }
  var r2 = function (x) { return x == null || !isFinite(x) ? null : Math.round(x * 100) / 100; };
  function timingProbe(frames) {
    frames = frames || 120;
    return new Promise(function (res) {
      var gaps = [], last = null;
      (function step(ts) {
        if (last != null) gaps.push(ts - last);
        last = ts;
        if (gaps.length < frames) return requestAnimationFrame(step);
        var st = stats(gaps), dev = stats(gaps.map(function (g) { return Math.abs(g - st.median); }));
        var lags = [], k = 0;
        (function tick() {
          var t = performance.now();
          setTimeout(function () { lags.push(performance.now() - t); if (++k < 10) tick(); else finish(); }, 0);
        })();
        function finish() {
          var a = { base: null, output: null, rate: null };
          try { var ac = new Ctx(); a = { base: ac.baseLatency != null ? ac.baseLatency * 1000 : null, output: ac.outputLatency != null ? ac.outputLatency * 1000 : null, rate: ac.sampleRate }; ac.close(); } catch (e) {}
          res({ frames: st.n, refreshHz: r2(1000 / st.median), frameMsMedian: r2(st.median), frameMsMean: r2(st.mean), frameMsSd: r2(st.sd), jitterP95Ms: r2(dev.p95),
            droppedFrames: gaps.filter(function (g) { return g > st.median * 1.5; }).length, timerLagMs: r2(stats(lags).median),
            audioBaseLatencyMs: r2(a.base), audioOutputLatencyMs: r2(a.output), audioSampleRate: a.rate, at: new Date().toISOString() });
        }
      })(performance.now());
    });
  }
  // Speaker to microphone round trip: a 20 ms 1 kHz click is scheduled on the audio clock while the microphone listens;
  // the first loud input block after it gives the delay. Needs speakers (not headphones) near the microphone; accurate to
  // about one processing block (about 20 ms), so it says whether the audio path is fast, not its exact latency.
  function micRoundTrip() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !Ctx) return Promise.resolve({ ok: false, error: 'unsupported' });
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      var ac = new Ctx(), src = ac.createMediaStreamSource(stream), sp = ac.createScriptProcessor(1024, 1, 1), sink = ac.createGain();
      sink.gain.value = 0; src.connect(sp); sp.connect(sink); sink.connect(ac.destination);
      return new Promise(function (res) {
        var t0 = ac.currentTime + 0.6, found = null, noise = 0, blocks = 0;
        var osc = ac.createOscillator(), g = ac.createGain(); osc.frequency.value = 1000; g.gain.value = 0.8; osc.connect(g); g.connect(ac.destination);
        osc.start(t0); osc.stop(t0 + 0.02);
        sp.onaudioprocess = function (e) {
          var d = e.inputBuffer.getChannelData(0), peak = 0, at = e.playbackTime - e.inputBuffer.duration;   // when this block was heard
          for (var i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
          if (at < t0 - 0.05) { noise = Math.max(noise, peak); blocks++; return; }
          if (found == null && at >= t0 - 0.03 && peak > Math.max(0.05, noise * 4)) found = at;
        };
        setTimeout(function () {
          stream.getTracks().forEach(function (t) { t.stop(); }); try { ac.close(); } catch (e) {}
          res(found == null ? { ok: false, error: 'not_heard', noise: r2(noise) } : { ok: true, roundTripMs: r2((found - t0) * 1000), blockMs: r2(1024 / ac.sampleRate * 1000) });
        }, 1800);
      });
    }, function (e) { return { ok: false, error: e && e.name === 'NotAllowedError' ? 'denied' : 'no_mic' }; });
  }

  root.LabEnv = { timingProbe: timingProbe, micRoundTrip: micRoundTrip, stats: stats, device: device, deviceProblems: deviceProblems, micLevel: micLevel, noisePair: noisePair, trialBuffer: trialBuffer, fft: fft, score: score, fullscreen: fs, AudioContext: Ctx,
    HEADPHONE_TRIALS: 6, HEADPHONE_PASS: 5 };
  if (typeof module !== 'undefined') module.exports = root.LabEnv;
})();
