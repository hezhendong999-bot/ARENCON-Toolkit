/* lib/data/changeJournal.js — what did that save actually do?
 * ═══════════════════════════════════════════════════════════════════════════
 * S555 — stage one of change-based sync. RECORDS ONLY. Nothing about how a
 * report is saved or merged changes here, on purpose: the journal has to be
 * proven against real inspections before anything is allowed to depend on it.
 *
 * THE PROBLEM IT EXISTS FOR. Today a device sends its entire picture of the
 * report and hopes. When Franz's report was wiped on 7155.40, the save that did
 * it looked exactly like every other save — a complete document, written over a
 * complete document. Nothing recorded that this particular one had arrived
 * carrying 0 photos where the last one carried 223. The evidence had to be dug
 * out of history rows afterwards, and six flow readings were never recovered.
 *
 * WHAT THIS RECORDS. One small entry per save: what each collection went from
 * and to, who was at the device, which build, and — the part that matters —
 * whether anything got dramatically SMALLER. A wipe has a signature, and the
 * signature is visible at the instant it happens rather than a week later.
 *
 * WHAT IT DOES NOT DO YET, and must not until it has earned it:
 *   - block or alter a save
 *   - travel to the server
 *   - feed the merge
 * Those are stages two and three. A guard that fires on a rule nobody has
 * watched in the field is how you get inspectors unable to save on site.
 *
 * COST DISCIPLINE. This runs on every autosave, behind someone typing. It never
 * deep-compares the report and never touches photo bytes — it counts, and
 * counting is cheap. Everything is wrapped: a journal failure must never cost
 * a save.
 * ═══════════════════════════════════════════════════════════════════════════ */

var STORE = 'changeJournal';

/** A collection went from n to m. Anything that loses more than this share of
 *  its contents in a single save is worth a human looking at it. */
var DROP_FRACTION = 0.34;   /* a third gone at once */
var DROP_MINIMUM  = 3;      /* ignore noise on tiny collections */

/**
 * @param {object} config
 *   IDB         required — put(store,rec), getAll(store), delete(store,key)
 *   collections required — (state) => ({ name: array|object, … })
 *                          The tool says what its own report is made of; the
 *                          journal has no idea what a "flow reading" is.
 *   whoami      optional — () => string
 *   build       optional — () => string
 *   keep        optional — how many entries to retain (default 400)
 *   tag         optional — console prefix
 */
export function createChangeJournal(config) {
  config = config || {};
  var IDB   = config.IDB;
  var shape = config.collections;
  var whoami = config.whoami || function () { return ''; };
  var build  = config.build  || function () { return ''; };
  var KEEP   = config.keep || 400;
  var TAG    = config.tag || '[journal]';

  var _last = null;      // last measurement, this session only
  var _busy = false;

  function _measure(state) {
    var out = {};
    if (!shape || !state) return out;
    var cols;
    try { cols = shape(state) || {}; } catch (e) { return out; }
    Object.keys(cols).forEach(function (k) {
      var v = cols[k];
      if (v == null) { out[k] = 0; return; }
      if (typeof v === 'number') { out[k] = v; return; }   // tool counted it itself
      if (Array.isArray(v)) { out[k] = v.length; return; }
      if (typeof v === 'object') { out[k] = Object.keys(v).length; return; }
      out[k] = v ? 1 : 0;
    });
    return out;
  }

  /** Compare two measurements. Returns the changes and, separately, the losses
   *  big enough that a person should know. */
  function _diff(before, after) {
    var changes = [], losses = [];
    var keys = {};
    Object.keys(before || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(after  || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var a = (before && before[k]) || 0, b = (after && after[k]) || 0;
      if (a === b) return;
      changes.push({ k: k, from: a, to: b });
      var lost = a - b;
      if (lost >= DROP_MINIMUM && a > 0 && (lost / a) >= DROP_FRACTION) {
        losses.push({ k: k, from: a, to: b, lost: lost });
      }
    });
    return { changes: changes, losses: losses };
  }

  function _trim() {
    return IDB.getAll(STORE).then(function (rows) {
      rows = (rows || []).sort(function (x, y) { return (y.at || 0) - (x.at || 0); });
      var chain = Promise.resolve();
      rows.slice(KEEP).forEach(function (r) {
        chain = chain.then(function () { return IDB['delete'](STORE, r.id); });
      });
      return chain;
    }).catch(function () {});
  }

  /** Call after each save, with the state that was just written.
   *  Returns the entry (or null when nothing changed) — never throws. */
  function record(state, why) {
    if (_busy || !IDB || !shape) return Promise.resolve(null);
    _busy = true;
    var entry = null;
    return Promise.resolve().then(function () {
      var now = _measure(state);
      if (!_last) { _last = now; return null; }     // first save is the baseline
      var d = _diff(_last, now);
      _last = now;
      if (!d.changes.length) return null;
      entry = {
        id: 'j' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        at: Date.now(),
        by: whoami() || '',
        build: build() || '',
        why: why || '',
        changes: d.changes,
        losses: d.losses
      };
      if (d.losses.length) {
        // Loud on purpose. This is the shape a wipe makes.
        console.warn(TAG + ' LARGE LOSS in one save: ' +
          d.losses.map(function (l) { return l.k + ' ' + l.from + '\u2192' + l.to; }).join(', '));
      }
      return IDB.put(STORE, entry).then(_trim).then(function () { return entry; });
    }).catch(function (e) {
      console.warn(TAG + ' not recorded:', e && (e.message || e));
      return null;
    }).then(function (r) { _busy = false; return r; });
  }

  /** Newest first. For the on-screen readout. */
  function history(limit) {
    return IDB.getAll(STORE).then(function (rows) {
      rows = (rows || []).sort(function (x, y) { return (y.at || 0) - (x.at || 0); });
      return rows.slice(0, limit || 40);
    }).catch(function () { return []; });
  }

  /** Every entry that lost a lot at once — the thing worth reviewing. */
  function lossHistory(limit) {
    return history(400).then(function (rows) {
      return rows.filter(function (r) { return r.losses && r.losses.length; }).slice(0, limit || 20);
    });
  }

  /** Reset the in-session baseline. Call when a DIFFERENT report is loaded, or
   *  the first save of the new one reads as though everything vanished. */
  function rebase(state) { _last = _measure(state); }

  /** S565 — write a free-form entry into the same store (e.g. a cloud-push
   *  record). Same retention, same read path, still RECORDS ONLY. The caller
   *  supplies the fields; the journal supplies id/at/by/build. Never throws. */
  function note(extra) {
    if (!IDB) return Promise.resolve(null);
    var entry = Object.assign({
      id: 'j' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      at: Date.now(),
      by: whoami() || '',
      build: build() || ''
    }, extra || {});
    return IDB.put(STORE, entry).then(_trim).then(function () { return entry; })
      .catch(function (e) { console.warn(TAG + ' note not recorded:', e && (e.message || e)); return null; });
  }

  return { record: record, history: history, lossHistory: lossHistory,
           rebase: rebase, note: note, storeName: STORE };
}
