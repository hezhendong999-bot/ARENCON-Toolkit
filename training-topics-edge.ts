// ARENCON Training Center — Topic Proposal Edge Function
// Proposes 5–10 candidate assessment topics from an admin keyword plus
// the lesson source text. Mark then narrows/edits/approves them
// (roadmap §9 — accurate gap analysis needs Mark-approved topics, not
// AI-invented ones). This function ONLY proposes topics.
//
// Single-purpose by design (modularity rule): independent of
// `training-quiz`, `training-extract`, the Cloudflare Worker, and FRT —
// one breaking cannot cascade.
//
// Secrets required (Supabase Dashboard → Edge Functions → Manage secrets):
//   ANTHROPIC_API_KEY          — sk-ant-...
//   SUPABASE_URL               — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
//
// Auth: deployed verify_jwt=false so the browser CORS preflight passes;
// the JWT is validated in-code below (same security).
//
// P11: the Mark-curated tc_style_corpus is injected so proposed topic
// wording matches ARENCON voice/terminology.

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

// P11: pull the style corpus and turn it into a compact STYLE block.
// Never blocks generation — any failure or empty table → "" (no-op,
// so behaviour is identical to having no corpus yet).
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

    // 2. Parse body
    const body = await req.json();
    const keyword = String(body.keyword || "").trim();
    const sourceText = String(body.sourceText || "").trim();
    const count = Math.max(5, Math.min(12, parseInt(String(body.count)) || 8));
    const avoid = Array.isArray(body.avoid)
      ? body.avoid.map((s: unknown) => String(s)).filter(Boolean).slice(0, 30)
      : [];

    if (!keyword && !sourceText) {
      return json(
        { error: "Provide a keyword and/or lesson source text" },
        400,
        headers,
      );
    }

    // 3. Build prompt (+ P11 style corpus)
    const STYLE = await styleBlock(SUPABASE_URL, SERVICE_KEY);

    const system =
      `You define assessment TOPICS for fire protection trainees at ARENCON Inc., ` +
      `a consulting firm in Ontario, Canada (OBC / NFPA / ULC context).\n\n` +
      `Given an admin keyword and/or lesson source text, propose distinct, ` +
      `assessable sub-topics — each one something you could write several ` +
      `reasoning questions about. Topics must be GROUNDED in the supplied ` +
      `material and keyword; do NOT invent scope that is not present. Prefer ` +
      `topics that test understanding and judgment, not trivia. Keep each ` +
      `topic name short (2–6 words) and specific (e.g. "Hydraulic remote-area ` +
      `selection", not "Hydraulics").` +
      STYLE +
      `\n\nRespond with ONLY valid JSON — no markdown, no backticks:\n` +
      `[ { "name": "short topic name", "rationale": "one line: what this ` +
      `topic assesses and why it matters" } ]`;

    let userText = `Propose exactly ${count} candidate topics.`;
    if (keyword) userText += `\n\nKeyword / focus: ${keyword}`;
    if (sourceText) {
      userText += `\n\nLesson source text:\n\n` + sourceText.slice(0, 14000);
    }
    if (avoid.length) {
      userText +=
        `\n\nDo NOT propose any topic that duplicates or closely overlaps ` +
        `these already-approved topics:\n- ` + avoid.join("\n- ");
    }

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
        system,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error (topic_propose):", aiRes.status, errText);
      return json({ error: "AI service error", detail: aiRes.status }, 502, headers);
    }

    const aiData = await aiRes.json();
    const aiOut = (aiData.content || [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("");

    let arr: unknown;
    try {
      arr = JSON.parse(aiOut.replace(/```json|```/g, "").trim());
    } catch (_e) {
      console.error("Failed to parse topic_propose response:", aiOut);
      return json({ error: "AI returned invalid format", raw: aiOut }, 500, headers);
    }
    if (!Array.isArray(arr) || arr.length === 0) {
      return json({ error: "AI response was not a topic array" }, 500, headers);
    }

    // 5. Normalize/clamp
    const seen = new Set<string>();
    const topics = (arr as Array<Record<string, unknown>>)
      .map((t) => ({
        name: String((t && t.name) || "").trim(),
        rationale: String((t && t.rationale) || "").trim(),
      }))
      .filter((t) => {
        const k = t.name.toLowerCase();
        if (!t.name || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, count);

    if (topics.length === 0) {
      return json({ error: "No usable topics returned" }, 500, headers);
    }

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
        action: "topic_propose",
        model: MODEL.id,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: cost,
        field_count: topics.length,
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
      }).catch((err) => console.error("Usage log failed (topic_propose):", err));
      // @ts-ignore EdgeRuntime is available in Supabase Edge
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(logPromise);
      else await logPromise;
    }

    return json(
      {
        topics,
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
    console.error("Edge function error (training-topics):", err);
    return json(
      { error: "Internal error", detail: (err as Error).message },
      500,
      headers,
    );
  }
});
