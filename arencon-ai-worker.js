/**
 * ARENCON AI Writing Assistant — Cloudflare Worker
 * Proxies requests to Anthropic API, validates auth, logs usage.
 *
 * Environment Variables (set as Secrets in Cloudflare Dashboard):
 *   ANTHROPIC_API_KEY    — Anthropic API key (sk-ant-...)
 *   SUPABASE_URL         — https://xsemvinxsyphjiaqgywv.supabase.co
 *   SUPABASE_SERVICE_KEY — Supabase service_role key (for tamper-proof usage logging)
 *
 * Deploy: Cloudflare Dashboard → Workers → arencon-ai-worker → Edit Code → paste this → Deploy
 * URL: https://arencon-ai-worker.hezhendong999.workers.dev
 *
 * FIXED in Session 60: Added ctx parameter + ctx.waitUntil() for usage logging.
 * Without waitUntil(), Cloudflare kills the logging fetch when the main response returns.
 */

const ALLOWED_ORIGINS = [
  'https://hezhendong999-bot.github.io',
  'http://localhost',
  'http://127.0.0.1'
];

const PROMPT_REWRITE = `You are a senior fire protection engineer writing formal inspection reports for ARENCON Inc. in Ontario, Canada.

Inspectors write quick, terse field notes during site visits. Your job is to REWRITE these into polished, professional language suitable for a formal Field Review Report that gets sent to clients, contractors, and authorities having jurisdiction.

REWRITE RULES:
- Transform shorthand and fragments into clear, complete, professional sentences
- Use proper fire protection terminology (NFPA 13, NFPA 25, NFPA 72, OBC, ULC standards)
- Expand abbreviations: "sprkl" → "sprinkler", "FD" → "fire damper", "FA" → "fire alarm"
- INTELLIGENTLY interpret measurements based on context and add proper units/format. For example: if talking about ceiling height or deflector position, "45-4" likely means 45'-4" A.F.F. If talking about clearance, "1 inch" stays "1 inch". Use your fire protection knowledge to infer what makes sense.
- Use passive professional tone: "was observed" not "I saw"
- Keep contractor names, dates, and reference numbers exactly as written
- If a note references an NFPA or OBC section, keep the reference. If an obvious code violation applies, you may add the relevant code reference.
- Each rewritten observation should be 1-3 clear sentences
- Do NOT invent findings that aren't implied by the original note
- Do NOT change the technical meaning or severity of the finding

EXAMPLES:
- "Sprinkler deflector at 45-4 light at 45-6 and ceiling is 46" → "Sprinkler deflector is located at 45'-4" A.F.F. Light fixture is at 45'-6" A.F.F. and ceiling is at 46'-0" A.F.F."
- "fire damper not install at corridor penetration on 3rd floor" → "Fire damper has not been installed at the corridor penetration on the 3rd floor."
- "deflector too close to ceiling need 1 inch min" → "Sprinkler deflector does not meet minimum clearance to ceiling. A minimum of 1 inch clearance is required per NFPA 13."
- "contractor says will be done next week" → "Contractor has indicated that the work is expected to be completed within the following week."
- "missing escutcheon plate rm 204" → "Escutcheon plate is missing at Room 204."

If the text is ALREADY professional and well-written, return the SAME text unchanged in the "improved" field, with changes = "no changes needed". The "improved" field is MANDATORY for every entry — never omit it.

Respond with ONLY valid JSON — no markdown, no backticks:
[
  {
    "id": "field_id",
    "improved": "The professionally rewritten text (or the ORIGINAL TEXT VERBATIM if no changes needed — never empty).",
    "changes": "Brief description of what was improved, or 'no changes needed'"
  }
]`;

