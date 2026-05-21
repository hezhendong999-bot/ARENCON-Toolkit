# R2 RECOVERY INVENTORY — Project 4380.24 (UPDATED ANALYSIS)

**Generated:** 2026-05-20 (session 155, evening)
**Project UUID:** ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0
**Project Number:** 4380.24 Sun Pharma 114 East Dr Ph2

---

## What's where right now

| Source | Field | Count | Notes |
|---|---|---|---|
| Supabase tool_data row (`cb856f4b-b361-43d3-8605-44fd910bd735`) | drawings | 8 | Pre-today drawings only |
| Supabase tool_data row | generalDeficiencies | 9 | **Pre-today deficiencies** (all IDs use `def_1774...` to `def_1778...` format — these are your prior days' work, intact) |
| Supabase tool_data row updated_at | — | 2026-05-21T00:30:57 UTC (8:30 PM ET tonight) | Cloud was updated as recently as a few minutes ago — sync is not completely dead |
| Cloudflare R2 — drawings | drawings | 13 | Includes today's 5 newest uploads (12:05–4:45 PM ET) |
| Cloudflare R2 — photos/original | photos | 30 | **All taken today between 1:21 PM and 2:18 PM ET** |

## The cross-reference that matters

Each photo in R2 is named `defic_<deficiency-uuid>.jpg`. Comparing those UUIDs against the cloud's `generalDeficiencies` array:

- **0 photos** in R2 belong to cloud-known deficiencies. Zero overlap.
- **30 photos** in R2 belong to deficiency UUIDs the cloud has never heard of.

Those 30 unknown UUIDs use a different format (`19264e8e-...`, `1b51caa1-...`) than the cloud's older IDs (`def_1774...`). **That's because they were created today on the tablet.** The deficiency records are on the tablet's IndexedDB; only the photo blobs made it to R2.

## What this means for recovery

**Best case (highly likely):** Tablet's IndexedDB has all 30 deficiency records intact. Tomorrow we open the tablet, capture the IDB state first, then trigger one push and everything goes to cloud. Photos re-attach automatically via the `r2Key` lookup pattern — they're already in R2 under the right names.

**Worst case (unlikely but possible):** Tablet IDB has lost some records. Even then, every photo blob is in R2 with its deficiency UUID. We can reconstruct manually using R2 photo timestamps + your memory of which pin went where on which drawing.

**Important:** R2 photos don't expire. Cloud row won't lose its 9 old deficiencies. **The window we're in is recoverable in either case.**

## Tomorrow's plan (the SAFE rescue)

1. Bring the tablet to a PC with Chrome.
2. Plug it in via USB.
3. On the PC, open Chrome → `chrome://inspect/#devices` → confirm tablet shows up.
4. **Do not open the FRT yet on the tablet.** If it's already open, that's fine — just don't refresh/reload/navigate.
5. Ping me. I give you a console snippet that reads the tablet's IDB without triggering any sync.
6. We confirm tablet IDB has the 30 deficiencies. 95% chance it does.
7. We trigger one manual push. Cloud updates. Everything reconciles.

## What I am NOT doing tonight

- Not shipping any code fix. Risk of pushing a new SW that triggers an update on the tablet → could trigger a sync → could overwrite tablet IDB with cloud's stale state. Wrong sequence.
- Not pulling from cloud or modifying cloud state. The cloud's 9 older deficiencies are intact and safe; we don't touch.
- Not assuming the tablet's IDB is corrupted until I see it.

## Backup files saved tonight

- `/mnt/user-data/outputs/R2_INVENTORY_4380_24.json` — every R2 photo and drawing with key, size, upload timestamp
- `/mnt/user-data/outputs/R2_RECOVERY_REPORT_4380_24.md` — this file
- `/home/claude/work/output/cloud_row_full_4380_24.json` — full cloud `tool_data` row snapshot (for rollback if tomorrow goes sideways)

## All 30 photos uploaded today (chronological)

| # | Time (ET) | Size | Deficiency UUID | Direct URL |
|--:|----------|-----:|-----------------|------------|
| 1 | 13:21:12 | 355 KB | `ff38a2bd-5ba3-4193-8036-f06d94a7764e` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_ff38a2bd-5ba3-4193-8036-f06d94a7764e.jpg) |
| 2 | 13:21:18 | 328 KB | `61334e39-1283-47cf-aa89-71dc84d90201` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_61334e39-1283-47cf-aa89-71dc84d90201.jpg) |
| 3 | 13:21:29 | 221 KB | `50852ff6-c577-477d-a93e-b11c95f60fd1` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_50852ff6-c577-477d-a93e-b11c95f60fd1.jpg) |
| 4 | 13:32:31 | 401 KB | `1d09114c-151e-43f6-9abf-470208a4f510` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_1d09114c-151e-43f6-9abf-470208a4f510.jpg) |
| 5 | 13:32:36 | 347 KB | `1b51caa1-8d3b-448f-938b-94a367a1fb65` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_1b51caa1-8d3b-448f-938b-94a367a1fb65.jpg) |
| 6 | 13:32:46 | 225 KB | `4f2d12aa-be43-4486-a4eb-315148deb4ef` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_4f2d12aa-be43-4486-a4eb-315148deb4ef.jpg) |
| 7 | 13:32:57 | 270 KB | `d5239b94-d191-46c2-9c40-94ca8510b684` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_d5239b94-d191-46c2-9c40-94ca8510b684.jpg) |
| 8 | 13:33:09 | 215 KB | `d85b04d7-5455-4b12-982d-be36d9c47c88` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_d85b04d7-5455-4b12-982d-be36d9c47c88.jpg) |
| 9 | 13:33:46 | 229 KB | `908e5a66-bd4d-4db8-a326-f2dc14b3e97f` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_908e5a66-bd4d-4db8-a326-f2dc14b3e97f.jpg) |
| 10 | 13:34:32 | 321 KB | `d28e9e6c-8a8d-4d28-8f1d-f3d7c69b1ee7` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_d28e9e6c-8a8d-4d28-8f1d-f3d7c69b1ee7.jpg) |
| 11 | 13:34:43 | 386 KB | `e022a79a-5d47-4e99-bcc4-e998efbdae2e` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_e022a79a-5d47-4e99-bcc4-e998efbdae2e.jpg) |
| 12 | 13:34:58 | 472 KB | `c12075f0-d760-41d4-8f40-8671d617e26d` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_c12075f0-d760-41d4-8f40-8671d617e26d.jpg) |
| 13 | 13:38:47 | 227 KB | `86429623-8efe-4b1f-a8d0-98f7eec53c4a` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_86429623-8efe-4b1f-a8d0-98f7eec53c4a.jpg) |
| 14 | 13:38:53 | 222 KB | `930f372f-5be6-44a2-a42e-8091b2d3a8b9` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_930f372f-5be6-44a2-a42e-8091b2d3a8b9.jpg) |
| 15 | 13:39:07 | 167 KB | `b6f35e54-c187-4bbd-be28-f9ae323a6c51` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_b6f35e54-c187-4bbd-be28-f9ae323a6c51.jpg) |
| 16 | 13:39:26 | 164 KB | `a812c04f-4397-4e0f-a5eb-c35f04e15647` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_a812c04f-4397-4e0f-a5eb-c35f04e15647.jpg) |
| 17 | 13:40:00 | 373 KB | `e14f9391-795b-433b-a039-78851b5ff0e8` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_e14f9391-795b-433b-a039-78851b5ff0e8.jpg) |
| 18 | 13:55:23 | 292 KB | `36a86b07-7c57-4a43-b437-7ea95428e309` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_36a86b07-7c57-4a43-b437-7ea95428e309.jpg) |
| 19 | 13:55:30 | 289 KB | `21f0d692-91e6-47ee-b6bd-c51c61c410dc` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_21f0d692-91e6-47ee-b6bd-c51c61c410dc.jpg) |
| 20 | 14:05:09 | 469 KB | `e5cff17f-a383-46e2-a6f2-6f7bdcff8a1b` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_e5cff17f-a383-46e2-a6f2-6f7bdcff8a1b.jpg) |
| 21 | 14:05:30 | 459 KB | `22e57add-62d0-40ae-951f-6eb492ccf01d` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_22e57add-62d0-40ae-951f-6eb492ccf01d.jpg) |
| 22 | 14:14:13 | 315 KB | `8cf2c312-72bc-4bbc-abac-7a1c4cb892bb` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_8cf2c312-72bc-4bbc-abac-7a1c4cb892bb.jpg) |
| 23 | 14:14:21 | 327 KB | `b01db9d7-8bf9-4671-b250-7e16abf4dd52` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_b01db9d7-8bf9-4671-b250-7e16abf4dd52.jpg) |
| 24 | 14:15:08 | 342 KB | `47339711-247f-49a8-97f2-6fbb8d4a85c9` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_47339711-247f-49a8-97f2-6fbb8d4a85c9.jpg) |
| 25 | 14:16:19 | 236 KB | `932cf154-cc0e-417f-928b-73d3d128a85f` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_932cf154-cc0e-417f-928b-73d3d128a85f.jpg) |
| 26 | 14:16:44 | 204 KB | `72db857a-ab92-44fd-a234-c0d14f124a5b` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_72db857a-ab92-44fd-a234-c0d14f124a5b.jpg) |
| 27 | 14:17:12 | 290 KB | `ed779608-9ea9-4a31-863e-044434bf6569` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_ed779608-9ea9-4a31-863e-044434bf6569.jpg) |
| 28 | 14:17:20 | 360 KB | `dcf59cb8-a7fe-480a-9f40-31298594301b` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_dcf59cb8-a7fe-480a-9f40-31298594301b.jpg) |
| 29 | 14:17:29 | 436 KB | `19264e8e-0ef1-493b-b811-aaaba03f77c1` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_19264e8e-0ef1-493b-b811-aaaba03f77c1.jpg) |
| 30 | 14:18:23 | 323 KB | `4b5071e1-e37d-4980-a061-6e1a33cde0ce` | [link](https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_4b5071e1-e37d-4980-a061-6e1a33cde0ce.jpg) |

