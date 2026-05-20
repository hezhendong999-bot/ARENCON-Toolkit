// ARENCON Training Center — Wrong-Answer Explainer Edge Function
// v1. Slice 2a (teaching brain). Reads the WRONG items from a completed
// quiz attempt and asks the model to explain — for each wrong pick —
// why that specific choice was plausible-but-wrong.
//
// Deliberately separate from training-quiz-edge so the two can be
// reasoned about, deployed, and rolled back independently.
//
// Input (POST body):
//   {
//     wrong_items: [
//       { id: string|number,        // stable key (caller chooses; we echo it back)
//         q: string,                 // question text
//         opts: string[4],           // four choices
//         answer: number,            // 0-based correct index
//         picked: number,            // 0-based learner's pick (must !== answer)
//         topic?: string,            // optional, used in the prompt + UI grouping
//         why?: string }             // optional author "why" (we will not parrot it)
//     ],
//     module_title?: string,
//     module_code_ref?: string,
//     context?: { tool?: string }
//   }
//
// Output (200):
//   { explanations: [{ id, text }], usage: { input_tokens, output_tokens, cost_usd } }
//
// Cost discipline (roadmap P7): if wrong_items is empty, returns
// { explanations: [] } immediately with no AI call. Front-end is
// expected to skip the EF call entirely when wrongCount === 0, but this
// guard is here too so the EF is safe even if called with []. 
//
// P11: tc_style_corpus injected the same way training-quiz-edge does —
// no-op while the table is empty, future-proof when seeded.
//
// Auth: deployed verify_jwt=false so the browser CORS preflight passes;
// the JWT is validated in-code below (same security model as quiz-edge).
//
// Secrets required (Supabase Dashboard → Edge Functions → Manage secrets):
//   ANTHROPIC_API_KEY          — sk-ant-...
//   SUPABASE_URL               — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  — auto-injected

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

const BASE_RULES = `You are a fire protection instructor for trainees at ARENCON Inc., a consulting firm in Ontario, Canada (OBC / NFPA / ULC context).

Your job: for each WRONG answer below, write a short explanation aimed AT THE LEARNER'S SPECIFIC WRONG CHOICE — not a generic explanation of the correct answer. The format every explanation must follow:
1. Acknowledge what is plausible or attractive about the wrong choice they picked. (1 sentence)
2. State precisely why that choice is incorrect — what the trainee should have noticed, or what fact / clause / principle rules it out. (1–2 sentences)
3. Optionally end with one line on how to think about questions like this in future. (0–1 sentence)

RULES:
- Address the trainee in 2nd person ("you picked B because…"). Calm, professional, never condescending.
- Use correct fire protection terminology and code references where natural (NFPA 13/20/25/72, OBC, ULC). Do NOT fabricate clause numbers you are unsure of.
- Do NOT just repeat or paraphrase the author's "why" field — write a fresh explanation targeting the wrong choice.
- Keep each explanation to 2–4 sentences total. No bullet lists in the explanation text itself.
- Each item must stand alone — do not say "as in the previous question".`;

const SHAPE = `\n\nRespond with ONLY valid JSON — no markdown, no backticks:
[ { "id": "<echo the id we gave you>", "text": "the 2–4 sentence explanation aimed at the wrong choice" } ]
One element per wrong item we sent you, in the same order. The "id" must match.`;

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

// P11: tc_style_corpus → compact STYLE block. Never blocks generation;
// empty table or any failure → "" (identical to quiz-edge behaviour).
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
    if (byKind.tone?.length)
      parts.push("Tone: " + byKind.tone.join("; "));
    if (byKind.phrasing?.length)
      parts.push("Preferred phrasing: " + byKind.phrasing.join("; "));
    if (byKind.deficiency_pattern?.length)
      parts.push("Deficiency-wording patterns: " + byKind.deficiency_pattern.join("; "));
    if (byKind.exemplar?.length)
      parts.push("Style exemplars:\n- " + byKind.exemplar.join("\n- "));
    if (parts.length === 0) return "";
    return "\n\nARENCON STYLE — follow strictly:\n" + parts.join("\n");
  } catch (_e) {
    return "";
  }
}

