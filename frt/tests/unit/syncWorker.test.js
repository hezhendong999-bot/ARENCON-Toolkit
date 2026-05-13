/**
 * syncWorker.js — Background-thread serialization pure functions
 *
 * Tests the worker module's exported pure functions DIRECTLY (no real Worker
 * instantiated). This is intentional: we want to lock in that the strip
 * pattern in the worker matches the legacy inline strip pattern EXACTLY.
 *
 * If anyone ever "simplifies" stripBinaries to use a recursive scrub-all
 * pattern, these tests fail. The legacy behavior is the contract — the
 * cloud is sensitive to which fields land in the tool_data row.
 */
import { describe, it, expect } from 'vitest';
import { stripBinaries, serializePush, merge3InWorker } from '../../js/data/syncWorker.js';

describe('syncWorker.stripBinaries — legacy strip contract', () => {
  it('strips dataUrl/dataBlob/thumb/_hasLocalBlob/markup* from drawings', () => {
    const proj = {
      drawings: [{
        id: 'd1',
        name: 'A',
        dataUrl: 'data:image/png;base64,xxx',
        dataBlob: new Uint8Array([1,2,3]),
        thumb: 'data:image/jpeg;base64,yyy',
        _hasLocalBlob: true,
        markupObjects: [{ type: 'pen' }],
        markupData: 'legacy',
        keepMe: 'preserve-this'
      }]
    };
    stripBinaries(proj);
    expect(proj.drawings[0].dataUrl).toBeUndefined();
    expect(proj.drawings[0].dataBlob).toBeUndefined();
    expect(proj.drawings[0].thumb).toBeUndefined();
    expect(proj.drawings[0]._hasLocalBlob).toBeUndefined();
    expect(proj.drawings[0].markupObjects).toBeUndefined();
    expect(proj.drawings[0].markupData).toBeUndefined();
    expect(proj.drawings[0].keepMe).toBe('preserve-this');
    expect(proj.drawings[0].name).toBe('A');
  });

  it('strips dataUrl/dataBlob from photos array', () => {
    const proj = {
      photos: [
        { id: 'p1', dataUrl: 'data:...', dataBlob: 'blob', caption: 'keep' }
      ]
    };
    stripBinaries(proj);
    expect(proj.photos[0].dataUrl).toBeUndefined();
    expect(proj.photos[0].dataBlob).toBeUndefined();
    expect(proj.photos[0].caption).toBe('keep');
  });

  it('strips signature data from signatures object', () => {
    const proj = {
      signatures: {
        sigInspectorData: 'data:image/png;base64,sig1',
        sigWitnessData: 'data:image/png;base64,sig2',
        inspectorName: 'Mark',  // metadata stays
        witnessName: 'Leslie'
      }
    };
    stripBinaries(proj);
    expect(proj.signatures.sigInspectorData).toBeUndefined();
    expect(proj.signatures.sigWitnessData).toBeUndefined();
    expect(proj.signatures.inspectorName).toBe('Mark');
    expect(proj.signatures.witnessName).toBe('Leslie');
  });

  it('strips photo binaries 3 levels deep (contractors → deficiencies → observations → photos)', () => {
    const proj = {
      contractors: [{
        id: 'c1',
        deficiencies: [{
          id: 'd1',
          observations: [{
            id: 'o1',
            photos: [{ id: 'p1', dataUrl: 'X', dataBlob: 'Y', caption: 'keep' }]
          }],
          photos: [{ id: 'p2', dataUrl: 'X', dataBlob: 'Y', caption: 'def-keep' }]
        }]
      }]
    };
    stripBinaries(proj);
    const obsPhoto = proj.contractors[0].deficiencies[0].observations[0].photos[0];
    const defPhoto = proj.contractors[0].deficiencies[0].photos[0];
    expect(obsPhoto.dataUrl).toBeUndefined();
    expect(obsPhoto.caption).toBe('keep');
    expect(defPhoto.dataUrl).toBeUndefined();
    expect(defPhoto.caption).toBe('def-keep');
  });

  it('strips photo binaries from generalDeficiencies the same way', () => {
    const proj = {
      generalDeficiencies: [{
        id: 'g1',
        observations: [{
          id: 'o1',
          photos: [{ dataUrl: 'X', dataBlob: 'Y', note: 'k' }]
        }],
        photos: [{ dataUrl: 'X', dataBlob: 'Y', note: 'k2' }]
      }]
    };
    stripBinaries(proj);
    expect(proj.generalDeficiencies[0].observations[0].photos[0].dataUrl).toBeUndefined();
    expect(proj.generalDeficiencies[0].observations[0].photos[0].note).toBe('k');
    expect(proj.generalDeficiencies[0].photos[0].dataUrl).toBeUndefined();
  });

  it('handles missing optional fields without throwing', () => {
    expect(() => stripBinaries({})).not.toThrow();
    expect(() => stripBinaries({ drawings: undefined })).not.toThrow();
    expect(() => stripBinaries({ contractors: null })).not.toThrow();
  });
});

