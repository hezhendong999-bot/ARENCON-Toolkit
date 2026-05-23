// ARENCON Training Center — Attachment Signed-URL Edge Function
// v1. Slice 2d. Given an attachment id and a valid JWT, returns a
// short-lived signed download URL for the underlying storage object.
//
// Why this exists: the tc-module-attachments bucket is PRIVATE. Public
// URLs are off so files can't be guessed at via path. To download, the
// learner's browser asks this EF for a signed URL, then follows it.
//
// Input (POST body):
//   { attachment_id: uuid, expires_in?: number (seconds, default 3600) }
//
// Output (200):
//   { url: string, file_name: string, mime_type: string, size_bytes: number }
//
// Auth: deployed verify_jwt=false; JWT validated in-code (same pattern
// as the other three Training EFs).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = [
  "https://hezhendong999-bot.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

const BUCKET = "tc-module-attachments";
const DEFAULT_EXPIRES = 3600; // 1 hour
const MAX_EXPIRES = 7 * 24 * 3600; // 7 days hard cap

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

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "Server not configured" }, 500, headers);
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
    if (!userRes.ok) {
      return json({ error: "Invalid or expired auth token" }, 401, headers);
    }

    // 2. Parse body
    const body = await req.json();
    const attachmentId = String(body.attachment_id || "").trim();
    let expiresIn = parseInt(String(body.expires_in || DEFAULT_EXPIRES), 10);
    if (!attachmentId) return json({ error: "attachment_id is required" }, 400, headers);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) expiresIn = DEFAULT_EXPIRES;
    if (expiresIn > MAX_EXPIRES) expiresIn = MAX_EXPIRES;

    // 3. Look up the attachment row to find the storage_path + metadata
    const lookupRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tc_module_attachments?id=eq.${encodeURIComponent(attachmentId)}&select=id,storage_path,file_name,mime_type,size_bytes`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      },
    );
    if (!lookupRes.ok) {
      return json({ error: "Lookup failed" }, 500, headers);
    }
    const rows = await lookupRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ error: "Attachment not found" }, 404, headers);
    }
    const att = rows[0];

    // 4. Mint signed URL via Supabase Storage admin API
    const signRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${att.storage_path}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn }),
      },
    );
    if (!signRes.ok) {
      const t = await signRes.text();
      console.error("Sign failed:", signRes.status, t);
      return json({ error: "Failed to sign URL", detail: t }, 500, headers);
    }
    const signData = await signRes.json();
    // signedURL is a path like /object/sign/{bucket}/{path}?token=...
    const signedPath = signData.signedURL || signData.signedUrl;
    if (!signedPath) {
      return json({ error: "Sign response missing URL" }, 500, headers);
    }
    const fullUrl = `${SUPABASE_URL}/storage/v1${signedPath.startsWith("/") ? "" : "/"}${signedPath}`;

    return json(
      {
        url: fullUrl,
        file_name: att.file_name,
        mime_type: att.mime_type,
        size_bytes: att.size_bytes,
        expires_in: expiresIn,
      },
      200,
      headers,
    );
  } catch (err) {
    console.error("Edge function error (signurl):", err);
    return json({ error: "Internal error", detail: (err as Error).message }, 500, headers);
  }
});
