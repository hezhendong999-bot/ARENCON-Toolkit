// ARENCON Training Center — Quiz / Question-Bank Draft Edge Function
// v8. Generates reasoning-style assessment items from pasted source text
// and/or photo(s)/drawing(s), and (new) per-topic question-bank items.
//
// BACKWARD COMPATIBLE with v7: a v7-shaped request
//   { sourceText?, photos?[], count?(1–8), avoid?[≤12] }
// returns the same { quiz:[{q,opts[4],answer,why}], usage } it always did
// (items now also carry type:"fact", which old callers simply ignore).
//
// NEW (additive, all optional):
//   topic    — focus generation on one Mark-approved topic (P3 bank gen)
//   mode     — "fact" | "judgment" | "mixed"  (default "fact" = v7)
//   count    — clamp raised to 1–20 (default still 4) so a 15–20 item
//              bank can be built by iterative calls with `avoid`
//   avoid    — clamp raised to ≤40 for stronger dedup across a bank
// Item shapes by type (locked decision, roadmap P10 / §5):
//   fact     → { type:"fact", topic, q, opts[4], answer, why }
//   judgment → { type:"judgment", topic, scenario, rubric[], why }
//              (NO opts/answer — judgment is Socratic, never MCQ)
// P11: the Mark-curated tc_style_corpus is injected into the prompt.
//
// Single-purpose by design (modularity rule): this function ONLY drafts
// assessment items. It does not touch the Cloudflare Worker that FRT /
// pump tools depend on.
//
// Secrets required (Supabase Dashboard → Edge Functions → Manage secrets):
//   ANTHROPIC_API_KEY          — sk-ant-...
//   SUPABASE_URL               — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
//
// Auth: deployed verify_jwt=false so the browser CORS preflight passes;
// the JWT is validated in-code below (same security).

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

const BASE_RULES = `You write short assessment items for fire protection trainees at ARENCON Inc., a consulting firm in Ontario, Canada (OBC / NFPA / ULC context).

GENERAL RULES (all item types):
- Test UNDERSTANDING and REASONING, not trivia recall. Prefer "why" / "what would you do" / "what is the consequence" over "what is the definition of".
- Each item must stand alone — do not reference "the image above", since a saved item may be shown without the image.
- Use correct fire protection terminology and code references where natural (NFPA 13/20/25/72, OBC, ULC). Do NOT fabricate code clause numbers you are unsure of.
- If an image is supplied, base items on what it actually shows. Do NOT invent details not visible.

FACT items (auto-graded multiple choice):
- Exactly 4 options. Exactly ONE is correct and unambiguously so; "answer" is its 0-based index.
- The 3 distractors must be plausible to a trainee with partial knowledge but clearly incorrect to someone who knows the material — never arguably-also-correct.
- Options parallel in form and similar in length. No "All/None of the above". Do not telegraph the answer by length or detail.
- "why" explains the reasoning the trainee should have used — the teaching moment.

JUDGMENT items (Socratic — NEVER multiple choice):
- "scenario" is a realistic ARENCON situation that has no single lookup answer (e.g. defend a design-criteria choice, resolve a hydraulic shortfall, spot and justify a deficiency).
- "rubric" is an array of the key reasoning points a strong trainee should raise (3–6 short strings). It is what Mark will assess the trainee's reasoning trace against — NOT shown to the trainee as options.
- "why" states the ARENCON position / what good judgment looks like here.
- NEVER provide opts or answer for a judgment item — forcing judgment into MCQ trains people that fire protection is a lookup table.`;

