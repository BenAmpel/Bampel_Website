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

  // A key file kept under a passphrase (seal.mjs wrapKey): PBKDF2-SHA256, then AES-256-GCM over the key file's JSON.
  function unwrap(j, passphrase) {
    if (!passphrase) { var e = new Error('This key file is protected by a passphrase.'); e.code = 'need_passphrase'; return Promise.reject(e); }
    var ct = b64d(j.ct);
    return subtle.importKey('raw', enc.encode(String(passphrase).normalize('NFC')), 'PBKDF2', false, ['deriveKey']).then(function (pw) {
      return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(j.salt), iterations: j.iter }, pw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }).then(function (k) {
      return subtle.decrypt({ name: 'AES-GCM', iv: b64d(j.iv), additionalData: enc.encode('ccair-lab-key-wrapped-v1:' + j.kid), tagLength: 128 }, k, ct);
    }).then(function (pt) { return JSON.parse(dec.decode(pt)); }, function () { throw new Error('Wrong passphrase, or the key file was changed.'); });
  }
  // Loads a private key file (its text), or a passphrase-protected copy with its passphrase. Importing checks that x and d belong together.
  function load(text, passphrase) {
    var j;
    try { j = JSON.parse(text); } catch (e) { return Promise.reject(new Error('That file is not a lab key file.')); }
    if (j && j.format === 'ccair-lab-key-wrapped-v1') return unwrap(j, passphrase).then(function (inner) { return load(JSON.stringify(inner)); });
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

  // Recordings are sealed as bytes (seal.mjs sealBytes/openBytes): same keys and construction, a different HKDF info, and
  // additional data naming the key, the recording's storage key and its type. Envelope: ephemeral key 32 | iv 12 | ciphertext | tag 16.
  var INFO_BIN = enc.encode('ccair-lab-seal-bin-v1');
  function audioMime(m) { return String(m || '').split(';')[0].trim().toLowerCase(); }
  function binAad(kid, tag, mime) { return 'sealedbin:v1:' + kid + ':' + tag + ':' + audioMime(mime); }
  function binKey(shared, epk, rpk, use) {
    if (new Uint8Array(shared).every(function (x) { return x === 0; })) return Promise.reject(new Error('bad shared secret'));
    return subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']).then(function (ikm) {
      return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: cat(epk, rpk), info: INFO_BIN }, ikm, { name: 'AES-GCM', length: 256 }, false, [use]);
    });
  }
  // bytes (Uint8Array) -> envelope (Uint8Array), sealed to the study's public key (base64url).
  function sealBytes(publicKey, bytes, aad) {
    var rpk = b64d(publicKey), iv = window.crypto.getRandomValues(new Uint8Array(12)), eph, epk;
    return subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']).then(function (kp) {
      eph = kp;
      return subtle.exportKey('raw', kp.publicKey);
    }).then(function (e) {
      epk = new Uint8Array(e);
      return subtle.importKey('raw', rpk, { name: 'X25519' }, false, []);
    }).then(function (rk) {
      return subtle.deriveBits({ name: 'X25519', public: rk }, eph.privateKey, 256);
    }).then(function (shared) { return binKey(shared, epk, rpk, 'encrypt'); }).then(function (k) {
      return subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(aad), tagLength: 128 }, k, bytes);
    }).then(function (ct) { return cat(cat(epk, iv), new Uint8Array(ct)); });
  }
  // envelope -> ArrayBuffer, with the loaded key file. Rejects on another key, other additional data, or a changed envelope.
  function openBytes(envelope, aad) {
    var b = new Uint8Array(envelope);
    if (!key || String(aad).indexOf('sealedbin:v1:' + key.kid + ':') !== 0) return Promise.reject(new Error('other key'));
    if (b.length <= 60) return Promise.reject(new Error('not a sealed recording'));
    var epk = b.slice(0, 32), iv = b.slice(32, 44), body = b.slice(44);
    return subtle.importKey('raw', epk, { name: 'X25519' }, false, []).then(function (pub) {
      return subtle.deriveBits({ name: 'X25519', public: pub }, key.priv, 256);
    }).then(function (shared) { return binKey(shared, epk, b64d(key.x), 'decrypt'); }).then(function (k) {
      return subtle.decrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(aad), tagLength: 128 }, k, body);
    });
  }

  var support = null;   // asked once per page
  window.LabSeal = { supported: function () { return support || (support = supported()); }, generate: generate, load: load, forget: forget, loaded: loaded, open: open, openText: openText, seal: seal, RE: RE,
    sealBytes: sealBytes, openBytes: openBytes, binAad: binAad, audioMime: audioMime };
})();
