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

If the text is ALREADY professional and well-written, return it unchanged with changes = "no changes needed".

Respond with ONLY valid JSON — no markdown, no backticks:
[
  {
    "id": "field_id",
    "improved": "The professionally rewritten text.",
    "changes": "Brief description of what was improved"
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
- If the text has no typos or grammar issues, return it UNCHANGED

Respond with ONLY valid JSON — no markdown, no backticks:
[
  {
    "id": "field_id",
    "improved": "Text with only typos fixed.",
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
- If the text is already concise (under ~30 words and no obvious padding), return it unchanged with changes = "already concise"

Respond with ONLY valid JSON — no markdown, no backticks:
[
  {
    "id": "field_id",
    "improved": "The shortened text, preserving all facts and references.",
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
