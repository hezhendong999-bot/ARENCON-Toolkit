/**
 * ARENCON FRT — Project photo running order (S677)
 * ════════════════════════════════════════════════
 * Mark, S677: tapping a photo from a pin, the contractor thread or the
 * activity log opened a viewer whose arrows stopped after the two or three
 * photos attached to that one spot. Only the site gallery walked the whole
 * report. Six call sites each built their own little list; this is the ONE
 * running order they now share.
 *
 * WHAT IT RETURNS: the LIVE photo records, never copies. The viewer reads
 * `_photos[idx]` and edits the record in place (caption, date, rotation,
 * never-bake strokes), so a projection here would silently discard an
 * inspector's caption edit — the S115 rule, kept.
 *
 * ORDER (report reading order, stable across calls):
 *   site photos, in project order
 *   then each deficiency in Model.getAllDeficiencies() order:
 *     its pool photos, then its thread photos, then its activity photos
 *
 * DEDUPED BY RECORD IDENTITY. A pool photo shared by two observations is one
 * photo, not two — the arrows must never show the same binary twice in a row.
 * Soft-deleted photos are excluded: they live in Recently Deleted, and the
 * trash viewer opens them one at a time on purpose.
 *
 * SCOPE IS THE CALLER'S CHOICE, NOT A FLAG IN HERE. Surfaces that want the
 * whole report call openInProject(); the pin editor in the drawing viewer
 * deliberately keeps its own short list (Mark's standing instruction) and
 * simply does not call this.
 */
import { Model } from '../data/model.js';

/* Every photo in the report, once each, in reading order. */
export function buildProjectPhotoList() {
  var proj = (Model && Model.getProject) ? Model.getProject() : null;
  if (!proj) return [];
  var out = [], seen = {};

  function add(p) {
    if (!p || p.deleted || p.purged) return;
    var key = p.id || null;
    if (key) { if (seen[key]) return; seen[key] = true; }
    else if (out.indexOf(p) !== -1) return;   // id-less legacy record: identity only
    out.push(p);
  }

  (proj.photos || []).forEach(add);

  var all = (Model.getAllDeficiencies) ? Model.getAllDeficiencies(proj) : [];
  all.forEach(function (d) {
    var defic = d && d.defic;
    if (!defic) return;
    /* The pool is the pin's own photo set; getEffectivePhotos resolves each
       observation's selection out of it, so walking the pool once covers
       every observation without emitting a photo twice. Legacy pins that
       never migrated carry photos on the observation instead — the second
       loop catches those, and `add` dedupes anything already seen. */
    (defic.photos || []).forEach(add);
    (defic.observations || []).forEach(function (o, oi) {
      var eff = (Model.getEffectivePhotos) ? Model.getEffectivePhotos(defic, oi) : (o.photos || []);
      eff.forEach(add);
      /* Contractor responses and ARENCON reviews — the thread. */
      (o.responses || []).forEach(function (e) { (e.rectPhotos || []).forEach(add); });
      (o.arenconReviews || []).forEach(function (e) { (e.followupPhotos || []).forEach(add); });
    });
    /* The activity log's own attachments. */
    (defic.activity || []).forEach(function (a) { (a.photos || []).forEach(add); });
  });

  return out;
}

/**
 * Open the viewer on `photo`, walking the whole report.
 *
 * FALLS BACK RATHER THAN GUESSES: if the tapped record is not in the running
 * order (an unusual shape, a record mid-migration), the caller's own list is
 * used exactly as before. A viewer that opens the WRONG photo is worse than
 * one whose arrows stop early, so the fallback is the safe direction.
 *
 * @param photo        the live record the inspector tapped
 * @param fallbackList the caller's own short list
 * @param fallbackIdx  the tapped photo's index within that short list
 * @param opts         passed through to the viewer (contextLabel etc.)
 * @returns true if the viewer opened
 */
export function openInProject(photo, fallbackList, fallbackIdx, opts) {
  var LB = window._frtLightbox;
  if (!LB || !LB.open) return false;
  var list = buildProjectPhotoList();
  var idx = photo ? list.indexOf(photo) : -1;
  if (idx < 0 && photo && photo.id) {
    for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id === photo.id) { idx = i; break; } }
  }
  if (idx < 0) {
    if (!fallbackList || !fallbackList.length) return false;
    LB.open(fallbackList, fallbackIdx || 0, opts || {});
    return true;
  }
  LB.open(list, idx, opts || {});
  return true;
}
