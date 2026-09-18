// Reads an uploaded Word or PDF evidence document and reports what it says about
// one indicator. It never writes indicator_progress: it records a finding, and
// the database decides whether that finding is news (merl.reconcile_evidence_figure).
//
// POST { analysis_id: uuid }   Authorization: Bearer <user JWT>
//
// Requires secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.126.0";
import { unzipSync, strFromU8 } from "npm:fflate@0.8.3";
import { extractText, getDocumentProxy } from "npm:unpdf@1.8.1";

const MODEL = "claude-opus-5";
const MAX_DOC_CHARS = 200_000;
const BUCKET = "merl-indicator-evidence";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** DOCX is a zip; the body text lives in word/document.xml. */
function docxToText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const parts: string[] = [];
  for (const name of ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"]) {
    if (!files[name]) continue;
    const xml = strFromU8(files[name]);
    parts.push(
      xml
        // keep paragraph and table-cell boundaries as newlines so headings survive
        .replace(/<\/w:p>/g, "\n")
        .replace(/<\/w:tc>/g, "\t")
        .replace(/<w:br[^>]*\/>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
    );
  }
  return parts.join("\n");
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["relevance", "relevance_reason", "progress_found"],
  properties: {
    relevance: {
      type: "string",
      enum: ["relevant", "partial", "not_relevant", "unclear"],
      description:
        "relevant = the document reports on this exact indicator; partial = it covers related activity but not the indicator's own measure; not_relevant = it is about something else; unclear = cannot tell.",
    },
    relevance_reason: { type: "string", description: "One or two sentences, citing what in the document decided this." },
    progress_found: { type: "boolean", description: "True only if the document states a figure for THIS indicator's measure." },
    extracted_value: { type: ["number", "null"], description: "The figure, in the indicator's unit. Null if none is stated. Never estimate, infer or sum unless the document itself presents the total." },
    extracted_unit: { type: ["string", "null"] },
    extracted_period: { type: ["string", "null"], description: "Reporting period label exactly as the document words it, e.g. 'Q2 2026'." },
    as_of_date: { type: ["string", "null"], description: "ISO date the figure is stated as at, if the document says." },
    evidence_quote: { type: ["string", "null"], description: "The sentence containing the figure, copied verbatim. Required whenever extracted_value is not null." },
    source_location: { type: ["string", "null"], description: "Page number, heading or table the figure came from." },
    confidence: { type: "number", description: "0 to 1. Below 0.5 means a person should check before this is used." },
    caveats: { type: ["string", "null"], description: "Anything that would mislead a reader: conflicting figures in the document, ambiguous units, a total that mixes scopes." },
  },
} as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "ANTHROPIC_API_KEY is not configured on this project. Set it with: supabase secrets set ANTHROPIC_API_KEY=sk-ant-..." }, 503);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing bearer token." }, 401);

  let analysisId: string;
  try {
    ({ analysis_id: analysisId } = await req.json());
  } catch {
    return json({ error: "Body must be JSON: { analysis_id }" }, 400);
  }
  if (!analysisId) return json({ error: "analysis_id is required." }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // The caller must be allowed to see this analysis. Ask the database as the
  // caller (RLS applies) before doing any work with the service key.
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: visible, error: visErr } = await asCaller
    .from("v_evidence_analysis").select("id").eq("id", analysisId).maybeSingle();
  if (visErr) return json({ error: visErr.message }, 400);
  if (!visible) return json({ error: "Analysis not found, or you do not have access to it." }, 403);

  const fail = async (message: string, status = 500) => {
    await service.rpc("record_evidence_analysis", {
      p_analysis_id: analysisId, p_status: "failed", p_payload: { error: message },
    });
    return json({ error: message }, status);
  };

  const { data: row, error: rowErr } = await service
    .from("v_evidence_analysis").select("*").eq("id", analysisId).single();
  if (rowErr || !row) return fail(rowErr?.message ?? "Analysis row missing.", 404);

  // ── fetch the document ────────────────────────────────────────────────────
  const prefix = `storage://${BUCKET}/`;
  if (!row.file_url?.startsWith(prefix)) {
    return fail("This evidence points at an external link rather than an uploaded file, so it cannot be read.", 400);
  }
  const path = row.file_url.slice(prefix.length);
  const { data: blob, error: dlErr } = await service.storage.from(BUCKET).download(path);
  if (dlErr || !blob) return fail(`Could not download the evidence file: ${dlErr?.message ?? "unknown error"}`);

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const lower = path.toLowerCase();
  let text = "";
  let method = "text";
  let pages: number | null = null;

  try {
    if (lower.endsWith(".pdf")) {
      method = "pdf";
      const pdf = await getDocumentProxy(bytes);
      pages = pdf.numPages;
      const result = await extractText(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } else if (lower.endsWith(".docx")) {
      method = "docx";
      text = docxToText(bytes);
    } else if (lower.endsWith(".doc")) {
      return fail("Legacy .doc files cannot be read. Save the document as .docx or PDF and upload it again.", 415);
    } else {
      method = "text";
      text = new TextDecoder().decode(bytes);
    }
  } catch (e) {
    return fail(`Could not read the document (${method}): ${e instanceof Error ? e.message : String(e)}`);
  }

  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 40) {
    return fail("No readable text was found. If this is a scanned document it needs OCR before it can be analysed.", 422);
  }
  const truncated = text.length > MAX_DOC_CHARS;
  const sent = truncated ? text.slice(0, MAX_DOC_CHARS) : text;

  // ── what does the framework already hold for this indicator? ──────────────
  const { data: recorded } = await service
    .from("v_indicator_progress")
    .select("reporting_period, cumulative_actual, actual_this_period, date_reported, review_status")
    .eq("indicator_id", row.indicator_id)
    .order("date_reported", { ascending: false })
    .limit(5);


  const system = [
    "You read monitoring and evaluation evidence for the Vanuatu Department of Climate Change MERL portal.",
    "You are given ONE indicator and ONE uploaded document. Decide whether the document reports on that indicator, and if so, what figure it states.",
    "",
    "Rules, in order of importance:",
    "1. Never invent, estimate, derive or sum a figure. Report a value only if the document states it as a total for this indicator's measure. If the document lists components but no total, set progress_found false and say so in caveats.",
    "2. evidence_quote must be copied verbatim from the document. If you cannot quote it, you do not have it.",
    "3. Match the indicator's unit. A count of workshops is not a count of hectares. If the document's unit differs from the indicator's, set relevance 'partial' and explain in caveats.",
    "4. A document about related activity that never measures this indicator is 'partial', not 'relevant'.",
    "5. Be conservative with confidence. Below 0.5 means a person must check it.",
    "",
    "The figures already recorded are given for context only. Do not let them influence what you read in the document; reporting the same number again is a useful answer.",
  ].join("\n");

  const user = [
    `INDICATOR CODE: ${row.indicator_code}`,
    `INDICATOR NAME: ${row.indicator_name}`,
    `UNIT OF MEASURE: ${row.indicator_unit ?? "(not stated)"}`,
    `END-OF-PROJECT TARGET: ${row.target_value ?? "(not set)"}`,
    "",
    "ALREADY RECORDED IN THE FRAMEWORK (context only):",
    recorded?.length
      ? recorded.map((r) => `- ${r.reporting_period}: ${r.cumulative_actual ?? r.actual_this_period ?? "no figure"} (as at ${r.date_reported ?? "unknown"}, ${r.review_status})`).join("\n")
      : "- nothing recorded yet",
    "",
    `DOCUMENT TITLE: ${row.evidence_title}`,
    `DOCUMENT TYPE: ${row.document_type ?? "(unspecified)"}`,
    `DOCUMENT DATE: ${row.document_date ?? "(unspecified)"}`,
    truncated ? `\nNOTE: this document is ${text.length} characters; only the first ${MAX_DOC_CHARS} are included below. Say so in caveats if the figure you need may lie beyond that point.\n` : "",
    "--- DOCUMENT TEXT ---",
    sent,
    "--- END DOCUMENT TEXT ---",
  ].join("\n");

  let parsed: Record<string, unknown>;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") {
      return fail("The analyser declined to process this document.", 422);
    }
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return fail("The analyser returned no readable result.");
    parsed = JSON.parse(block.text);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return fail("The configured ANTHROPIC_API_KEY was rejected.", 401);
    if (e instanceof Anthropic.RateLimitError) return fail("The analyser is rate limited. Try again shortly.", 429);
    if (e instanceof Anthropic.APIError) return fail(`Analyser error ${e.status}: ${e.message}`);
    return fail(`Analysis failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // A quote is the only thing standing between a real figure and a hallucinated
  // one, so drop any value that arrives without one.
  if (parsed.extracted_value != null && !parsed.evidence_quote) {
    parsed.extracted_value = null;
    parsed.progress_found = false;
    parsed.caveats = `${parsed.caveats ?? ""} A figure was proposed without a supporting quotation and has been discarded.`.trim();
  }

  const payload = {
    ...parsed,
    relevance_reason: [parsed.relevance_reason, parsed.caveats ? `Caveats: ${parsed.caveats}` : null]
      .filter(Boolean).join(" "),
    extract_method: method,
    doc_chars: text.length,
    doc_pages: pages,
    doc_truncated: truncated,
    model: MODEL,
  };

  const { error: recErr } = await service.rpc("record_evidence_analysis", {
    p_analysis_id: analysisId, p_status: "complete", p_payload: payload,
  });
  if (recErr) return fail(`Could not save the finding: ${recErr.message}`);

  const { data: final } = await service
    .from("v_evidence_analysis")
    .select("relevance, progress_found, extracted_value, extracted_unit, extracted_period, confidence, reconciliation, reconciliation_detail")
    .eq("id", analysisId).single();

  return json({ ok: true, analysis_id: analysisId, ...final });
});
