// ARENCON Training Center — AI Usage Summary Edge Function
// Read-only. Returns the SIGNED-IN user's own AI spend aggregated from
// the shared `ai_usage_log` table (the same table FRT's Worker and the
// `training-quiz` function write to). Account-scoped, NOT project-scoped
// — the FRT panel keyed on a project; here it keys on the admin account.
//
// Why an Edge Function instead of reading the table from the browser:
//  - no RLS read-policy needs to be added/loosened on a shared table
//  - the browser only ever receives aggregates, never raw rows
//  - consistent with how the rest of Training Center AI is plumbed
//
// Secrets (all auto-injected by Supabase — nothing to set by hand):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Auth: verify_jwt=false at deploy (so the browser CORS preflight passes
// — same rationale as training-quiz); the JWT is validated in-code below.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = [
  "https://hezhendong999-bot.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

// Bound the scan. A single admin's quiz-drafting volume is low; this is
// many years of headroom. If ever hit, `capped:true` is returned so the
// UI can say so honestly rather than silently undercount.
const ROW_CAP = 10000;

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

type Row = {
  cost_usd: number | string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  tool: string | null;
  action: string | null;
  model: string | null;
};

function emptyBucket() {
  return { cost: 0, calls: 0, input_tokens: 0, output_tokens: 0 };
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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  try {
    // 1. Validate the caller's JWT → their own user_id (the scope key).
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

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: "Server not configured" }, 500, headers);
    }

    // 2. Fetch this user's own usage rows (service key = bypasses RLS;
    //    filtered to user_id so a user can only ever see their own).
    const q = new URL(`${SUPABASE_URL}/rest/v1/ai_usage_log`);
    q.searchParams.set("user_id", `eq.${userId}`);
    q.searchParams.set(
      "select",
      "cost_usd,input_tokens,output_tokens,created_at,tool,action,model",
    );
    q.searchParams.set("order", "created_at.desc");
    q.searchParams.set("limit", String(ROW_CAP));
    const rowsRes = await fetch(q.toString(), {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    if (!rowsRes.ok) {
      const t = await rowsRes.text();
      console.error("ai_usage_log read failed:", rowsRes.status, t);
      return json({ error: "Could not read usage" }, 502, headers);
    }
    const rows: Row[] = await rowsRes.json();

    // 3. Aggregate (UTC day / calendar-month-to-date / all-time).
    const now = new Date();
    const startToday = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const startMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

    const all = emptyBucket();
    const month = emptyBucket();
    const today = emptyBucket();
    const byTool: Record<string, ReturnType<typeof emptyBucket>> = {};
    const recent: Array<Record<string, unknown>> = [];

    for (const r of rows) {
      const cost = Number(r.cost_usd) || 0;
      const inT = Number(r.input_tokens) || 0;
      const outT = Number(r.output_tokens) || 0;
      const ts = Date.parse(r.created_at);

      const add = (b: ReturnType<typeof emptyBucket>) => {
        b.cost += cost;
        b.calls += 1;
        b.input_tokens += inT;
        b.output_tokens += outT;
      };
      add(all);
      if (!isNaN(ts) && ts >= startMonth) add(month);
      if (!isNaN(ts) && ts >= startToday) add(today);

      const toolKey = r.tool || "unknown";
      if (!byTool[toolKey]) byTool[toolKey] = emptyBucket();
      add(byTool[toolKey]);

      if (recent.length < 12) {
        recent.push({
          created_at: r.created_at,
          tool: r.tool,
          action: r.action,
          model: r.model,
          cost_usd: Math.round(cost * 1e6) / 1e6,
          input_tokens: inT,
          output_tokens: outT,
        });
      }
    }

    const round = (b: ReturnType<typeof emptyBucket>) => ({
      cost_usd: Math.round(b.cost * 1e6) / 1e6,
      calls: b.calls,
      input_tokens: b.input_tokens,
      output_tokens: b.output_tokens,
    });

    return json(
      {
        totals: {
          today: round(today),
          month: round(month),
          all: round(all),
        },
        by_tool: Object.entries(byTool)
          .map(([tool, b]) => ({ tool, ...round(b) }))
          .sort((a, b) => b.cost_usd - a.cost_usd),
        recent,
        capped: rows.length >= ROW_CAP,
        generated_at: new Date().toISOString(),
      },
      200,
      headers,
    );
  } catch (err) {
    console.error("Edge function error (training-usage):", err);
    return json(
      { error: "Internal error", detail: (err as Error).message },
      500,
      headers,
    );
  }
});
