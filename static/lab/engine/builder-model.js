/* CCAIR Behavioral Lab: the study builder's model (docs/designs/study-builder.md, Phase 6). Pure functions, no DOM and
   no network, so the browser (builder.js) and the node tests (tests/lab/builder-model.test.mjs, under vm) run the same
   code.

     decompile(content)      -> canvas   what the builder draws, derived only from the study content
     compile(canvas, base)   -> content  base with only the keys the canvas owns replaced
     check(canvas)           -> [{ code, message }]   designs the builder cannot run in v1: arm_limit,
                                block_size, quota_with_blocks, task_item_arm_only, variant_field, before_assignment
     roundTrips(content)     -> true when builder is set and compile(decompile(c), c) equals c (sorted keys)

   Canvas shape:
     { arms: [{ id, label }], assignAt, blockSize, quota,          quota: true when the study caps sign-ups
       sessions: [{ n, zones: { start: [qid], task: [block], end: [qid] } }],
       order: { pre: [qid], post: [qid] },                          survey order across all sessions
       every: [qid],                                                questions saved with sessions [] (pre: session 1;
                                                                    post: every session), kept as written
       armOnly: { qid: [armId] },
       variants: { itemId: { field: { armId: value } } } }
   A task block is { title, items: [itemId], randomize, pool? }; blocks have no id, so a block is its position.

   compile replaces design.conditions, design.assignAtSession, design.randomization (method and block size; the seed
   stays), design.sessions[].blocks, survey.pre and survey.post membership with each question's sessions and
   conditions, item variants, and builder. Every other key of base passes through untouched. New questions and items
   are added to base by the caller before they appear on the canvas; compile only places them. */