const PROMPT_QUICKFIX = `You are a proofreader for fire protection inspection field notes at ARENCON Inc.

Your job is ONLY to fix typos, spelling errors, and obvious grammar mistakes. Do NOT rewrite, restructure, or add anything.

RULES:
- Fix spelling errors: "sprinklr" → "sprinkler", "instal" → "install"
- Fix obvious typos: "teh" → "the", "adn" → "and"
- Fix verb forms: "not install" → "not installed", "is need" → "is needed"
- Fix capitalization at the start of notes
- Do NOT add periods to fragments — field notes are intentionally terse
- Do NOT rewrite or restructure sentences
- Do NOT add words, articles, or prepositions that weren't there
- Do NOT change measurements, numbers, or abbreviations
- Do NOT expand abbreviations
- Do NOT add code references
- If the text has no typos or grammar issues, return it UNCHANGED in the "improved" field. The "improved" field is MANDATORY for every entry — never omit it, even when no changes are made.

Respond with ONLY valid JSON — no markdown, no backticks:
[
  {
    "id": "field_id",
    "improved": "Text with only typos fixed (or the ORIGINAL TEXT VERBATIM if nothing to fix — never empty).",
    "changes": "Brief note or 'no changes needed'"
  }
]`;

// S116 Push 4: shorten mode for the AI scratchpad's "✂ Shorten" button
// (existed in the client since S114 P1.6 but the worker never recognized
// the mode, so the button returned 400 errors). Used to compress AI-rewritten
// text by 30-50% without losing facts/measurements/code references.
//
// Returns SAME JSON shape as PROMPT_REWRITE so the client can consume it
// uniformly (data.suggestions[0].improved). Uses Haiku because it's a
// pure compression task — Sonnet's reasoning depth is unnecessary cost.
const PROMPT_SHORTEN = `You are an editor for fire protection inspection reports at ARENCON Inc.

Your job is to SHORTEN text by 30-50% while preserving every fact, measurement, code reference, and finding.

RULES:
- Compress by removing redundancy, padding phrases, and unnecessary qualifiers
- Preserve EVERY measurement, code reference (NFPA, OBC, ULC), date, contractor name, room/location identifier
- Preserve the technical meaning and severity of every finding
- Keep professional fire protection terminology
- Use passive professional tone consistent with the original
- Do NOT add commentary, explanations, or new findings
- Do NOT change measurements, numbers, or technical references
- If the text is already concise (under ~30 words and no obvious padding), return the ORIGINAL TEXT VERBATIM in the "improved" field with changes = "already concise". The "improved" field is MANDATORY — never omit it.

Respond with ONLY valid JSON — no markdown, no backticks:
[
  {
    "id": "field_id",
    "improved": "The shortened text, preserving all facts and references (or ORIGINAL TEXT VERBATIM if already concise — never empty).",
    "changes": "Brief note or 'already concise'"
  }
]`;

const PROMPT_PHOTO_SUGGEST = `You are a senior fire protection engineer at ARENCON Inc. in Ontario, Canada. An inspector has taken photo(s) at a site and wants a suggested deficiency description for a Field Review Report.

Analyze the photo(s) and suggest a concise, professional deficiency description using proper fire protection terminology (NFPA 13, 25, 72, OBC, ULC standards).

RULES:
- Be specific about what you can see in the photo — component, location, condition
- Use proper terminology: "sprinkler deflector", "fire damper", "escutcheon plate", "FAP device", etc.
- 1-3 professional sentences, suitable for a formal report sent to clients/AHJs
- If the photo clearly shows a code violation, reference the relevant NFPA/OBC section
- If existing observation text is provided, use it as context but improve/extend it
- Do NOT invent findings not visible in the photo
- Do NOT guess measurements — if distances aren't clearly visible, don't specify them
- If the photo is unclear or doesn't show a deficiency, respond: "Unable to identify a clear deficiency from this photo. Please add additional context or retake the photo."

Respond with ONLY valid JSON — no markdown, no backticks:
{
  "suggestion": "The professional deficiency description text.",
  "confidence": "high|medium|low",
  "notes": "Brief reasoning or caveats"
}`;