function letter(i: number): string {
  return String.fromCharCode(65 + i);
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
    // 1. Validate the caller's Supabase JWT
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
    const wrongItemsRaw = Array.isArray(body.wrong_items) ? body.wrong_items : [];
    const moduleTitle = String(body.module_title || "").trim().slice(0, 200);
    const moduleCodeRef = String(body.module_code_ref || "").trim().slice(0, 200);

    // Clamp to a reasonable ceiling so a malformed client can't blow up cost.
    // Real attempts top out at draw_size (≤20), and this EF only sees the
    // wrong subset, so 20 is generous.
    const wrong = wrongItemsRaw.slice(0, 20).map((w: Record<string, unknown>, idx: number) => {
      const id = (w && (w.id !== undefined && w.id !== null))
        ? String(w.id)
        : String(idx);
      const opts = Array.isArray(w?.opts) ? (w.opts as unknown[]).slice(0, 4).map(String) : [];
      const ans = Math.max(0, Math.min(3, parseInt(String(w?.answer)) || 0));
      const pck = Math.max(-1, Math.min(3, parseInt(String(w?.picked)) || -1));
      return {
        id,
        q: String(w?.q || "").trim(),
        opts,
        answer: ans,
        picked: pck,
        topic: String(w?.topic || "").trim(),
        why: String(w?.why || "").trim(),
      };
    }).filter((w) =>
      w.q && w.opts.length === 4 && w.picked >= 0 && w.picked !== w.answer
    );

    // Guard: empty / no usable wrong items → cheap empty response, no AI call.
    if (wrong.length === 0) {
      return json(
        { explanations: [], usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 } },
        200,
        headers,
      );
    }

    // 3. Build the user content. One AI call, all wrong items batched.
    const itemsBlock = wrong.map((w, idx) => {
      const lines = [
        `Item #${idx + 1}  (id: ${w.id})`,
        w.topic ? `Topic: ${w.topic}` : null,
        `Question: ${w.q}`,
        ...w.opts.map((o, j) => `  ${letter(j)}. ${o}${j === w.answer ? "   ← correct" : ""}${j === w.picked ? "   ← TRAINEE PICKED THIS" : ""}`),
        w.why ? `Author's "why" (for context only — do NOT just repeat it): ${w.why}` : null,
      ].filter(Boolean);
      return lines.join("\n");
    }).join("\n\n---\n\n");

    const moduleLine = [
      moduleTitle ? `Module: ${moduleTitle}` : null,
      moduleCodeRef ? `Module code reference: ${moduleCodeRef}` : null,
    ].filter(Boolean).join("\n");

    const userText =
      (moduleLine ? moduleLine + "\n\n" : "") +
      `The trainee just completed a quiz. Below are the items they got WRONG, with the option they picked marked. For each item, write a short explanation targeted at the SPECIFIC wrong choice the trainee picked (per the rules in the system prompt).\n\n` +
      itemsBlock;

    // 4. System prompt = base rules + P11 style + JSON shape
    const STYLE = await styleBlock(SUPABASE_URL, SERVICE_KEY);
    const system = BASE_RULES + STYLE + SHAPE;

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
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error (explain):", aiRes.status, errText);
      return json({ error: "AI service error", detail: aiRes.status }, 502, headers);
    }

    const aiData = await aiRes.json();
    const aiOut = (aiData.content || [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(aiOut.replace(/```json|```/g, "").trim());
    } catch (_e) {
      console.error("Failed to parse explain response:", aiOut);
      return json({ error: "AI returned invalid format", raw: aiOut }, 500, headers);
    }
    if (!Array.isArray(parsed)) {
      return json({ error: "AI response was not an array" }, 500, headers);
    }

    // 6. Normalize. Match returned ids to the wrong items we sent;
    //    drop anything we don't recognise; preserve our input order.
    const byId = new Map<string, string>();
    for (const e of parsed as Array<Record<string, unknown>>) {
      if (!e) continue;
      const id = String(e.id ?? "").trim();
      const text = String(e.text ?? "").trim();
      if (id && text) byId.set(id, text);
    }
    const explanations = wrong.map((w) => ({
      id: w.id,
      text: byId.get(w.id) || "",
    })).filter((x) => x.text);

    // 7. Usage + cost
    const usage = aiData.usage || {};
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    const cost = inTok * MODEL.inputRate + outTok * MODEL.outputRate;

    // 8. Log usage (best-effort; never blocks the response)
    if (SUPABASE_URL && SERVICE_KEY) {
      const logBody = {
        user_id: userId,
        user_email: userEmail,
        tool: body?.context?.tool || "training",
        project_number: null,
        project_name: null,
        action: "quiz_explain",
        model: MODEL.id,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: cost,
        field_count: wrong.length,
        accepted_count: explanations.length,
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
      }).catch((err) => console.error("Usage log failed (explain):", err));
      // @ts-ignore EdgeRuntime is available in Supabase Edge
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(logPromise);
      else await logPromise;
    }

    return json(
      {
        explanations,
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
    console.error("Edge function error (explain):", err);
    return json(
      { error: "Internal error", detail: (err as Error).message },
      500,
      headers,
    );
  }
});
