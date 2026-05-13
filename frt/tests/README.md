# FRT Tests — P-9 Phase 1

Test scaffolding for the ARENCON Field Review Tool. Pure additive — the
live FRT web app is unaffected by anything here.

---

## What runs where

| Suite | Location | Purpose | Network? |
|-------|----------|---------|----------|
| **Unit** | `frt/tests/unit/` | Pure-logic tests against fake mocks | No |
| **Contracts** | `frt/tests/contracts/` | Hit real Supabase/R2 to validate mocks | Yes |

Unit tests run on every push to `main` and on every PR. They must be
fast and deterministic. If they ever start flaking from network or time
dependencies, fix the test — don't accept flakes.

Contract tests run alongside unit tests but are **non-blocking** by
design (`continue-on-error: true` in `.github/workflows/test.yml`). A
contract test failure means the mocks have drifted from production
reality — investigate and update mocks. A unit test failure means a
real regression in the code.

---

## Why these tests exist

Catches the kind of bug that bit us in S127 PUSH E: code expected
`rows.data` from a Supabase wrapper that returns rows as a flat array,
so every Hub project export silently produced `tool_data: []`. A test
asserting "Hub Download returns non-empty `tool_data`" — or, more
generally, a test asserting "Supabase wrapper returns arrays directly,
not `{data: [...]}`" — would have caught this the moment the bug was
introduced.

`frt/tests/unit/supabaseShape.test.js` and
`frt/tests/contracts/supabase.contract.test.js` together lock in
exactly this guarantee.

---

## Running tests

### Local

```bash
npm install
npm test                # all tests (unit + contracts; contracts skip if no creds)
npm run test:unit       # unit only
npm run test:contracts  # contracts only (needs SUPABASE_ANON_KEY)
npm run test:watch      # vitest watch mode for development
```

### CI

`.github/workflows/test.yml` runs both suites on every push to main and
every PR. The unit suite must pass; the contract suite reports status
but doesn't block.

Required GitHub Actions secrets:
- `SUPABASE_ANON_KEY` — already provisioned in S127 for the keepalive workflow

---

## File layout

```
frt/tests/
├── README.md                       ← this file
├── setup.js                        ← global test setup (fake-indexeddb, etc)
├── __mocks__/
│   ├── supabase.mock.js            ← fake Supabase client (FLAT ARRAY returns)
│   └── r2Worker.mock.js            ← fake Cloudflare Worker
├── unit/
│   ├── merge.test.js               ← merge.js merge3 — 3-way merge engine
│   ├── r2Client.test.js            ← r2.js — URL/key construction
│   └── supabaseShape.test.js       ← mock shape lock (PUSH-E protector)
└── contracts/
    ├── supabase.contract.test.js   ← real Supabase shape assertions
    └── r2Worker.contract.test.js   ← real R2 Worker shape assertions
```

---

## When to add a test

**Add a unit test when:**
- A new pure-logic function is written (merge, ID generation, key derivation, parsers)
- A bug is fixed in pure-logic code → add a regression test BEFORE the fix
- A data-shape contract matters (use `supabaseShape.test.js` as the pattern)

**Add a contract test when:**
- A new external service is integrated (new MCP, new Worker endpoint, new Supabase table)
- A production response shape is depended on in mock-based unit tests

**Don't add a test for:**
- DOM rendering / touch / canvas — those need Playwright E2E (P-9 Phase 2,
  not in scope this phase)
- Anything that requires the live app loaded in a browser
- Visual checks (PDF rendering quality, drawing tile rendering) — Phase 3
  visual regression, separate session

---

## What this phase explicitly does NOT cover

- **E2E browser tests** (Playwright). Pan, touch, drawing viewer,
  PDF export. P-9 Phase 2, future session.
- **Visual regression** of PDF reports. P-9 Phase 3, future session.
- **Coverage thresholds.** Coverage reporting is available via
  `vitest run --coverage` but not enforced as a CI gate yet.
- **Hub HTML inline JS.** The Hub is a single 4852-line HTML file
  with inline JS — not importable as a module. To test Hub logic
  we'd need to either extract the functions into a module or use
  Playwright. Out of scope for Phase 1.

---

## Adding a new unit test

```javascript
// frt/tests/unit/myFeature.test.js
import { describe, it, expect } from 'vitest';
import { myFunction } from '../../js/some/module.js';

describe('myFunction', () => {
  it('does the thing', () => {
    expect(myFunction(input)).toEqual(expectedOutput);
  });
});
```

Vitest auto-discovers `*.test.js` under `frt/tests/`.

---

## Adding a new contract test

```javascript
// frt/tests/contracts/myService.contract.test.js
import { describe, it, expect } from 'vitest';

const API_KEY = process.env.MY_SERVICE_KEY;
const describeIf = API_KEY ? describe : describe.skip;

describeIf('My Service contract', () => {
  it('returns the shape we expect', async () => {
    const resp = await fetch('https://real-service.example.com/endpoint');
    const body = await resp.json();
    expect(body).toHaveProperty('expectedField');
    // Assert SHAPE, not data values (data is brittle)
  });
});
```

Don't forget to add the secret to `.github/workflows/test.yml` env.

---

— P-9 Phase 1, S128.