(function (root) {
  'use strict';

  var MIN_ARMS = 2, MAX_ARMS = 6;
  // The "Differs by arm" panel: the wording and media of an item. Every other item field is the same for all arms.
  var VARIANT_FIELDS = ['decisionPrompt', 'body', 'media', 'mediaAlt'];
  var VERSION = 1;

  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function decompile(content) {
    var c = obj(content), d = obj(c.design), r = obj(d.randomization), s = obj(c.survey), q = obj(obj(c.enrollment).quota);
    var pre = arr(s.pre), post = arr(s.post), sessions = arr(d.sessions), nS = Math.max(sessions.length, 1);
    var armOnly = {}, every = [];
    pre.concat(post).forEach(function (x) {
      if (!x) return;
      if (arr(x.conditions).length) armOnly[x.id] = x.conditions.slice();
      if (!arr(x.sessions).length) every.push(x.id);
    });
    var canvas = {
      arms: arr(d.conditions).map(function (a) { return { id: a.id, label: a.label }; }),
      assignAt: d.assignAtSession || 1,
      blockSize: r.blockSize == null ? null : r.blockSize,
      quota: q.total != null || Object.keys(obj(q.perCondition)).some(function (k) { return q.perCondition[k] != null; }),
      sessions: [],
      order: { pre: pre.map(function (x) { return x.id; }), post: post.map(function (x) { return x.id; }) },
      every: every,
      armOnly: armOnly,
      variants: {}
    };
    for (var n = 1; n <= nS; n++) {
      var sess = obj(sessions[n - 1]);
      // A question saved with sessions [] shows at session 1 (start) or every session (end); draw it there.
      var start = pre.filter(function (x) { return x && (arr(x.sessions).length ? x.sessions.indexOf(n) >= 0 : n === 1); }).map(function (x) { return x.id; });
      var end = post.filter(function (x) { return x && (arr(x.sessions).length ? x.sessions.indexOf(n) >= 0 : true); }).map(function (x) { return x.id; });
      canvas.sessions.push({ n: n, zones: { start: start, task: clone(arr(sess.blocks)), end: end } });
    }
    arr(c.items).forEach(function (it) {
      var v = obj(it && it.variants), out = {};
      Object.keys(v).forEach(function (arm) {
        Object.keys(obj(v[arm])).forEach(function (f) { (out[f] = out[f] || {})[arm] = clone(v[arm][f]); });
      });
      if (Object.keys(out).length) canvas.variants[it.id] = out;
    });
    return canvas;
  }

  function compile(canvas, base) {
    var cv = obj(canvas), c = clone(obj(base)), armIds = arr(cv.arms).map(function (a) { return a.id; });
    c.design = obj(c.design);
    var oldArms = {}; arr(c.design.conditions).forEach(function (a) { if (a) oldArms[a.id] = a; });
    c.design.conditions = arr(cv.arms).map(function (a) { var o = clone(oldArms[a.id]) || {}; o.id = a.id; o.label = a.label; return o; });
    c.design.assignAtSession = cv.assignAt || 1;
    var r = obj(c.design.randomization);
    c.design.randomization = { method: 'blocks', blockSize: cv.blockSize, seed: r.seed != null ? r.seed : 'builder' };
    for (var k in r) if (has(r, k) && !has(c.design.randomization, k)) c.design.randomization[k] = r[k];
    var oldSessions = arr(c.design.sessions);
    c.design.sessions = arr(cv.sessions).map(function (s, i) {
      var o = clone(obj(oldSessions[i])); o.blocks = clone(arr(obj(s.zones).task)); return o;
    });

    // Survey questions: membership and order from canvas.order, sessions from the zones, conditions from armOnly.
    var s = obj(c.survey), byId = {}, every = {};
    arr(s.pre).concat(arr(s.post)).forEach(function (x) { if (x) byId[x.id] = x; });
    arr(cv.every).forEach(function (id) { every[id] = true; });
    function place(kind, zoneName) {
      return arr(obj(cv.order)[kind]).filter(function (id) { return byId[id]; }).map(function (id) {
        var x = clone(byId[id]);
        if (every[id]) x.sessions = [];
        else x.sessions = arr(cv.sessions).filter(function (ss) { return arr(obj(ss.zones)[zoneName]).indexOf(id) >= 0; }).map(function (ss) { return ss.n; });
        var conds = arr(obj(cv.armOnly)[id]).filter(function (a) { return armIds.indexOf(a) >= 0; });
        if (conds.length) x.conditions = conds;
        else if (has(x, 'conditions')) x.conditions = [];
        return x;
      });
    }
    c.survey = s;
    s.pre = place('pre', 'start');
    s.post = place('post', 'end');

    // Item variants: variants[arm][field] in content, variants[item][field][arm] on the canvas. Arms that are gone
    // lose their variants. An arm entry saved empty stays empty, so an untouched study compiles to itself; an entry
    // whose last field the canvas removed goes, because the server reads any arm key as "varies by arm".
    var cvv = obj(cv.variants);
    c.items = arr(c.items).map(function (it) {
      if (!it) return it;
      var want = obj(cvv[it.id]), had = obj(it.variants), out = {};
      Object.keys(had).forEach(function (arm) { if (armIds.indexOf(arm) >= 0 && !Object.keys(obj(had[arm])).length) out[arm] = {}; });
      Object.keys(want).forEach(function (f) {
        Object.keys(obj(want[f])).forEach(function (arm) { if (armIds.indexOf(arm) >= 0) (out[arm] = out[arm] || {})[f] = clone(want[f][arm]); });
      });
      var x = clone(it);
      if (Object.keys(out).length || has(it, 'variants')) x.variants = out;
      return x;
    });
    c.builder = { v: VERSION };
    return c;
  }

  function check(canvas) {
    var cv = obj(canvas), out = [], nA = arr(cv.arms).length;
    function no(code, message) { out.push({ code: code, message: message }); }
    if (nA < MIN_ARMS || nA > MAX_ARMS) no('arm_limit', 'The builder runs ' + MIN_ARMS + ' to ' + MAX_ARMS + ' arms; this design has ' + nA + '.');
    var bs = cv.blockSize;
    if (nA && (!(typeof bs === 'number' && bs % 1 === 0) || bs % nA || bs < 2 * nA || bs > 100))
      no('block_size', 'The block size must be a multiple of the ' + nA + ' arms, at least ' + 2 * nA + ' and at most 100.');
    if (cv.quota) no('quota_with_blocks', 'Arms are assigned in blocks, so the study cannot also cap sign-ups; remove the quota.');
    var taskItems = {};
    arr(cv.sessions).forEach(function (s) { arr(obj(s.zones).task).forEach(function (b) { arr(b && b.items).forEach(function (id) { taskItems[id] = true; }); }); });
    Object.keys(obj(cv.armOnly)).forEach(function (id) {
      if (taskItems[id]) no('task_item_arm_only', '"' + id + '" is a task item, so every arm sees it; change its wording or media by arm instead.');
    });
    Object.keys(obj(cv.variants)).forEach(function (id) {
      Object.keys(obj(cv.variants[id])).forEach(function (f) {
        if (VARIANT_FIELDS.indexOf(f) < 0) no('variant_field', '"' + id + '" changes "' + f + '" by arm; the builder only changes the wording and media by arm.');
      });
    });
    // Above the "Assign to arms" band nobody has an arm yet, so nothing there can differ by arm.
    var at = cv.assignAt || 1;
    arr(cv.sessions).forEach(function (s) {
      if (!(s.n < at)) return;
      var z = obj(s.zones);
      arr(z.task).forEach(function (b) { arr(b && b.items).forEach(function (id) {
        if (Object.keys(obj(obj(cv.variants)[id])).length) no('before_assignment', '"' + id + '" is in session ' + s.n + ', before arms are assigned at session ' + at + ', so it cannot differ by arm.');
      }); });
      arr(z.start).concat(arr(z.end)).forEach(function (id) {
        if (arr(obj(cv.armOnly)[id]).length) no('before_assignment', '"' + id + '" is in session ' + s.n + ', before arms are assigned at session ' + at + ', so it cannot be shown to one arm only.');
      });
    });
    return out;
  }

  // Deep-equal after sorting object keys; array order counts. Returns the first differing paths (up to 20).
  function diff(a, b, path, out) {
    out = out || []; path = path || '';
    if (out.length >= 20) return out;
    if (a === b) return out;
    var ta = Array.isArray(a) ? 'array' : a === null ? 'null' : typeof a, tb = Array.isArray(b) ? 'array' : b === null ? 'null' : typeof b;
    if (ta !== tb) { out.push(path || '(root)'); return out; }
    if (ta === 'array') {
      if (a.length !== b.length) out.push(path + '.length');
      for (var i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], path + '[' + i + ']', out);
      return out;
    }
    if (ta === 'object') {
      var keys = {}; Object.keys(a).concat(Object.keys(b)).forEach(function (k) { keys[k] = true; });
      Object.keys(keys).sort().forEach(function (k) {
        if (a[k] === undefined && b[k] === undefined) return;
        if (!has(a, k) || a[k] === undefined || !has(b, k) || b[k] === undefined) out.push(path + '.' + k);
        else diff(a[k], b[k], path + '.' + k, out);
      });
      return out;
    }
    out.push(path || '(root)');
    return out;
  }

  function roundTrips(content) {
    var c = obj(content);
    if (!c.builder) return { ok: false, why: 'no_builder', paths: [] };
    var paths = diff(clone(c), compile(decompile(c), c));
    return { ok: !paths.length, why: paths.length ? 'differs' : null, paths: paths };
  }

  // ---------- edits ----------
  // Each edit takes a canvas and returns a new one; the input is never changed. Every edit ends in canonical(), which
  // draws the zones the way decompile would (start and end zones in survey order; an "every" question in each session
  // it reaches), so after any edit the canvas equals decompile(compile(canvas, base)).
  function kindOf(cv, id) { return cv.order.pre.indexOf(id) >= 0 ? 'pre' : cv.order.post.indexOf(id) >= 0 ? 'post' : null; }
  function zoneOf(kind) { return kind === 'pre' ? 'start' : 'end'; }
  function canonical(cv) {
    var every = {}; cv.every = cv.every.filter(function (id) { return kindOf(cv, id); });
    cv.every.forEach(function (id) { every[id] = true; });
    ['pre', 'post'].forEach(function (kind) {
      var z = zoneOf(kind), order = cv.order[kind];
      cv.sessions.forEach(function (s) {
        var here = {}; s.zones[z].forEach(function (id) { here[id] = true; });
        s.zones[z] = order.filter(function (id) { return every[id] ? (kind === 'post' || s.n === 1) : here[id]; });
      });
    });
    Object.keys(cv.armOnly).forEach(function (id) {
      var keep = cv.armOnly[id].filter(function (a) { return cv.arms.some(function (x) { return x.id === a; }); });
      if (!kindOf(cv, id) || !keep.length) delete cv.armOnly[id]; else cv.armOnly[id] = keep;
    });
    return cv;
  }
  function fitBlocks(cv) {
    var n = cv.arms.length, b = cv.blockSize;
    if (!(typeof b === 'number' && b % 1 === 0 && n && b % n === 0 && b >= 2 * n && b <= 100)) cv.blockSize = 2 * n;
    return cv;
  }
  // A question drawn in a session because it was saved with sessions [] gets its sessions written out before the
  // researcher changes one of them, so the change touches only that session.
  function unEvery(cv, id) { cv.every = cv.every.filter(function (x) { return x !== id; }); }
  function newArmId(cv) {
    for (var k = cv.arms.length + 1; ; k++) { var id = 'arm' + k; if (!cv.arms.some(function (a) { return a.id === id; })) return id; }
  }
  var ops = {
    addArm: function (canvas, label) {
      var cv = clone(canvas), id = newArmId(cv);
      cv.arms.push({ id: id, label: label || 'Arm ' + (cv.arms.length + 1) });
      return fitBlocks(canonical(cv));
    },
    renameArm: function (canvas, id, label) {
      var cv = clone(canvas); cv.arms.forEach(function (a) { if (a.id === id) a.label = label; }); return cv;
    },
    removeArm: function (canvas, id) {
      var cv = clone(canvas);
      cv.arms = cv.arms.filter(function (a) { return a.id !== id; });
      Object.keys(cv.variants).forEach(function (it) {
        Object.keys(cv.variants[it]).forEach(function (f) { delete cv.variants[it][f][id]; if (!Object.keys(cv.variants[it][f]).length) delete cv.variants[it][f]; });
        if (!Object.keys(cv.variants[it]).length) delete cv.variants[it];
      });
      return fitBlocks(canonical(cv));
    },
    setAssignAt: function (canvas, n) { var cv = clone(canvas); cv.assignAt = n; return cv; },
    setBlockSize: function (canvas, n) { var cv = clone(canvas); cv.blockSize = n; return cv; },
    addSession: function (canvas) {
      var cv = clone(canvas);
      cv.sessions.push({ n: cv.sessions.length + 1, zones: { start: [], task: [{ title: '', items: [], randomize: false }], end: [] } });
      return canonical(cv);
    },
    // Questions shown only in the removed session go with it; later sessions move up by one.
    removeSession: function (canvas, n) {
      var cv = clone(canvas), gone = cv.sessions[n - 1];
      if (!gone || cv.sessions.length < 2) return cv;
      cv.sessions.splice(n - 1, 1);
      cv.sessions.forEach(function (s, i) { s.n = i + 1; });
      ['pre', 'post'].forEach(function (kind) {
        var z = zoneOf(kind);
        cv.order[kind] = cv.order[kind].filter(function (id) {
          return cv.every.indexOf(id) >= 0 || cv.sessions.some(function (s) { return s.zones[z].indexOf(id) >= 0; });
        });
      });
      if (cv.assignAt > cv.sessions.length) cv.assignAt = cv.sessions.length;
      else if (cv.assignAt > n) cv.assignAt -= 1;
      return canonical(cv);
    },
    // Puts question id into session n's start or end zone, just before the question `before` in that zone (or last).
    // A question can sit in start zones or in end zones, not both: moving it across moves every placement.
    placeQuestion: function (canvas, id, n, zone, before, fromN) {
      var cv = clone(canvas), kind = zone === 'start' ? 'pre' : 'post', was = kindOf(cv, id), z = zoneOf(kind);
      unEvery(cv, id);
      if (was && was !== kind) {
        cv.sessions.forEach(function (s) { var l = s.zones[zoneOf(was)]; if (l.indexOf(id) >= 0) l.splice(l.indexOf(id), 1); });
        cv.order[was] = cv.order[was].filter(function (x) { return x !== id; });
      } else if (fromN && fromN !== n) {
        var fl = cv.sessions[fromN - 1].zones[z]; if (fl.indexOf(id) >= 0) fl.splice(fl.indexOf(id), 1);
      }
      var s = cv.sessions[n - 1], list = s.zones[z].filter(function (x) { return x !== id; });
      var at = before && list.indexOf(before) >= 0 ? list.indexOf(before) : list.length;
      list.splice(at, 0, id); s.zones[z] = list;
      // Survey order is one list across sessions: put id next to its new neighbour in this zone.
      var order = cv.order[kind].filter(function (x) { return x !== id; }), next = list[at + 1], prev = list[at - 1];
      if (next != null && order.indexOf(next) >= 0) order.splice(order.indexOf(next), 0, id);
      else if (prev != null && order.indexOf(prev) >= 0) order.splice(order.indexOf(prev) + 1, 0, id);
      else order.push(id);
      cv.order[kind] = order;
      return canonical(cv);
    },
    // Takes a question out of one session. Its last placement deletes it from the survey (the caller confirms).
    removeQuestion: function (canvas, id, n) {
      var cv = clone(canvas), kind = kindOf(cv, id); if (!kind) return cv;
      var z = zoneOf(kind);
      unEvery(cv, id);
      var l = cv.sessions[n - 1].zones[z]; if (l.indexOf(id) >= 0) l.splice(l.indexOf(id), 1);
      if (!cv.sessions.some(function (s) { return s.zones[z].indexOf(id) >= 0; })) cv.order[kind] = cv.order[kind].filter(function (x) { return x !== id; });
      return canonical(cv);
    },
    lastPlacement: function (canvas, id) {
      var kind = kindOf(canvas, id); if (!kind) return false;
      var z = zoneOf(kind), n = 0; canvas.sessions.forEach(function (s) { if (s.zones[z].indexOf(id) >= 0) n++; });
      return n <= 1;
    },
    // arms: [] for everyone, else the arms that see the question.
    setShownTo: function (canvas, id, arms) {
      var cv = clone(canvas);
      if (arms && arms.length) cv.armOnly[id] = cv.arms.map(function (a) { return a.id; }).filter(function (a) { return arms.indexOf(a) >= 0; });
      else delete cv.armOnly[id];
      return canonical(cv);
    },
    addBlock: function (canvas, n) {
      var cv = clone(canvas); cv.sessions[n - 1].zones.task.push({ title: '', items: [], randomize: false }); return cv;
    },
    removeBlock: function (canvas, n, b) { var cv = clone(canvas); cv.sessions[n - 1].zones.task.splice(b, 1); return cv; },
    setBlock: function (canvas, n, b, patch) {
      var cv = clone(canvas), blk = cv.sessions[n - 1].zones.task[b];
      Object.keys(patch).forEach(function (k) { blk[k] = patch[k]; });
      return cv;
    },
    moveBlock: function (canvas, n, b, by) {
      var cv = clone(canvas), l = cv.sessions[n - 1].zones.task, j = b + by;
      if (j < 0 || j >= l.length) return cv;
      var t = l[b]; l[b] = l[j]; l[j] = t; return cv;
    },
    // Puts item id into block b of session n before `before` (or last), taking it out of block (fromN, fromB) first.
    placeItem: function (canvas, id, n, b, before, fromN, fromB) {
      var cv = clone(canvas);
      if (fromN) { var fl = cv.sessions[fromN - 1].zones.task[fromB].items; if (fl.indexOf(id) >= 0) fl.splice(fl.indexOf(id), 1); }
      var list = cv.sessions[n - 1].zones.task[b].items.filter(function (x) { return x !== id; });
      var at = before && list.indexOf(before) >= 0 ? list.indexOf(before) : list.length;
      list.splice(at, 0, id); cv.sessions[n - 1].zones.task[b].items = list;
      return cv;
    },
    removeItem: function (canvas, id, n, b) {
      var cv = clone(canvas), l = cv.sessions[n - 1].zones.task[b].items; if (l.indexOf(id) >= 0) l.splice(l.indexOf(id), 1); return cv;
    },
    // value '' or null removes the arm's wording for that field, so the arm sees the item's own text.
    setVariant: function (canvas, id, field, arm, value) {
      var cv = clone(canvas), v = cv.variants[id] = cv.variants[id] || {}, f = v[field] = v[field] || {};
      if (value === '' || value == null) delete f[arm]; else f[arm] = value;
      if (!Object.keys(f).length) delete v[field];
      if (!Object.keys(v).length) delete cv.variants[id];
      return cv;
    }
  };

  // Codes check() reports for next that it did not report for prev: an edit is refused only for what it introduces,
  // so a study that already breaks a rule (say, a quota set on another tab) can still be edited here.
  function introduced(prev, next) {
    var had = {}; check(prev).forEach(function (r) { had[r.message] = true; });
    return check(next).filter(function (r) { return !had[r.message]; });
  }

  // What the structure lock freezes, as netlify/lib/lab/types/multimodal.mjs structureOf builds it (a test keeps the
  // two equal). Once a real participant has signed up, an edit that changes this is refused before the server sees it.
  function structure(content) {
    var c = obj(content); if (!c.builder) return null;
    var d = obj(c.design), r = obj(d.randomization), s = obj(c.survey);
    function armOnly(qs) { return arr(qs).filter(function (q) { return q && arr(q.conditions).length; }).map(function (q) { return [q.id, q.conditions]; }); }
    return { v: c.builder.v == null ? null : c.builder.v, arms: arr(d.conditions).map(function (x) { return x.id; }), assignAt: d.assignAtSession || 1,
      sessions: arr(d.sessions).map(function (x) { return arr(obj(x).blocks).map(function (b) { return [b.items || [], b.pool || null]; }); }),
      armOnly: { pre: armOnly(s.pre), post: armOnly(s.post) },
      randomization: [r.method || null, r.blockSize == null ? null : r.blockSize, r.seed == null ? null : r.seed] };
  }

  root.LabBuilderModel = { decompile: decompile, compile: compile, check: check, roundTrips: roundTrips, diff: diff,
    ops: ops, canonical: canonical, introduced: introduced, structure: structure,
    VARIANT_FIELDS: VARIANT_FIELDS, MIN_ARMS: MIN_ARMS, MAX_ARMS: MAX_ARMS, VERSION: VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