function shapeFor(mode: string): string {
  if (mode === "judgment") {
    return `\n\nRespond with ONLY valid JSON — no markdown, no backticks:
[ { "type":"judgment", "scenario":"...", "rubric":["point","point"], "why":"the ARENCON position / what good judgment looks like" } ]`;
  }
  if (mode === "mixed") {
    return `\n\nProduce a sensible mix of fact and judgment items for the topic (judgment for genuine design/decision questions, fact for checkable knowledge).
Respond with ONLY valid JSON — no markdown, no backticks. Each element is EITHER:
{ "type":"fact", "q":"...", "opts":["a","b","c","d"], "answer":0, "why":"..." }
OR
{ "type":"judgment", "scenario":"...", "rubric":["point","point"], "why":"..." }`;
  }
  // default: fact (v7-compatible)
  return `\n\nRespond with ONLY valid JSON — no markdown, no backticks:
[ { "type":"fact", "q":"question text", "opts":["a","b","c","d"], "answer":0, "why":"the reasoning a trainee should apply" } ]`;
}

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
// empty table or any failure → "" (identical to v7 behaviour).
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
    // 1. Validate the caller's Supabase JWT (capture id/email for logging)
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

    // 2. Parse body (v7 fields + additive v8 fields)
    const body = await req.json();
    const sourceText = (body.sourceText || "").trim();
    const photos = Array.isArray(body.photos) ? body.photos : [];
    // count default 4 (v7). Ceiling raised to 20; v7 callers send ≤8 so
    // their behaviour is unchanged.
    const count = Math.max(1, Math.min(20, parseInt(String(body.count)) || 4));
    // avoid ceiling raised to 40; v7 callers send ≤12 so unchanged.
    const avoid = Array.isArray(body.avoid)
      ? body.avoid.map((s: unknown) => String(s)).filter(Boolean).slice(0, 40)
      : [];
    const topic = String(body.topic || "").trim();
    let mode = String(body.mode || "fact").toLowerCase();
    if (mode !== "fact" && mode !== "judgment" && mode !== "mixed") mode = "fact";

    if (!sourceText && photos.length === 0 && !topic) {
      return json(
        { error: "Provide sourceText, at least one photo, or a topic" },
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
    let qText = `Generate exactly ${count} item${count === 1 ? "" : "s"}`;
    if (topic) qText += ` on the topic: "${topic}"`;
    if (photos.length) qText += " based on what the image(s) show";
    if (sourceText) {
      qText += (photos.length || topic ? " and the source below" : " from the source below") +
        ":\n\n" + sourceText.slice(0, 12000);
    } else qText += ".";
    if (avoid.length) {
      qText += "\n\nDo NOT repeat or closely paraphrase any of these existing items:\n- " +
        avoid.join("\n- ");
    }
    content.push({ type: "text", text: qText });

    // 4. System prompt = base rules + P11 style + the JSON shape for mode
    const STYLE = await styleBlock(SUPABASE_URL, SERVICE_KEY);
    const system = BASE_RULES + STYLE + shapeFor(mode);

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
        max_tokens: 8000,
        system,
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
      return json({ error: "AI response was not an item array" }, 500, headers);
    }

    // 6. Normalize/clamp by item type. A missing type defaults to "fact"
    //    (v7 items had no type). Judgment items are NOT dropped by the
    //    4-option check (that v7 filter would have deleted them).
    const quiz = (quizArr as Array<Record<string, unknown>>)
      .slice(0, 20)
      .map((q) => {
        const t = String((q && q.type) || "fact").toLowerCase();
        if (t === "judgment") {
          const rubric = (Array.isArray(q && q.rubric) ? (q.rubric as unknown[]) : [])
            .map((x) => String(x).trim())
            .filter(Boolean)
            .slice(0, 8);
          return {
            type: "judgment",
            topic: topic || String((q && q.topic) || ""),
            scenario: String((q && q.scenario) || (q && q.q) || "").trim(),
            rubric,
            why: String((q && q.why) || "").trim(),
          };
        }
        return {
          type: "fact",
          topic: topic || String((q && q.topic) || ""),
          q: String((q && q.q) || ""),
          opts: (Array.isArray(q && q.opts) ? (q.opts as unknown[]) : [])
            .slice(0, 4)
            .map(String),
          answer: Math.max(0, Math.min(3, parseInt(String(q && q.answer)) || 0)),
          why: String((q && q.why) || ""),
        };
      })
      .filter((q) =>
        q.type === "judgment"
          ? Boolean((q as { scenario: string }).scenario) &&
            (q as { rubric: string[] }).rubric.length > 0
          : Boolean((q as { q: string }).q) &&
            (q as { opts: string[] }).opts.length === 4
      );

    if (quiz.length === 0) {
      return json({ error: "No usable items returned" }, 500, headers);
    }

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
        action: "quiz_draft",
        model: MODEL.id,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: cost,
        field_count: photos.length,
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