## The 9 cloud-known deficiencies (prior days, intact)

These are NOT affected by today's issue. They're listed here as reference for tomorrow's diff against tablet IDB.

| Num | ID | Drawing | pinX | pinY | Priority | Photos in cloud record |
|--:|-----|---------|-----:|-----:|----------|-----:|

| Num | ID | Drawing (last 8 chars) | pinX | pinY | Priority | Photos in cloud record |
|--:|-----|---------|-----:|-----:|----------|-----:|
| 4 | `def_1774291071594_e3r4` | `…pg1_b93w` | 0.578 | 0.096 | high | 3 |
| 5 | `def_1774293413593_dv7m` | `…pg1_tnkf` | 0.436 | 0.330 | high | 6 |
| 6 | `def_1774293648527_f782` | `…pg1_tnkf` | 0.491 | 0.384 | high | 12 |
| 7 | `def_1774293763787_asc5` | `…pg1_tnkf` | 0.585 | 0.407 | high | 7 |
| 8 | `def_1774293843850_7x6h` | `…pg1_tnkf` | 0.675 | 0.399 | high | 4 |
| 10 | `def_1774356379910_8xwz` | `…pg1_b93w` | 0.309 | 0.667 | general | 0 |
| 2 | `def_1774289166367_cc1n` | `…pg1_b93w` | 0.689 | 0.316 | high | 2 |
| 1 | `def_1774274841184_uyhs` | `…pg1_b93w` | 0.498 | 0.288 | general | 0 |
| 12 | `def_1778043235076_tfs9` | `…None` | null | null | general | 0 |
