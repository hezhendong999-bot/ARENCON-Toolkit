// ARENCON Training Center — Question Feedback Edge Function
// v1. Slice 2c. User flags a quiz question for review. EF takes the full
// raw context (question, options, user's pick, AI explanation, chat
// history, user's complaint text) and produces a structured distillation
// via Claude. Both the distillation AND the raw context are saved into
// tc_questions_feedback.comment as JSON (Schema Option B — no migration).
//
// Stored row (tc_questions_feedback):
//   user_id      = validated JWT user
//   attempt_id   = optional, from client
//   question_id  = "<module_id>:<question_index>"  for now
//   kind         = "<category>|<severity>"          (e.g. "answer_disputed|high")
//   comment      = JSON string with:
//                    { summary, user_position, ai_position,
//                      point_of_disagreement, category, severity,
//                      suggested_action,
//                      raw: { question, user_pick, ai_explanation, chat_history,
//                             user_text, module_title, module_code_ref } }
//   status       = "open" (default)
//
// Input (POST body):
//   {
//     attempt_id?: uuid,
//     module_id?: uuid,
//     module_title?: string,
//     module_code_ref?: string,
//     question: { q, opts[4], answer, picked, topic?, why? },
//     question_index: number,
//     ai_explanation?: string,        // the Slice 2a explanation text, if rendered
//     chat_history?: [{role, content}],
//     user_text: string,              // the user's free-text complaint
//     context?: { tool?: string }
//   }
//
// Output (200): { id: uuid, summary: string, category: string, severity: string }
//
// Auth: deployed verify_jwt=false; JWT validated in-code.

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

const MAX_USER_TEXT = 2000;
const MIN_USER_TEXT = 20;

const SYS = `You are processing a feedback ticket from a fire protection trainee at ARENCON Inc. (Ontario, Canada). A trainee has flagged a quiz question for review by a Subject Matter Expert (SME). Your job is to read the full context — the question, the trainee's answer, any AI explanation they saw, any tutor chat that happened, and the trainee's own complaint text — and produce a STRUCTURED, FAITHFUL summary that the SME can triage quickly.

CRITICAL RULES:
1. Do NOT take sides between the trainee and the AI. Paraphrase faithfully — represent each position as fairly as the party would represent themselves.
2. Do NOT add information not present in the raw context. Don't infer code clauses, don't add citations, don't editorialize.
3. Preserve the trainee's specific arguments — DON'T water them down to "the user disagrees with the AI."
4. If the trainee's complaint is unclear, say so honestly in the summary rather than guessing.
5. Categorize using EXACTLY one of these enum values:
   - "question_ambiguous"      — the question itself is unclear or could be read multiple ways
   - "answer_disputed"         — trainee thinks the marked-correct answer is wrong, OR that their picked answer is also valid
   - "explanation_unclear"     — the AI explanation didn't make sense to them
   - "code_clause_dispute"     — trainee cites a code clause / standard that contradicts the answer or AI
   - "other"                   — doesn't fit above
6. Severity:
   - "low"   — preference, nitpick, minor wording
   - "med"   — real ambiguity, multiple defensible reads
   - "high"  — likely factual error in the question, answer, or explanation
7. Suggested action: 1 sentence, neutral and actionable, addressed to the SME (e.g. "Verify NFPA 13 §X.Y.Z and consider rewording option C", not "Mark should...").

Respond with ONLY valid JSON — no markdown, no backticks:
{
  "summary":               "1-2 sentence neutral overview",
  "user_position":         "what the trainee is arguing, paraphrased faithfully",
  "ai_position":           "what the AI explanation/tutor said, paraphrased",
  "point_of_disagreement": "the specific factual or interpretive split, in one sentence",
  "category":              "<enum from list above>",
  "severity":              "<low|med|high>",
  "suggested_action":      "1 sentence for the SME"
}`;

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

const VALID_CATEGORIES = [
  "question_ambiguous",
  "answer_disputed",
  "explanation_unclear",
  "code_clause_dispute",
  "other",
];
const VALID_SEVERITIES = ["low", "med", "high"];

