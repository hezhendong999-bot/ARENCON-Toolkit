// ARENCON Training Center — Document Text-Extraction Edge Function
// Extracts plain text from an uploaded PDF / DOCX / PPTX so the admin
// can turn a document into a quiz (the extracted text is fed into the
// existing `training-quiz` function — this function does NOT call any AI
// and therefore has zero token cost and logs nothing).
//
// Single-purpose by design (modularity rule): this function ONLY does
// document text extraction. It is independent of `training-quiz`, the
// Cloudflare Worker, and FRT — one breaking cannot cascade.
//
// Secrets (all auto-injected by Supabase — nothing to set by hand):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Auth: verify_jwt enabled at deploy → Supabase rejects any request
// without a valid logged-in user before this code runs. We re-check the
// JWT here only to fail clearly with a JSON error (not a bare 401).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { unzipSync, strFromU8 } from "https://esm.sh/fflate@0.8.2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const ALLOWED_ORIGINS = [
  "https://hezhendong999-bot.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

// Hard cap on returned text. The quiz function already slices to 12k
// chars; we return more so the admin can see/trim it, but never an
// unbounded blob (protects the browser and the response size).
const MAX_CHARS = 200_000;

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

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Pull readable text out of an OOXML part. <w:t> (Word) and <a:t>
// (PowerPoint) hold the run text; paragraph/line tags become newlines so
// the result is not one giant unbroken line.
function xmlToText(xml: string): string {
  let s = xml;
  // paragraph + line breaks → newline before we strip tags
  s = s.replace(/<\/w:p>/g, "\n")
       .replace(/<\/a:p>/g, "\n")
       .replace(/<w:br\s*\/?>/g, "\n")
       .replace(/<a:br\s*\/?>/g, "\n");
  // keep only the inside of text runs
  const runs: string[] = [];
  const re = /<(?:w|a):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:w|a):t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) runs.push(m[1]);
  let text = runs.join("");
  // re-insert the paragraph newlines that survived as standalone \n
  // (the run regex drops them, so fall back to a tag-strip if we got
  // nothing — handles unusual exports)
  if (!text.trim()) {
    text = s.replace(/<[^>]+>/g, " ");
  }
  return decodeEntities(text);
}

function decodeEntities(t: string): string {
  return t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { kind: "pdf", text: String(text || ""), units: totalPages, unitLabel: "pages" };
}

function extractDocx(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const main = files["word/document.xml"];
  if (!main) throw new Error("Not a valid .docx (missing word/document.xml)");
  let text = xmlToText(strFromU8(main));
  // append footnotes/endnotes if present (often hold real content)
  for (const extra of ["word/footnotes.xml", "word/endnotes.xml"]) {
    if (files[extra]) {
      const t = xmlToText(strFromU8(files[extra]));
      if (t.trim()) text += "\n\n" + t;
    }
  }
  return { kind: "docx", text, units: 1, unitLabel: "document" };
}

function extractPptx(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)![1], 10);
      const nb = parseInt(b.match(/(\d+)/)![1], 10);
      return na - nb;
    });
  if (slideNames.length === 0) {
    throw new Error("Not a valid .pptx (no slides found)");
  }
  const parts: string[] = [];
  slideNames.forEach((n, i) => {
    const t = xmlToText(strFromU8(files[n]));
    parts.push(`--- Slide ${i + 1} ---\n${t}`);
  });
  return {
    kind: "pptx",
    text: parts.join("\n\n"),
    units: slideNames.length,
    unitLabel: "slides",
  };
}

function detectKind(filename: string, mediaType: string): string {
  const f = (filename || "").toLowerCase();
  const m = (mediaType || "").toLowerCase();
  if (f.endsWith(".pdf") || m.includes("pdf")) return "pdf";
  if (f.endsWith(".docx") || m.includes("wordprocessingml")) return "docx";
  if (f.endsWith(".pptx") || m.includes("presentationml")) return "pptx";
  return "";
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
    // 1. Validate caller's JWT (capture nothing — extraction is not
    //    logged — but fail with a clean JSON error if unauthenticated).
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

    // 2. Parse body: { file: base64, filename, media_type }
    const body = await req.json();
    const b64 = String(body.file || "");
    const filename = String(body.filename || "");
    const mediaType = String(body.media_type || "");
    if (!b64) {
      return json({ error: "No file supplied (expect base64 in `file`)" }, 400, headers);
    }

    const kind = detectKind(filename, mediaType);
    if (!kind) {
      return json(
        { error: "Unsupported file type. Use PDF, DOCX, or PPTX." },
        400,
        headers,
      );
    }

    const bytes = b64ToBytes(b64);
    // ~15 MB decoded ceiling — well past any real training doc, keeps
    // the function inside Edge memory limits.
    if (bytes.length > 15 * 1024 * 1024) {
      return json(
        { error: "File too large (max ~15 MB). Split it or paste the text." },
        413,
        headers,
      );
    }

    let result: { kind: string; text: string; units: number; unitLabel: string };
    try {
      if (kind === "pdf") result = await extractPdf(bytes);
      else if (kind === "docx") result = extractDocx(bytes);
      else result = extractPptx(bytes);
    } catch (e) {
      console.error("Extraction failed:", kind, (e as Error).message);
      return json(
        {
          error:
            "Could not read that " + kind.toUpperCase() +
            ". It may be scanned/image-only or corrupt — paste the text instead.",
          detail: (e as Error).message,
        },
        422,
        headers,
      );
    }

    let text = (result.text || "").replace(/\u0000/g, "").trim();
    let truncated = false;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      truncated = true;
    }

    if (!text) {
      return json(
        {
          error:
            "No selectable text found. A scanned/photo PDF has no text layer — " +
            "use the photo-to-quiz path instead.",
        },
        422,
        headers,
      );
    }

    return json(
      {
        text,
        meta: {
          kind: result.kind,
          chars: text.length,
          units: result.units,
          unit_label: result.unitLabel,
          truncated,
        },
      },
      200,
      headers,
    );
  } catch (err) {
    console.error("Edge function error (training-extract):", err);
    return json(
      { error: "Internal error", detail: (err as Error).message },
      500,
      headers,
    );
  }
});
