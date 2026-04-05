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
      const { fields, context, mode } = body;

      if (!fields || !Array.isArray(fields) || fields.length === 0) {
        return jsonResponse({ error: 'No fields provided' }, 400, headers);
      }

      // Rate limit: max 50 fields per request
      if (fields.length > 50) {
        return jsonResponse({ error: 'Too many fields (max 50)' }, 400, headers);
      }

      // Select model and prompt based on mode
      const reviewMode = (mode === 'quickfix') ? 'quickfix' : 'rewrite';
      const modelConfig = MODELS[reviewMode];
      const systemPrompt = reviewMode === 'quickfix' ? PROMPT_QUICKFIX : PROMPT_REWRITE;

      // 3. Build user message for Claude
      const fieldData = fields.map(f => ({
        id: f.id,
        label: f.label || '',
        text: f.text || ''
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