// S314 — placard_read mode. Reads a fire pump nameplate/placard photo and
// extracts the RATED values for the commissioning flow-test charts. Output
// space is strictly numeric+null so the frontend can preview-then-confirm
// (the technologist verifies before anything is written — tools capture
// data, they don't certify it).
const PROMPT_PLACARD_READ = `You are a data-extraction assistant reading FIRE PUMP nameplates/placards for commissioning flow tests at ARENCON Inc. in Ontario, Canada.

You may receive SEVERAL photos of the SAME placard taken from different angles
because of glare/reflection — cross-reference all of them; a value readable in
any one photo counts. If two photos disagree on the same value, return null for
that value and explain the conflict in "notes" — NEVER pick one arbitrarily.

DOMAIN FACTS (from ARENCON's technologist):
- A fire pump placard prints exactly THREE pressure points regardless of PLD/VFD:
  churn/shutoff at 0% flow, rated pressure at 100%, and the 150% (max flow /
  minimum pressure) point. It NEVER prints 25/50/75/125% values — do not invent them.
- The photos may include a SECOND, separate placard: the engine / pressure-limiting
  device placard (e.g. Clark engine plate on diesels; "VFD" on electrics, often a
  darker plate). Its CONTROL PRESSURE (sometimes "control pressure setting") is a
  distinct value — report it as pld_control_pressure_psi. Never confuse it with the
  pump placard's rated pressure.
- CRITICAL: the engine/PLD placard ALSO prints its own "Rated Speed" (the ENGINE
  speed, e.g. 1760 RPM on a Clarke plate). That is NOT the pump rated speed.
  rated_speed_rpm must come ONLY from the pump placard. If only an engine placard
  is visible, return null for rated_speed_rpm.
- Pump placards often appear in PAIRS (e.g. an FM silver plate and a ULC brass
  plate) with the same values — agreement between them raises confidence.

Extract ONLY:
- Rated flow / rated capacity in US gpm (pump placard)
- Rated pressure / rated head in psi (the 100% point, pump placard)
- Rated speed in RPM (pump placard)
- Churn / shutoff pressure in psi (0% point, pump placard), if printed
- Pressure at 150% rated flow in psi (pump placard), if printed
- Control pressure in psi from the engine/PLD/VFD placard, if such a placard is present

RULES:
- Report only values you can clearly read on the placard. If a value is missing, unreadable, or ambiguous, return null for it — NEVER guess.
- If rated head is printed in FEET (ft), convert to psi (ft × 0.433), round to 1 decimal, and state the conversion in "notes".
- If flow is printed in L/min or m³/h, convert to US gpm (L/min × 0.2642; m³/h × 4.403) and state the conversion in "notes".
- Ignore motor/engine nameplates, relief valve tags, and controller labels — only the PUMP rated point.
- If the photo is not a pump placard or is unreadable, return all nulls with confidence "low" and explain in "notes".

Respond with ONLY valid JSON — no markdown, no backticks:
{
  "rated_flow_gpm": number or null,
  "rated_pressure_psi": number or null,
  "rated_speed_rpm": number or null,
  "churn_pressure_psi": number or null,
  "pressure_at_150_psi": number or null,
  "pld_control_pressure_psi": number or null,
  "confidence": "high|medium|low",
  "notes": "What you read, any conversions, any caveats"
}`;


