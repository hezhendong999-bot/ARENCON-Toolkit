/**
 * ARENCON FRT — Photo Outbox / BinaryOutbox (SHIM, S491)
 * ══════════════════════════════════════════════════════
 * The implementation lives in lib/data/photoOutbox.js (parameterized
 * factory, S446 extraction + S491 reconcile: the S481 backup-probe-
 * before-null repair and the S462 sourceless-ghost rescue stage are now
 * IN the lib copy — every consumer including Electric gets both). This
 * file instantiates the factory with FRT's own dependency instances
 * (each itself lib-backed as of S490d–S491d) and re-exports FRT's
 * original surface: `BinaryOutbox`, `OUTBOX_STATUS`, and the
 * window.BinaryOutbox global (per-tool opt-in in /lib/; FRT opts in,
 * preserving its diagnostic access).
 *
 * S490d rule: this shim's lib target MUST be in the SW precache list
 * (sw.js) in the same push, or it 404s offline.
 */
import { IDB } from './idb.js';
import { R2 } from './r2.js';
import { Model } from './model.js';
import { Auth } from '../shared/auth.js';
import { toast } from '../shared/toast.js';
import { createBinaryOutbox } from '../../../lib/data/photoOutbox.js';

var _o = createBinaryOutbox({
  IDB: IDB,
  R2: R2,
  Auth: Auth,
  toast: toast,
  model: Model
});

export var BinaryOutbox = _o.BinaryOutbox;
export var OUTBOX_STATUS = _o.OUTBOX_STATUS;

try { window.BinaryOutbox = BinaryOutbox; } catch (_) {}
