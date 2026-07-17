/* ARENCON FRT — cameraBurst.js
   S487m: FRT no longer keeps its own copy of the burst camera. This file is now
   a thin re-export of the single shared engine at lib/ui/cameraBurst.js, so FRT,
   Electric, and (after their migration) the other tools all run ONE camera.
   The prior FRT-local copy was byte-identical to lib as of S487l; collapsing to
   a re-export removes the fork entirely. Same public contract: openCameraBurst()
   resolves File[] and window.openCameraBurst is set by the shared module. */
export { openCameraBurst } from '../../../lib/ui/cameraBurst.js';
