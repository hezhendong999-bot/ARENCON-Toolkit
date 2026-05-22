// ARENCON Training Center — Tutor Chat Edge Function
// v1. Slice 2b (clarify/tutor chatbot). Multi-turn follow-up chat on a
// specific quiz question. Stateless — client sends full history each turn.
//
// Deliberately separate from training-quiz-edge and training-explain-edge
// so the three can be reasoned about, deployed, and rolled back
// independently.
//
// Input (POST body):
//   {
//     question: { q, opts[4], answer, picked, topic?, why? },  // the quiz item
//     module_title?: string,
//     module_code_ref?: string,
//     history: [ { role: "user"|"assistant", content: string }, ... ],
//     user_message: string,                                     // newest user turn
//     context?: { tool?: string }
//   }
//
// Output (200):
//   { reply: string, turn: number, max_turns: number, usage: {...} }
//
// Guards:
//   - 10-turn hard cap per chat session (server enforces).
//     `history.length` counts message objects (user + assistant interleaved),
//     so 10 turns = up to 10 user messages.
//   - Empty/whitespace-only user_message → 400.
//   - user_message length cap 2000 chars (generous; one paragraph max).
//   - history clamped to last 24 messages so context can't grow unbounded
//     even if client misbehaves.
//
// Auth: deployed verify_jwt=false; JWT validated in-code (same model as
// the other two Training EFs).
//
// Secrets:
//   ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

const MAX_TURNS = 20;
const MAX_HISTORY_MESSAGES = 48; // generous clamp; protects context size
const MAX_USER_MSG_CHARS = 2000;

const PERSONA = `You are a calm, patient fire protection tutor helping a trainee at ARENCON Inc. (Ontario, Canada — OBC / NFPA / ULC context). The trainee just finished a quiz question and is asking follow-up questions to deepen their understanding.

How you behave:
- Socratic when possible — ask a short guiding question when it helps the trainee figure it out, but give a direct answer when they're stuck or explicitly ask.
- Short replies. 2–5 sentences typical. Never lecture.
- Stay tightly on the current quiz question's topic. If the trainee drifts far off-topic, gently bring them back: "That's interesting but a bit outside this question — for that I'd suggest [...]. Coming back to this question: ..."
- Use correct fire protection terminology. Reference NFPA 13 / 20 / 25 / 72, OBC, ULC where relevant. Do NOT fabricate clause numbers you aren't confident about — say "I'd want to check the exact clause" instead of inventing one.
- Don't reveal you're AI unless asked. You're a tutor.
- Never tell the trainee they're stupid or scold them. Their wrong answer was an opportunity to learn — treat it that way.
- If the trainee asks a question you genuinely don't know the answer to (e.g. about a very specific local amendment), say so and suggest where to look.
- Don't repeat the original "Why" verbatim — they've already read it. Build on it.`;

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