describe('syncWorker.serializePush', () => {
  it('returns { strippedData, jsonBody } and does not mutate input', () => {
    const proj = {
      projectInfo: { client: 'Acme' },
      drawings: [{ id: 'd1', dataUrl: 'X' }],
      photos: [{ id: 'p1', dataBlob: 'Y' }]
    };
    const before = JSON.stringify(proj);
    const { strippedData, jsonBody } = serializePush(proj);

    // Input untouched
    expect(JSON.stringify(proj)).toBe(before);

    // strippedData is a fresh copy with binaries removed
    expect(strippedData.drawings[0].dataUrl).toBeUndefined();
    expect(strippedData.photos[0].dataBlob).toBeUndefined();
    expect(strippedData.projectInfo.client).toBe('Acme');

    // jsonBody is the stringified stripped version
    expect(typeof jsonBody).toBe('string');
    expect(JSON.parse(jsonBody).drawings[0].dataUrl).toBeUndefined();
  });

  it('throws on invalid input (defensive contract)', () => {
    expect(() => serializePush(null)).toThrow(/required/);
    expect(() => serializePush(undefined)).toThrow(/required/);
    expect(() => serializePush('not an object')).toThrow(/required/);
  });

  it('produces output IDENTICAL to legacy inline strip+stringify pattern', () => {
    // This is the regression-anchor test. The legacy pattern in sync.js
    // push() was:  data = JSON.parse(JSON.stringify(proj)); ...inline strips...
    // serializePush MUST produce byte-identical output to that.
    const proj = {
      projectInfo: { client: 'Test' },
      drawings: [
        { id: 'd1', name: 'A', dataUrl: 'X', thumb: 'T', _hasLocalBlob: true, markupObjects: [1], markupData: 'L' },
        { id: 'd2', name: 'B' }
      ],
      photos: [{ id: 'p1', dataUrl: 'X', caption: 'c' }],
      signatures: { sigInspectorData: 'X', sigWitnessData: 'Y', inspectorName: 'I' },
      contractors: [{
        id: 'c1',
        deficiencies: [{
          id: 'd',
          observations: [{ photos: [{ dataUrl: 'X', note: 'n' }] }],
          photos: [{ dataUrl: 'X' }]
        }]
      }],
      generalDeficiencies: [{
        observations: [{ photos: [{ dataUrl: 'X', note: 'n' }] }],
        photos: [{ dataUrl: 'X' }]
      }]
    };

    // Replicate legacy inline pattern verbatim:
    const legacy = JSON.parse(JSON.stringify(proj));
    (legacy.drawings || []).forEach(function(d) {
      delete d.dataUrl; delete d.dataBlob; delete d.thumb; delete d._hasLocalBlob;
      delete d.markupObjects; delete d.markupData;
    });
    (legacy.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });
    if (legacy.signatures) {
      delete legacy.signatures.sigInspectorData;
      delete legacy.signatures.sigWitnessData;
    }
    (legacy.contractors || []).forEach(function(c) {
      (c.deficiencies || []).forEach(function(d) {
        (d.observations || []).forEach(function(o) {
          (o.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });
        });
        (d.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });
      });
    });
    (legacy.generalDeficiencies || []).forEach(function(d) {
      (d.observations || []).forEach(function(o) {
        (o.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });
      });
      (d.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; });
    });

    const { strippedData } = serializePush(proj);

    // Deep-equality: byte-for-byte the same as legacy.
    expect(JSON.stringify(strippedData)).toBe(JSON.stringify(legacy));
  });
});

describe('syncWorker.merge3InWorker — passthrough to merge.js', () => {
  it('returns same shape as direct merge3 import', () => {
    const result = merge3InWorker(
      { drawings: [{ id: 'd1', name: 'A' }] },
      { drawings: [{ id: 'd1', name: 'A' }, { id: 'd2', name: 'B' }] },
      { drawings: [{ id: 'd1', name: 'A' }, { id: 'd3', name: 'C' }] }
    );
    expect(result).toHaveProperty('merged');
    expect(result).toHaveProperty('conflicts');
    expect(result.conflicts).toEqual([]);
    expect(result.merged.drawings.map(d => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
  });
});
