// CCAIR Behavioral Lab: sealed fields in the browser, with WebCrypto only. Same scheme as netlify/lib/lab/seal.mjs (read that header).
// The participant page seals free text and identifying link data with the study's public key before sending them (seal), so the
// server never receives them readable. The admin page makes a study's key pair and opens sealed values in downloads; the private
// key stays in that tab's memory: it is never sent to the server and never written to storage, and a reload forgets it.
// Needs WebCrypto X25519: Chrome 133+, Edge 133+, Firefox 130+, Safari 17+. Without it, use `node scripts/lab/seal.mjs`.
(function () {
  'use strict';
  var subtle = window.crypto && window.crypto.subtle, enc = new TextEncoder(), dec = new TextDecoder();
  var INFO = enc.encode('ccair-lab-seal-v1'), RE = /sealed:v1:[0-9a-f]{16}:[A-Za-z0-9_-]{80,}/g;
  var key = null;   // { x, kid, study, priv: CryptoKey }

  function b64d(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function kidOf(x) { return subtle.digest('SHA-256', b64d(x)).then(function (h) { return hex(h).slice(0, 16); }); }
  function cat(a, b) { var u = new Uint8Array(a.length + b.length); u.set(a); u.set(b, a.length); return u; }
  function b64e(u) { var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

  // Seals one value with a study's public key: a fresh X25519 key pair, HKDF-SHA256, AES-256-GCM. Empty and already
  // sealed values are returned as they are.
  function seal(publicKey, kid, value) {
    if (value == null || value === '' || (typeof value === 'string' && value.indexOf('sealed:v1:') === 0)) return Promise.resolve(value);
    var rpk = b64d(publicKey), head = 'sealed:v1:' + kid, iv = window.crypto.getRandomValues(new Uint8Array(12)), eph, epk;
    return subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']).then(function (kp) {
      eph = kp;
      return subtle.exportKey('raw', kp.publicKey);
    }).then(function (e) {
      epk = new Uint8Array(e);
      return subtle.importKey('raw', rpk, { name: 'X25519' }, false, []);
    }).then(function (rk) {
      return subtle.deriveBits({ name: 'X25519', public: rk }, eph.privateKey, 256);
    }).then(function (shared) {
      return subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    }).then(function (ikm) {
      return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: cat(epk, rpk), info: INFO }, ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    }).then(function (k) {
      return subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(head), tagLength: 128 }, k, enc.encode(JSON.stringify(value)));
    }).then(function (ct) { return head + ':' + b64e(cat(cat(epk, iv), new Uint8Array(ct))); });
  }

  function supported() {
    if (!subtle) return Promise.resolve(false);
    return subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']).then(function () { return true; }, function () { return false; });
  }

  // A new key pair. Returns the public key (for the server) and the private key file (for the researcher to keep).
  function generate(study) {
    return subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']).then(function (kp) {
      return subtle.exportKey('jwk', kp.privateKey);
    }).then(function (jwk) {
      return kidOf(jwk.x).then(function (kid) {
        return { publicKey: jwk.x, kid: kid, file: { kty: 'OKP', crv: 'X25519', x: jwk.x, d: jwk.d, kid: kid, study: study || '', createdAt: new Date().toISOString(), use: 'CCAIR Behavioral Lab sealed fields' } };
      });
    });
  }

  // Loads a private key file (its text). Importing checks that x and d belong together.
  function load(text) {
    var j;
    try { j = JSON.parse(text); } catch (e) { return Promise.reject(new Error('That file is not a lab key file.')); }
    if (!j || j.crv !== 'X25519' || !j.x || !j.d) return Promise.reject(new Error('That file is not a lab key file.'));
    return subtle.importKey('jwk', { kty: 'OKP', crv: 'X25519', x: j.x, d: j.d }, { name: 'X25519' }, false, ['deriveBits']).then(function (priv) {
      return kidOf(j.x).then(function (kid) { key = { x: j.x, kid: kid, study: j.study || '', priv: priv }; return { kid: kid, study: key.study }; });
    });
  }
  function forget() { key = null; }
  function loaded() { return key ? { kid: key.kid, study: key.study } : null; }

  function open(tok) {
    var m = tok.match(/^sealed:v1:([0-9a-f]{16}):([A-Za-z0-9_-]+)$/);
    if (!m || !key || m[1] !== key.kid) return Promise.reject(new Error('other key'));
    var b = b64d(m[2]), epk = b.slice(0, 32), iv = b.slice(32, 44), body = b.slice(44);
    return subtle.importKey('raw', epk, { name: 'X25519' }, false, []).then(function (pub) {
      return subtle.deriveBits({ name: 'X25519', public: pub }, key.priv, 256);
    }).then(function (shared) {
      return subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    }).then(function (ikm) {
      return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: cat(epk, b64d(key.x)), info: INFO }, ikm, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }).then(function (k) {
      return subtle.decrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode('sealed:v1:' + m[1]), tagLength: 128 }, k, body);
    }).then(function (pt) { return JSON.parse(dec.decode(pt)); });
  }

  // Opens every token in a text; format 'csv' (quoted, formula-safe, as the admin page's toCsv) or 'json'.
  function openText(text, format) {
    var toks = String(text).match(RE) || [], seen = {}, uniq = toks.filter(function (t) { return seen[t] ? false : (seen[t] = true); });
    var vals = {}, opened = 0, other = 0;
    return Promise.all(uniq.map(function (t) { return open(t).then(function (v) { vals[t] = v; opened++; }, function () { other++; }); })).then(function () {
      var out = String(text).replace(RE, function (t) {
        if (!Object.prototype.hasOwnProperty.call(vals, t)) return t;
        var v = vals[t], s = typeof v === 'string' ? v : JSON.stringify(v);
        if (format === 'json') return JSON.stringify(s).slice(1, -1);
        if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = "'" + s;
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      });
      return { text: out, opened: opened, other: other };
    });
  }

  var support = null;   // asked once per page
  window.LabSeal = { supported: function () { return support || (support = supported()); }, generate: generate, load: load, forget: forget, loaded: loaded, open: open, openText: openText, seal: seal, RE: RE };
})();