// P11: tc_style_corpus → STYLE block. No-op while empty.
async function styleBlock(
  supabaseUrl: string | undefined,
  serviceKey: string | undefined,
): Promise<string> {
  if (!supabaseUrl || !serviceKey) return "";
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tc_style_corpus?select=kind,content`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!res.ok) return "";
    const rows = (await res.json()) as Array<{ kind: string; content: string }>;
    if (!Array.isArray(rows) || rows.length === 0) return "";
    const byKind: Record<string, string[]> = {};
    for (const r of rows) {
      if (!r || !r.content) continue;
      (byKind[r.kind] ||= []).push(String(r.content).trim());
    }
    const parts: string[] = [];
    if (byKind.term_required?.length)
      parts.push("REQUIRED terms (use these): " + byKind.term_required.join("; "));
    if (byKind.term_forbidden?.length)
      parts.push("FORBIDDEN terms (never use): " + byKind.term_forbidden.join("; "));
    if (byKind.tone?.length) parts.push("Tone: " + byKind.tone.join("; "));
    if (byKind.phrasing?.length)
      parts.push("Preferred phrasing: " + byKind.phrasing.join("; "));
    if (parts.length === 0) return "";
    return "\n\nARENCON STYLE — follow strictly:\n" + parts.join("\n");
  } catch (_e) {
    return "";
  }
}

function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

function questionContext(q: Record<string, unknown>, moduleTitle: string, moduleCodeRef: string): string {
  const opts = Array.isArray(q.opts) ? (q.opts as unknown[]).slice(0, 4).map(String) : [];
  const ans = Math.max(0, Math.min(3, parseInt(String(q.answer)) || 0));
  const pck = Math.max(-1, Math.min(3, parseInt(String(q.picked)) || -1));
  const lines: string[] = [];
  if (moduleTitle) lines.push(`Module: ${moduleTitle}`);
  if (moduleCodeRef) lines.push(`Module code reference: ${moduleCodeRef}`);
  if (q.topic) lines.push(`Topic: ${String(q.topic)}`);
  lines.push(`Question: ${String(q.q || "").trim()}`);
  for (let j = 0; j < opts.length; j++) {
    let tag = "";
    if (j === ans) tag = "   ← correct answer";
    if (j === pck) tag = (tag ? tag + " — TRAINEE PICKED THIS" : "   ← TRAINEE PICKED THIS");
    lines.push(`  ${letter(j)}. ${opts[j]}${tag}`);
  }
  if (q.why) lines.push(`Author's "why" (the trainee has already seen this): ${String(q.why)}`);
  return lines.join("\n");
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
    // 1. JWT
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

    // 2. Parse + validate body
    const body = await req.json();
    const q = (body.question && typeof body.question === "object")
      ? body.question as Record<string, unknown>
      : {};
    const moduleTitle = String(body.module_title || "").trim().slice(0, 200);
    const moduleCodeRef = String(body.module_code_ref || "").trim().slice(0, 200);
    const userMessage = String(body.user_message || "").trim();
    let history = Array.isArray(body.history) ? body.history : [];

    if (!userMessage) {
      return json({ error: "user_message is required" }, 400, headers);
    }
    if (userMessage.length > MAX_USER_MSG_CHARS) {
      return json(
        { error: `Message too long (max ${MAX_USER_MSG_CHARS} characters)` },
        400,
        headers,
      );
    }
    if (!q.q || !Array.isArray(q.opts) || q.opts.length !== 4) {
      return json({ error: "Invalid question payload" }, 400, headers);
    }

    // Count user turns already in history (each user message = one turn used)
    const userTurnsSoFar = history.filter(
      (m: Record<string, unknown>) => m && m.role === "user",
    ).length;
    if (userTurnsSoFar >= MAX_TURNS) {
      return json(
        {
          error: `Chat limit reached (${MAX_TURNS} messages per question). Start a new attempt to continue.`,
          turn: userTurnsSoFar,
          max_turns: MAX_TURNS,
        },
        429,
        headers,
      );
    }

    // Clamp history to last N messages (protects context size)
    if (history.length > MAX_HISTORY_MESSAGES) {
      history = history.slice(-MAX_HISTORY_MESSAGES);
    }

    // Normalize history: only role + content strings, only valid roles
    const normalizedHistory = (history as Array<Record<string, unknown>>)
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content || "").slice(0, MAX_USER_MSG_CHARS * 2),
      }))
      .filter((m) => m.content.trim().length > 0);

    // 3. Build system prompt: persona + question context + style
    const STYLE = await styleBlock(SUPABASE_URL, SERVICE_KEY);
    const ctx = questionContext(q, moduleTitle, moduleCodeRef);
    const system =
      PERSONA +
      "\n\nCURRENT QUIZ QUESTION (context — do NOT just re-explain this; respond to what the trainee is asking):\n" +
      ctx +
      STYLE;

    // 4. Compose messages array for Anthropic
    const messages = [
      ...normalizedHistory,
      { role: "user" as const, content: userMessage },
    ];

    // 5. Call Anthropic
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL.id,
        max_tokens: 600,
        system,
        messages,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error (chat):", aiRes.status, errText);
      return json({ error: "AI service error", detail: aiRes.status }, 502, headers);
    }

    const aiData = await aiRes.json();
    const reply = (aiData.content || [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("")
      .trim();

    if (!reply) {
      return json({ error: "AI returned empty reply" }, 500, headers);
    }

    // 6. Usage + cost
    const usage = aiData.usage || {};
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    const cost = inTok * MODEL.inputRate + outTok * MODEL.outputRate;

    // 7. Log (best-effort, non-blocking)
    if (SUPABASE_URL && SERVICE_KEY) {
      const logBody = {
        user_id: userId,
        user_email: userEmail,
        tool: body?.context?.tool || "training",
        project_number: null,
        project_name: null,
        action: "quiz_chat",
        model: MODEL.id,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: cost,
        field_count: userTurnsSoFar + 1, // which turn this was
        accepted_count: 1,
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
      }).catch((err) => console.error("Usage log failed (chat):", err));
      // @ts-ignore EdgeRuntime is Supabase Edge specific
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(logPromise);
      else await logPromise;
    }

    return json(
      {
        reply,
        turn: userTurnsSoFar + 1,
        max_turns: MAX_TURNS,
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
    console.error("Edge function error (chat):", err);
    return json(
      { error: "Internal error", detail: (err as Error).message },
      500,
      headers,
    );
  }
});