// S130 — auto_group mode. Takes observations (id + description) and a
// fixed group catalog. Classifies each observation into one of the allowed
// catalog entries. Sonnet because synthesis-of-meaning is still part of
// the task (interpret the field-note shorthand) but the OUTPUT space is
// constrained, which makes the result reliable.
//
// Input shape: { mode:'auto_group', deficiencies:[{id,description}],
//                groupCatalog:[<allowed titles>], context:{...} }
// Output shape: { groups:[{title, deficiency_ids:[...]}], _validation, usage }
// where every `title` in output MUST appear in the input catalog.
const PROMPT_AUTO_GROUP = `You are a senior fire protection engineer at ARENCON Inc. organizing a Field Review Report.

The inspector has logged a list of observations. Your job: assign each observation to ONE of the report sections in the ALLOWED GROUPS list provided in the user message.

CRITICAL RULES:
- The ALLOWED GROUPS list is fixed. You MUST use group titles EXACTLY as listed — same spelling, same capitalization. Do NOT invent new groups. Do NOT rephrase the titles.
- Every observation id from the input MUST appear in EXACTLY ONE group. No duplicates, no omissions.
- Skip empty groups in the output — only include groups that have at least 1 observation.
- Use proper fire protection terminology (NFPA 13, 25, 72, OBC, ULC) to reason about which group an observation belongs to.
- Examples of typical placement:
  · "sprinkler deflector too close to ceiling" → Automatic Sprinkler Protection
  · "smoke detector spacing exceeds 9m" → Fire Alarm and Detection
  · "FD-3 fire damper missing at penetration" → Fire Separations and Penetrations
  · "diesel pump weekly run test not logged" → Fire Pump
  · "exit door does not swing in direction of egress" → Egress Systems (if present in catalog) or General
- If an observation genuinely doesn't fit any listed group (very rare), put it in "General" (or the closest catch-all in the catalog).

Input format:
{
  "allowed_groups": ["Title 1", "Title 2", ...],
  "items": [{"id": "...", "description": "..."}, ...]
}

Respond with ONLY valid JSON — no markdown, no backticks:
{
  "groups": [
    {
      "title": "EXACT title from allowed_groups",
      "deficiency_ids": ["id1", "id2", ...]
    }
  ]
}`;


const MODELS = {
  rewrite: { id: 'claude-sonnet-4-20250514', inputRate: 0.000003, outputRate: 0.000015 },
  quickfix: { id: 'claude-haiku-4-5-20251001', inputRate: 0.00000025, outputRate: 0.00000125 }
};

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin && origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

