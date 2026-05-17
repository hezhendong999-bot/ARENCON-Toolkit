// ARENCON Training Center — Quiz Draft Edge Function
// Generates a 4-question multiple-choice knowledge check from pasted
// source text and/or an uploaded photo/drawing.
//
// Converted from the validated arencon-ai-worker quiz_draft mode.
// Single-purpose by design (modularity rule): this function ONLY does
// quiz drafting. It does not touch the Cloudflare Worker that FRT /
// pump tools depend on.
//
// Secrets required (set once in Supabase Dashboard → Edge Functions →
// Manage secrets):
//   ANTHROPIC_API_KEY     — sk-ant-...
//   SUPABASE_URL          — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
//
// Auth: verify_jwt is enabled at deploy → Supabase rejects any request
// without a valid logged-in user's JWT before this code even runs.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = [
  "https://hezhendong999-bot.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

const PROMPT_QUIZ_DRAFT = `You write short multiple-choice knowledge checks for fire protection trainees at ARENCON Inc., a consulting firm in Ontario, Canada (OBC / NFPA / ULC context).

Generate exactly 4 questions from the supplied source material (text and/or an image — a field photo or drawing).

RULES:
- Test UNDERSTANDING and REASONING, not trivia recall. Prefer "why" / "what would you do" / "what is the consequence" over "what is the definition of".
- 4 plausible options each; distractors must be believable to someone with partial knowledge, not obviously wrong.
- Exactly one correct option. "answer" is its 0-based index.
- "why" explains the reasoning the trainee should have used — not just "because it's correct". This is the teaching moment.
- Use correct fire protection terminology and code references where natural (NFPA 13/20/25/72, OBC, ULC).
- If an image is supplied, base questions on what it actually shows (identify the component/condition/issue). Do NOT invent details not visible.
- Do NOT fabricate code clause numbers you are unsure of.

Respond with ONLY valid JSON — no markdown, no backticks:
[
  { "q": "question text", "opts": ["a","b","c","d"], "answer": 0, "why": "the reasoning a trainee should apply" }
]`;

const MODEL = {
  id: "claude-sonnet-4-20250514",
  inputRate: 0.000003,
  outputRate: 0.000015,
};

function corsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.some((o) => origin && origin.startsWith(o));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data: unknown, status: number, extra: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, headers);
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!ANTHROPIC_API_KEY) {
    return json(
      { error: "Server not configured: ANTHROPIC_API_KEY secret is missing" },
      500,
      headers,
    );
  }

  try {
    // 1. Validate the caller's Supabase JWT (verify_jwt also gates this,
    //    but we re-check to capture user id/email for usage logging).
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401, headers);
    }
    const jwt = authHeader.replace("Bearer ", "");
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: SERVICE_KEY ?? "" },
    });
    if (!userRes.ok) {
      return json({ error: "Invalid or expired auth token" }, 401, headers);
    }
    const userData = await userRes.json();
    const userId = userData.id;
    const userEmail = userData.email;

    // 2. Parse body
    const body = await req.json();
    const sourceText = (body.sourceText || "").trim();
    const photos = Array.isArray(body.photos) ? body.photos : [];

    if (!sourceText && photos.length === 0) {
      return json(
        { error: "Provide sourceText or at least one photo" },
        400,
        headers,
      );
    }
    if (photos.length > 4) {
      return json({ error: "Too many photos (max 4)" }, 400, headers);
    }

    // 3. Build the vision+text content
    const content: unknown[] = [];
    for (const ph of photos) {
      if (!ph.data || !ph.media_type) {
        return json(
          { error: "Each photo must have {data, media_type}" },
          400,
          headers,
        );
      }
      content.push({
        type: "image",
        source: { type: "base64", media_type: ph.media_type, data: ph.data },
      });
    }
    let qText = "Generate 4 questions";
    if (photos.length) qText += " based on what the image(s) show";
    if (sourceText) {
      qText += (photos.length ? " and the source below" : " from the source below") +
        ":\n\n" + sourceText.slice(0, 12000);
    } else qText += ".";
    content.push({ type: "text", text: qText });

    // 4. Call Anthropic
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL.id,
        max_tokens: 2000,
        system: PROMPT_QUIZ_DRAFT,
        messages: [{ role: "user", content }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error (quiz_draft):", aiRes.status, errText);
      return json({ error: "AI service error", detail: aiRes.status }, 502, headers);
    }

    const aiData = await aiRes.json();
    const aiOut = (aiData.content || [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("");

    let quizArr: unknown;
    try {
      quizArr = JSON.parse(aiOut.replace(/```json|```/g, "").trim());
    } catch (_e) {
      console.error("Failed to parse quiz_draft response:", aiOut);
      return json({ error: "AI returned invalid format", raw: aiOut }, 500, headers);
    }
    if (!Array.isArray(quizArr) || quizArr.length === 0) {
      return json({ error: "AI response was not a question array" }, 500, headers);
    }

    // 5. Normalize/clamp shape so the client never gets malformed items
    const quiz = (quizArr as Array<Record<string, unknown>>)
      .slice(0, 8)
      .map((q) => ({
        q: String((q && q.q) || ""),
        opts: (Array.isArray(q && q.opts) ? (q.opts as unknown[]) : [])
          .slice(0, 4)
          .map(String),
        answer: Math.max(0, Math.min(3, parseInt(String(q && q.answer)) || 0)),
        why: String((q && q.why) || ""),
      }))
      .filter((q) => q.q && q.opts.length === 4);

    // 6. Usage + cost
    const usage = aiData.usage || {};
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    const cost = inTok * MODEL.inputRate + outTok * MODEL.outputRate;

    // 7. Log usage (best-effort; never blocks the response)
    if (SUPABASE_URL && SERVICE_KEY) {
      const logBody = {
        user_id: userId,
        user_email: userEmail,
        tool: body?.context?.tool || "training",
        project_number: null,
        project_name: null,
        action: "quiz_draft",
        model: MODEL.id,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: cost,
        field_count: photos.length,
        accepted_count: null,
      };
      // EdgeRuntime.waitUntil keeps the log alive after response returns
      const logPromise = fetch(`${SUPABASE_URL}/rest/v1/ai_usage_log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(logBody),
      }).catch((err) => console.error("Usage log failed (quiz_draft):", err));
      // @ts-ignore EdgeRuntime is available in Supabase Edge
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(logPromise);
      else await logPromise;
    }

    return json(
      {
        quiz,
        usage: {
          input_tokens: inTok,
          output_tokens: outTok,
          cost_usd: Math.round(cost * 1000000) / 1000000,
        },
      },
      200,
      headers,
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return json(
      { error: "Internal error", detail: (err as Error).message },
      500,
      headers,
    );
  }
});
