// ARENCON Training Center — Lesson-Text Cleanup Edge Function
// Rewrites rough pasted/extracted notes into clean, readable lesson
// text WITHOUT adding or changing facts. Single-purpose (modularity
// rule); independent of training-quiz / training-extract / the Worker.
//
// Cost is logged to the shared ai_usage_log exactly like training-quiz
// (tool:"training", action:"lesson_clean", account-scoped, project null).
//
// Secrets:
//   ANTHROPIC_API_KEY         (set in Supabase → Edge Functions secrets)
//   SUPABASE_URL              (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Auth: verify_jwt=false at deploy (browser CORS preflight passes);
// JWT validated in-code below (same security as the other functions).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = [
  "https://hezhendong999-bot.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

const MODEL = {
  id: "claude-sonnet-4-20250514",
  inputRate: 0.000003,
  outputRate: 0.000015,
};

const SYSTEM = `You clean up rough notes into readable lesson text for fire protection trainees at ARENCON Inc. (Ontario; OBC / NFPA / ULC context).

STRICT RULES:
- Preserve every technical fact, code reference, clause number, dimension, and value EXACTLY as given. Do not "correct" them.
- Do NOT add information, examples, or claims that are not in the source. If something is unclear, keep it as-is rather than inventing.
- Improve only readability: clear paragraphs, logical order, short bullet lists where the source is list-like, plain professional wording.
- Keep it concise. Do not pad.
- Output ONLY the cleaned lesson text. No preamble, no headings like "Cleaned text:", no markdown fences.`;

function corsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.some((o) => origin && origin.startsWith(o));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
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

    const body = await req.json();
    const text = String(body.text || "").trim();
    if (!text) {
      return json({ error: "Provide text to clean" }, 400, headers);
    }
    if (text.length < 20) {
      return json({ error: "Too short to clean — write a bit more" }, 400, headers);
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL.id,
        max_tokens: 4000,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: "Clean up these notes into lesson text:\n\n" +
              text.slice(0, 20000),
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error (lesson_clean):", aiRes.status, errText);
      return json({ error: "AI service error", detail: aiRes.status }, 502, headers);
    }

    const aiData = await aiRes.json();
    const cleaned = (aiData.content || [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("")
      .trim();

    if (!cleaned) {
      return json({ error: "AI returned no text" }, 500, headers);
    }

    const usage = aiData.usage || {};
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    const cost = inTok * MODEL.inputRate + outTok * MODEL.outputRate;

    if (SUPABASE_URL && SERVICE_KEY) {
      const logBody = {
        user_id: userId,
        user_email: userEmail,
        tool: "training",
        project_number: null,
        project_name: null,
        action: "lesson_clean",
        model: MODEL.id,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: cost,
        field_count: null,
        accepted_count: null,
      };
      const logPromise = fetch(`${SUPABASE_URL}/rest/v1/ai_usage_log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(logBody),
      }).catch((err) => console.error("Usage log failed (lesson_clean):", err));
      // @ts-ignore EdgeRuntime is available in Supabase Edge
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(logPromise);
      else await logPromise;
    }

    return json(
      {
        text: cleaned,
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
    console.error("Edge function error (training-clean):", err);
    return json(
      { error: "Internal error", detail: (err as Error).message },
      500,
      headers,
    );
  }
});