export default {
  // FIX: Added ctx (ExecutionContext) — third parameter
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    // Only POST allowed
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    try {
      // 1. Validate Supabase JWT — get user info
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401, headers);
      }
      const jwt = authHeader.replace('Bearer ', '');

      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': env.SUPABASE_SERVICE_KEY }
      });
      if (!userRes.ok) {
        return jsonResponse({ error: 'Invalid or expired auth token' }, 401, headers);
      }
      const userData = await userRes.json();
      const userId = userData.id;
      const userEmail = userData.email;

      // 2. Parse request body
      const body = await request.json();
      const { fields, context, mode, photos, existingText } = body;

      // Branch: photo suggest mode
      if (mode === 'photo_suggest') {
        if (!photos || !Array.isArray(photos) || photos.length === 0) {
          return jsonResponse({ error: 'No photos provided' }, 400, headers);
        }
        if (photos.length > 4) {
          return jsonResponse({ error: 'Too many photos (max 4 per request)' }, 400, headers);
        }

        // Build vision content blocks
        const contentBlocks = [];
        for (const ph of photos) {
          if (!ph.data || !ph.media_type) {
            return jsonResponse({ error: 'Each photo must have {data, media_type}' }, 400, headers);
          }
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: ph.media_type, data: ph.data }
          });
        }
        let promptText = 'Please analyze the photo(s) above and suggest a deficiency description.';
        if (existingText && existingText.trim()) {
          promptText += '\n\nExisting observation text (please improve/extend, do not just repeat):\n' + existingText.trim();
        }
        contentBlocks.push({ type: 'text', text: promptText });

        const visionModel = MODELS.rewrite; // Sonnet supports vision
        const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: visionModel.id,
            max_tokens: 1024,
            system: PROMPT_PHOTO_SUGGEST,
            messages: [{ role: 'user', content: contentBlocks }]
          })
        });

        if (!visionRes.ok) {
          const errText = await visionRes.text();
          console.error('Anthropic vision error:', visionRes.status, errText);
          return jsonResponse({ error: 'AI vision service error', detail: visionRes.status }, 502, headers);
        }

        const visionData = await visionRes.json();
        const visionText = visionData.content.filter(c => c.type === 'text').map(c => c.text).join('');
        let parsed;
        try {
          const cleaned = visionText.replace(/```json|```/g, '').trim();
          parsed = JSON.parse(cleaned);
        } catch (e) {
          console.error('Failed to parse vision response:', visionText);
          return jsonResponse({ error: 'AI returned invalid format', raw: visionText }, 500, headers);
        }

        const vUsage = visionData.usage || {};
        const vInputTokens = vUsage.input_tokens || 0;
        const vOutputTokens = vUsage.output_tokens || 0;
        const vCostUsd = (vInputTokens * visionModel.inputRate) + (vOutputTokens * visionModel.outputRate);

        // Log usage
        if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
          const vLogPayload = {
            user_id: userId,
            user_email: userEmail,
            tool: context?.tool || 'unknown',
            project_number: context?.projectNumber || null,
            project_name: context?.projectName || null,
            action: 'photo_suggest',
            model: visionModel.id,
            input_tokens: vInputTokens,
            output_tokens: vOutputTokens,
            cost_usd: vCostUsd,
            field_count: photos.length,
            accepted_count: null
          };
          const vLogPromise = fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage_log`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(vLogPayload)
          }).catch(err => console.error('Usage log failed:', err));
          ctx.waitUntil(vLogPromise);
        }

        return jsonResponse({
          suggestion: parsed.suggestion || '',
          confidence: parsed.confidence || 'medium',
          notes: parsed.notes || '',
          usage: {
            input_tokens: vInputTokens,
            output_tokens: vOutputTokens,
            cost_usd: Math.round(vCostUsd * 1000000) / 1000000
          }
        }, 200, headers);
      }

      // S314 — Branch: placard read mode (Diesel/Electric commissioning rated values)
      if (mode === 'placard_read') {
        if (!photos || !Array.isArray(photos) || photos.length === 0) {
          return jsonResponse({ error: 'No photos provided' }, 400, headers);
        }
        if (photos.length > 6) {
          return jsonResponse({ error: 'Too many photos (max 6 per request)' }, 400, headers);
        }
        const pBlocks = [];
        for (const ph of photos) {
          if (!ph.data || !ph.media_type) {
            return jsonResponse({ error: 'Each photo must have {data, media_type}' }, 400, headers);
          }
          pBlocks.push({ type: 'image', source: { type: 'base64', media_type: ph.media_type, data: ph.data } });
        }
        pBlocks.push({ type: 'text', text: 'The photo(s) above show the SAME fire pump placard, possibly from different angles. Cross-reference them and extract the values.' });

        const pModel = MODELS.rewrite; // Sonnet — vision
        const pRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: pModel.id,
            max_tokens: 512,
            system: PROMPT_PLACARD_READ,
            messages: [{ role: 'user', content: pBlocks }]
          })
        });
        if (!pRes.ok) {
          const errText = await pRes.text();
          console.error('Anthropic placard vision error:', pRes.status, errText);
          return jsonResponse({ error: 'AI vision service error', detail: pRes.status }, 502, headers);
        }
        const pData = await pRes.json();
        const pText = pData.content.filter(c => c.type === 'text').map(c => c.text).join('');
        let pParsed;
        try {
          pParsed = JSON.parse(pText.replace(/```json|```/g, '').trim());
        } catch (e) {
          console.error('Failed to parse placard response:', pText);
          return jsonResponse({ error: 'AI returned invalid format', raw: pText }, 500, headers);
        }
        const pUsage = pData.usage || {};
        const pIn = pUsage.input_tokens || 0, pOut = pUsage.output_tokens || 0;
        const pCost = (pIn * pModel.inputRate) + (pOut * pModel.outputRate);
        if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
          const pLog = fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage_log`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              user_id: userId, user_email: userEmail,
              tool: context?.tool || 'diesel_pump',
              project_number: context?.projectNumber || null,
              project_name: context?.projectName || null,
              action: 'placard_read', model: pModel.id,
              input_tokens: pIn, output_tokens: pOut, cost_usd: pCost,
              field_count: photos.length, accepted_count: null
            })
          }).catch(err => console.error('Usage log failed:', err));
          ctx.waitUntil(pLog);
        }
        const pNum = (v) => (typeof v === 'number') ? v : null;
        return jsonResponse({
          rated_flow_gpm: pNum(pParsed.rated_flow_gpm),
          rated_pressure_psi: pNum(pParsed.rated_pressure_psi),
          rated_speed_rpm: pNum(pParsed.rated_speed_rpm),
          churn_pressure_psi: pNum(pParsed.churn_pressure_psi),
          pressure_at_150_psi: pNum(pParsed.pressure_at_150_psi),
          pld_control_pressure_psi: pNum(pParsed.pld_control_pressure_psi),
          confidence: pParsed.confidence || 'medium',
          notes: pParsed.notes || '',
          usage: { input_tokens: pIn, output_tokens: pOut, cost_usd: Math.round(pCost * 1000000) / 1000000 }
        }, 200, headers);
      }

      // S130 — auto_group mode. Input shape:
      //   { mode: 'auto_group',
      //     deficiencies: [{id, description}, ...]   (these are observations,
      //       composite ids "<deficId>:<obsIdx>"; client builds them),
      //     groupCatalog: [<allowed titles>],
      //     context: {tool, projectNumber, projectName} }
      // Returns { groups: [{title, deficiency_ids}], _validation, usage }
      if (mode === 'auto_group') {
        const deficiencies = body.deficiencies;
        if (!deficiencies || !Array.isArray(deficiencies) || deficiencies.length === 0) {
          return jsonResponse({ error: 'No observations provided' }, 400, headers);
        }
        if (deficiencies.length < 3) {
          return jsonResponse({ error: 'Need at least 3 observations to group meaningfully' }, 400, headers);
        }
        if (deficiencies.length > 200) {
          return jsonResponse({ error: 'Too many observations (max 200 per request)' }, 400, headers);
        }
        for (const d of deficiencies) {
          if (!d || typeof d.id !== 'string' || typeof d.description !== 'string') {
            return jsonResponse({ error: 'Each item must have {id: string, description: string}' }, 400, headers);
          }
        }
        // Catalog: client provides; worker enforces. Strip empties + cap length.
        let catalog = Array.isArray(body.groupCatalog) ? body.groupCatalog : [];
        catalog = catalog.map(s => String(s || '').trim()).filter(s => s.length > 0);
        if (catalog.length === 0) {
          // Fallback default — keep worker self-sufficient if client misbehaves.
          catalog = [
            'Automatic Sprinkler Protection',
            'Standpipe Systems',
            'Fire Pump',
            'Fire Alarm and Detection',
            'Smoke Control / Ventilation',
            'Emergency Lighting and Power',
            'Fire Separations and Penetrations',
            'General'
          ];
        }
        if (catalog.length > 30) {
          return jsonResponse({ error: 'Catalog too large (max 30 groups)' }, 400, headers);
        }

        const groupModel = MODELS.rewrite;
        const userPayload = {
          allowed_groups: catalog,
          items: deficiencies.map(d => ({
            id: d.id,
            description: (d.description || '').slice(0, 500)
          }))
        };

        const groupRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: groupModel.id,
            max_tokens: 4096,
            system: PROMPT_AUTO_GROUP,
            messages: [{ role: 'user', content: JSON.stringify(userPayload) }]
          })
        });

        if (!groupRes.ok) {
          const errText = await groupRes.text();
          console.error('Anthropic API error (auto_group):', groupRes.status, errText);
          return jsonResponse({ error: 'AI service error', detail: groupRes.status }, 502, headers);
        }

        const groupData = await groupRes.json();
        const groupText = (groupData.content || [])
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');

        let groupJson;
        try {
          const cleaned = groupText.replace(/```json|```/g, '').trim();
          groupJson = JSON.parse(cleaned);
        } catch (e) {
          console.error('Failed to parse auto_group response:', groupText);
          return jsonResponse({ error: 'AI returned invalid format', raw: groupText }, 500, headers);
        }

        if (!groupJson.groups || !Array.isArray(groupJson.groups)) {
          return jsonResponse({ error: 'AI response missing groups array' }, 500, headers);
        }

        // Enforce catalog: drop any group whose title isn't in the catalog;
        // collect those obs ids and merge into "General" (or last catalog entry).
        const catalogSet = new Set(catalog);
        const fallbackTitle = catalog.includes('General') ? 'General' : catalog[catalog.length - 1];
        const cleanGroups = [];
        const fallbackIds = [];
        for (const g of groupJson.groups) {
          if (!g || typeof g.title !== 'string' || !Array.isArray(g.deficiency_ids)) continue;
          if (catalogSet.has(g.title)) {
            cleanGroups.push({ title: g.title, deficiency_ids: g.deficiency_ids });
          } else {
            // AI invented a title not in catalog → push items into fallback bucket
            for (const id of g.deficiency_ids) fallbackIds.push(id);
          }
        }
        if (fallbackIds.length) {
          // Merge into existing fallback group if present, otherwise create
          let fbGroup = cleanGroups.find(g => g.title === fallbackTitle);
          if (!fbGroup) {
            fbGroup = { title: fallbackTitle, deficiency_ids: [] };
            cleanGroups.push(fbGroup);
          }
          for (const id of fallbackIds) fbGroup.deficiency_ids.push(id);
        }

        // Server-side validation: every input id in exactly one group
        const inputIds = new Set(deficiencies.map(d => d.id));
        const seenIds = new Set();
        const duplicates = [];
        for (const g of cleanGroups) {
          for (const id of g.deficiency_ids) {
            if (seenIds.has(id)) duplicates.push(id);
            seenIds.add(id);
          }
        }
        const missing = [...inputIds].filter(id => !seenIds.has(id));
        let validation = null;
        if (missing.length || duplicates.length) {
          validation = { missing_ids: missing, duplicate_ids: duplicates };
        }

        const gUsage = groupData.usage || {};
        const gInputTokens = gUsage.input_tokens || 0;
        const gOutputTokens = gUsage.output_tokens || 0;
        const gCostUsd = (gInputTokens * groupModel.inputRate) + (gOutputTokens * groupModel.outputRate);

        if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
          const logPayload = {
            user_id: userId,
            user_email: userEmail,
            tool: context?.tool || 'frt',
            project_number: context?.projectNumber || null,
            project_name: context?.projectName || null,
            action: 'auto_group',
            model: groupModel.id,
            input_tokens: gInputTokens,
            output_tokens: gOutputTokens,
            cost_usd: gCostUsd,
            field_count: deficiencies.length,
            accepted_count: null
          };
          const logPromise = fetch(
            `${env.SUPABASE_URL}/rest/v1/ai_usage_log`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify(logPayload)
            }
          ).then(res => {
            if (!res.ok) return res.text().then(t => console.error('Usage log HTTP error (auto_group):', res.status, t));
          }).catch(err => console.error('Usage log failed (auto_group):', err));
          ctx.waitUntil(logPromise);
        }

        return jsonResponse({
          groups: cleanGroups,
          _validation: validation,
          usage: {
            input_tokens: gInputTokens,
            output_tokens: gOutputTokens,
            cost_usd: Math.round(gCostUsd * 1000000) / 1000000
          }
        }, 200, headers);
      }

      // Text review mode (existing)
      if (!fields || !Array.isArray(fields) || fields.length === 0) {
        return jsonResponse({ error: 'No fields provided' }, 400, headers);
      }

      // Rate limit: max 50 fields per request
      if (fields.length > 50) {
        return jsonResponse({ error: 'Too many fields (max 50)' }, 400, headers);
      }

      // Select model and prompt based on mode.
      // S116 Push 4: 'shorten' mode added — uses Haiku (cheap compression
      // task) and the dedicated PROMPT_SHORTEN. Falls back to 'rewrite'
      // (Sonnet) for any unrecognized mode, preserving original behaviour.
      var reviewMode;
      if (mode === 'quickfix') reviewMode = 'quickfix';
      else if (mode === 'shorten') reviewMode = 'shorten';
      else reviewMode = 'rewrite';
      const modelConfig = (reviewMode === 'rewrite') ? MODELS.rewrite : MODELS.quickfix;
      const systemPrompt = reviewMode === 'quickfix' ? PROMPT_QUICKFIX
                         : reviewMode === 'shorten'  ? PROMPT_SHORTEN
                         : PROMPT_REWRITE;

      // 3. Build user message for Claude.
      // S116 Push 4: client may send `value` (newer fields shape from the
      // shorten + scratchpad flows) or `text` (legacy rewrite/quickfix
      // shape). Read both so 'shorten' requests don't arrive with empty
      // text strings — root cause of why the Shorten button never worked
      // even after the worker recognized the mode.
      const fieldData = fields.map(f => ({
        id: f.id || f.path || '',
        label: f.label || f.name || '',
        text: f.text || f.value || ''
      }));

      const userMessage = JSON.stringify(fieldData);

      // 4. Call Anthropic API
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: modelConfig.id,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        })
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        console.error('Anthropic API error:', anthropicRes.status, errText);
        return jsonResponse({ error: 'AI service error', detail: anthropicRes.status }, 502, headers);
      }

      const anthropicData = await anthropicRes.json();

      // 5. Extract text response
      const aiText = anthropicData.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');

      // Parse suggestions JSON from AI response
      let suggestions;
      try {
        const cleaned = aiText.replace(/```json|```/g, '').trim();
        suggestions = JSON.parse(cleaned);
      } catch (e) {
        console.error('Failed to parse AI response:', aiText);
        return jsonResponse({ error: 'AI returned invalid format', raw: aiText }, 500, headers);
      }

      // 6. Calculate usage/cost
      const usage = anthropicData.usage || {};
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const costUsd = (inputTokens * modelConfig.inputRate) + (outputTokens * modelConfig.outputRate);

      // 7. Log usage to Supabase — FIX: use ctx.waitUntil() to keep alive after response
      if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
        const logPayload = {
          user_id: userId,
          user_email: userEmail,
          tool: context?.tool || 'unknown',
          project_number: context?.projectNumber || null,
          project_name: context?.projectName || null,
          action: 'polish',
          model: modelConfig.id,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: costUsd,
          field_count: fields.length,
          accepted_count: null
        };

        const logPromise = fetch(
          `${env.SUPABASE_URL}/rest/v1/ai_usage_log`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(logPayload)
          }
        ).then(res => {
          if (!res.ok) {
            return res.text().then(t => console.error('Usage log HTTP error:', res.status, t));
          }
          console.log('Usage logged OK for', userEmail, costUsd.toFixed(6));
        }).catch(err => console.error('Usage log failed:', err));

        // FIX: ctx.waitUntil() keeps this promise alive after the response is sent
        ctx.waitUntil(logPromise);
      }

      // 8. Return suggestions to frontend
      return jsonResponse({
        suggestions,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: Math.round(costUsd * 1000000) / 1000000
        }
      }, 200, headers);

    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal worker error', detail: err.message }, 500, headers);
    }
  }
};

function jsonResponse(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}
