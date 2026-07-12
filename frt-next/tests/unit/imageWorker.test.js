/**
 * imageWorker.js — S130 5.4 off-thread image compression
 *
 * jsdom has no createImageBitmap, OffscreenCanvas, or convertToBlob, so the
 * actual worker compression path isn't unit-testable here — that's covered
 * by Playwright smoke tests against the live deployed site. What we lock in:
 *
 *   1. calcResize: pure aspect-ratio math (used by both worker and fallback)
 *   2. ImageWorkerHost public API surface + boot/diag plumbing
 *
 * The fallback's HTML <canvas>.toDataURL path isn't tested here either —
 * jsdom's canvas returns a stub string and the test would lock in jsdom
 * behavior, not real behavior.
 */
import { describe, it, expect } from 'vitest';
import { calcResize } from '../../js/workers/imageWorker.js';
import { ImageWorkerHost } from '../../js/workers/imageWorkerHost.js';

describe('imageWorker.calcResize — aspect-ratio math', () => {
  it('returns input unchanged when w <= maxW', () => {
    expect(calcResize(800, 600, 1600)).toEqual({ w: 800, h: 600 });
    expect(calcResize(1600, 1200, 1600)).toEqual({ w: 1600, h: 1200 });
  });

  it('scales width to maxW and height proportionally', () => {
    // 3200 × 2400 (4:3) capped at 1600 → 1600 × 1200
    expect(calcResize(3200, 2400, 1600)).toEqual({ w: 1600, h: 1200 });
  });

  it('rounds height to the nearest integer', () => {
    // 3000 × 1999 capped at 1600 → 1600 × round(1999 * 1600 / 3000) = 1600 × 1066
    expect(calcResize(3000, 1999, 1600)).toEqual({ w: 1600, h: 1066 });
  });

  it('handles landscape and portrait the same (width is the cap dimension)', () => {
    // Tall portrait — capped on width only
    expect(calcResize(2400, 4800, 1200)).toEqual({ w: 1200, h: 2400 });
  });

  it('preserves aspect ratio under a wide range of inputs', () => {
    var cases = [
      [4000, 3000, 1600],
      [4032, 3024, 1600], // iPhone XS rear cam
      [5712, 4284, 1600],
      [1920, 1080, 1200],
      [800, 800, 200]
    ];
    cases.forEach(function(c) {
      var r = calcResize(c[0], c[1], c[2]);
      // Width matches cap (or stays unchanged if under)
      expect(r.w).toBe(Math.min(c[0], c[2]));
      // Aspect ratio preserved within 1px rounding tolerance
      var origRatio = c[0] / c[1];
      var newRatio = r.w / r.h;
      expect(Math.abs(origRatio - newRatio)).toBeLessThan(0.01);
    });
  });

  it('returns a safe shape on bad input (defensive)', () => {
    expect(calcResize(0, 0, 1600)).toEqual({ w: 0, h: 0 });
    expect(calcResize(800, 600, 0)).toEqual({ w: 800, h: 600 });
  });
});

describe('ImageWorkerHost — public API surface', () => {
  it('exposes compressFile, isWorkerAvailable, _diag', () => {
    expect(typeof ImageWorkerHost.compressFile).toBe('function');
    expect(typeof ImageWorkerHost.isWorkerAvailable).toBe('function');
    expect(typeof ImageWorkerHost._diag).toBe('object');
  });

  it('isWorkerAvailable returns false in jsdom (no OffscreenCanvas)', () => {
    // jsdom doesn't define OffscreenCanvas, so the boot probe should fail
    // and the host should report worker as unavailable.
    expect(ImageWorkerHost.isWorkerAvailable()).toBe(false);
  });

  it('_diag tracks lastError when worker boot fails', () => {
    ImageWorkerHost.isWorkerAvailable();
    expect(ImageWorkerHost._diag.lastError).toBeTruthy();
    expect(ImageWorkerHost._diag.workerOK).toBe(false);
  });
});