function letter(i: number): string { return String.fromCharCode(65 + i); }

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "Server not configured: ANTHROPIC_API_KEY missing" }, 500, headers);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "Server not configured: Supabase env missing" }, 500, headers);
  }

  try {
    // 1. JWT validation
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401, headers);
    }
    const jwt = authHeader.replace("Bearer ", "");
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: SERVICE_KEY },
    });
    if (!userRes.ok) return json({ error: "Invalid or expired auth token" }, 401, headers);
    const userData = await userRes.json();
    const userId = userData.id;
    const userEmail = userData.email;

    // 2. Parse + validate body
    const body = await req.json();
    const q = (body.question && typeof body.question === "object")
      ? body.question as Record<string, unknown>
      : {};
    const userText = String(body.user_text || "").trim();
    const moduleTitle = String(body.module_title || "").trim().slice(0, 200);
    const moduleCodeRef = String(body.module_code_ref || "").trim().slice(0, 200);
    const moduleId = String(body.module_id || "").trim();
    const questionIndex = parseInt(String(body.question_index || 0), 10) || 0;
    const attemptId = String(body.attempt_id || "").trim();
    const aiExplanation = String(body.ai_explanation || "").trim().slice(0, 5000);
    const chatHistory = Array.isArray(body.chat_history)
      ? (body.chat_history as Array<Record<string, unknown>>)
        .filter((m) => m && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: String(m.role), content: String(m.content || "").slice(0, 4000) }))
        .slice(-48)
      : [];

    if (!q.q || !Array.isArray(q.opts) || q.opts.length !== 4) {
      return json({ error: "Invalid question payload" }, 400, headers);
    }
    if (userText.length < MIN_USER_TEXT) {
      return json(
        { error: `Please describe your concern in at least ${MIN_USER_TEXT} characters` },
        400,
        headers,
      );
    }
    if (userText.length > MAX_USER_TEXT) {
      return json(
        { error: `Message too long (max ${MAX_USER_TEXT} characters)` },
        400,
        headers,
      );
    }

    // 3. Build prompt with the full raw context
    const opts = (q.opts as unknown[]).map(String);
    const ans = Math.max(0, Math.min(3, parseInt(String(q.answer)) || 0));
    const pck = Math.max(-1, Math.min(3, parseInt(String(q.picked)) || -1));

    const ctxLines: string[] = [];
    if (moduleTitle) ctxLines.push(`Module: ${moduleTitle}`);
    if (moduleCodeRef) ctxLines.push(`Module code reference: ${moduleCodeRef}`);
    if (q.topic) ctxLines.push(`Topic: ${String(q.topic)}`);
    ctxLines.push(`Question: ${String(q.q || "").trim()}`);
    for (let j = 0; j < opts.length; j++) {
      let tag = "";
      if (j === ans) tag = "   ← CORRECT (per the question author)";
      if (j === pck) tag = tag ? tag + " — TRAINEE PICKED THIS" : "   ← TRAINEE PICKED THIS";
      if (pck === -1 && j === 0) tag = tag; // no-op marker
      ctxLines.push(`  ${letter(j)}. ${opts[j]}${tag}`);
    }
    if (q.why) ctxLines.push(`Author's "why" note: ${String(q.why)}`);
    if (aiExplanation) ctxLines.push(`\nAI explanation shown to trainee:\n${aiExplanation}`);
    if (chatHistory.length) {
      ctxLines.push("\nTutor chat history:");
      chatHistory.forEach((m) => {
        ctxLines.push(`  [${m.role}] ${m.content}`);
      });
    }
    ctxLines.push(`\n--- TRAINEE'S FEEDBACK / COMPLAINT ---\n${userText}`);

    const userPrompt = ctxLines.join("\n");

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
        max_tokens: 1500,
        system: SYS,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error (feedback):", aiRes.status, errText);
      return json({ error: "AI service error", detail: aiRes.status }, 502, headers);
    }
    const aiData = await aiRes.json();
    const aiOut = (aiData.content || [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("");

    let distillation: Record<string, unknown> = {};
    try {
      distillation = JSON.parse(aiOut.replace(/```json|```/g, "").trim());
    } catch (_e) {
      console.error("Feedback distillation parse failed:", aiOut);
      // Don't fail the user — store a fallback with raw AI output preserved.
      distillation = {
        summary: "AI distillation parse failed; see raw_ai_output and raw context.",
        user_position: userText,
        ai_position: aiExplanation || "(none)",
        point_of_disagreement: "(parse failed)",
        category: "other",
        severity: "med",
        suggested_action: "Review raw context manually.",
        raw_ai_output: aiOut,
      };
    }

    // Normalize enums; coerce invalid values to safe defaults.
    let category = String(distillation.category || "other");
    if (!VALID_CATEGORIES.includes(category)) category = "other";
    let severity = String(distillation.severity || "med");
    if (!VALID_SEVERITIES.includes(severity)) severity = "med";
    distillation.category = category;
    distillation.severity = severity;

    // Preserve raw context inside the JSON blob (Schema Option B)
    distillation.raw = {
      question: { q: String(q.q || ""), opts, answer: ans, picked: pck,
                  topic: String(q.topic || ""), why: String(q.why || "") },
      module_title: moduleTitle,
      module_code_ref: moduleCodeRef,
      module_id: moduleId,
      question_index: questionIndex,
      ai_explanation: aiExplanation,
      chat_history: chatHistory,
      user_text: userText,
      user_email: userEmail,
    };

    // 5. Insert into tc_questions_feedback (service role bypasses RLS,
    //    but user_id is set to the validated JWT user for audit).
    const questionId = moduleId ? `${moduleId}:${questionIndex}` : String(questionIndex);
    const insertBody: Record<string, unknown> = {
      user_id: userId,
      question_id: questionId,
      kind: `${category}|${severity}`,
      comment: JSON.stringify(distillation),
    };
    if (attemptId) insertBody.attempt_id = attemptId;

    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/tc_questions_feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(insertBody),
    });
    if (!insRes.ok) {
      const t = await insRes.text();
      console.error("Feedback insert failed:", insRes.status, t);
      return json({ error: "Failed to save feedback", detail: t }, 500, headers);
    }
    const insRows = await insRes.json();
    const insertedId = Array.isArray(insRows) && insRows[0] ? insRows[0].id : null;

    // 6. Usage log (best-effort, non-blocking)
    const usage = aiData.usage || {};
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    const cost = inTok * MODEL.inputRate + outTok * MODEL.outputRate;
    const logBody = {
      user_id: userId,
      user_email: userEmail,
      tool: body?.context?.tool || "training",
      project_number: null,
      project_name: null,
      action: "quiz_feedback",
      model: MODEL.id,
      input_tokens: inTok,
      output_tokens: outTok,
      cost_usd: cost,
      field_count: 1,
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
    }).catch((err) => console.error("Usage log failed (feedback):", err));
    // @ts-ignore EdgeRuntime is Supabase Edge specific
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(logPromise);
    else await logPromise;

    return json(
      {
        id: insertedId,
        summary: String(distillation.summary || ""),
        category,
        severity,
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
    console.error("Edge function error (feedback):", err);
    return json({ error: "Internal error", detail: (err as Error).message }, 500, headers);
  }
});
