import { json, oneLine, requireAdmin, slugify } from "../../src/ingest-common.js";

const MAX_SOURCE_CHARS = 90000;
const DEFAULT_MODEL = "gpt-5.6-terra";

function decodeHtmlEntities(value) {
  const entities = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  };
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] ?? match);
}

function htmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|hr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? oneLine(decodeHtmlEntities(match[1].replace(/<[^>]+>/g, " "))) : "";
}

async function resolveSource(source) {
  const raw = String(source || "").trim();
  if (!raw) throw new Error("Paste a prayer, hymn, or webpage URL first.");

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { text: raw.slice(0, MAX_SOURCE_CHARS), sourceUrl: "", sourceTitle: "" };
  }

  if (!new Set(["https:", "http:"]).has(url.protocol)) {
    throw new Error("Only http and https source URLs are supported.");
  }

  const hostname = url.hostname.toLowerCase();
  const privateHost = hostname === "localhost" || hostname.endsWith(".local") || hostname === "::1" ||
    /^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^0\./.test(hostname);
  if (privateHost) throw new Error("Local or private source URLs are not supported.");

  const response = await fetch(url.toString(), {
    redirect: "follow",
    headers: { accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
  });
  if (!response.ok) throw new Error(`Could not read that webpage (${response.status}).`);

  const contentType = response.headers.get("content-type") || "";
  const rawBody = (await response.text()).slice(0, 500000);
  const text = contentType.includes("html") ? htmlToText(rawBody) : rawBody.trim();
  if (!text) throw new Error("No readable text was found on that webpage.");

  return {
    text: text.slice(0, MAX_SOURCE_CHARS),
    sourceUrl: response.url || url.toString(),
    sourceTitle: contentType.includes("html") ? pageTitle(rawBody) : "",
  };
}

function outputText(response) {
  if (typeof response.output_text === "string" && response.output_text) return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function schema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "title", "type", "devotion", "search", "languages", "notes"],
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      type: { type: "string", enum: ["prayer", "hymn"] },
      devotion: { type: "string" },
      search: { type: "array", items: { type: "string" }, maxItems: 8 },
      languages: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["code", "text", "provenance"],
          properties: {
            code: { type: "string", enum: ["LA", "EN", "SP", "IT"] },
            text: { type: "string" },
            provenance: { type: "string", enum: ["source", "generated"] },
          },
        },
      },
      notes: { type: "array", items: { type: "string" }, maxItems: 5 },
    },
  };
}

export async function onRequestPost({ request, env }) {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured." }, 503);

  try {
    const body = await request.json();
    const generateTranslations = body.generateTranslations === true;
    const source = await resolveSource(body.source);
    const devotions = [...new Set((Array.isArray(body.devotions) ? body.devotions : []).map(oneLine).filter(Boolean))].slice(0, 100);
    const devotionInstruction = devotions.length
      ? `Choose devotion exactly from this existing list: ${devotions.join(" | ")}`
      : "Choose a concise traditional Catholic devotion label.";

    const instructions = [
      "You prepare prayer and hymn entries for Orarium, a traditional Catholic prayer collection.",
      "Extract the principal prayer or hymn from the supplied material. Remove navigation, article commentary, advertisements, footnotes that are not part of the prayer, and unrelated prose.",
      "Preserve source-language wording faithfully. Do not modernize devotional wording unless the source itself is modern.",
      "Recognize Latin as LA, English as EN, Spanish as SP, and Italian as IT.",
      generateTranslations
        ? "Generate complete English and Spanish translations when either is missing, mark each generated translation generated, and never generate or reconstruct Latin that is not present in the source."
        : "Do not generate translations. Return only languages actually present in the supplied source and mark them source.",
      "When multiple source languages are present, mark each copied language source. Generated translations must preserve paragraph breaks and liturgical V. / R. / Ant. markers.",
      "Do not add commentary to any language text. Put uncertainties only in notes.",
      "Use a concise stable lowercase-hyphen id. Use an English title when an English title is reasonably available; otherwise use the conventional source title.",
      devotionInstruction,
      "Search terms should be short alternate titles, saint names, or subjects, not sentences.",
    ].join("\n");

    const input = [
      source.sourceTitle ? `WEBPAGE TITLE: ${source.sourceTitle}` : "",
      source.sourceUrl ? `SOURCE URL: ${source.sourceUrl}` : "",
      "SOURCE MATERIAL:",
      source.text,
    ].filter(Boolean).join("\n\n");

    const openai = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.ORARIUM_INGEST_MODEL || DEFAULT_MODEL,
        store: false,
        instructions,
        input,
        text: {
          format: {
            type: "json_schema",
            name: "orarium_ingest",
            strict: true,
            schema: schema(),
          },
        },
      }),
    });

    const response = await openai.json();
    if (!openai.ok) {
      const message = response?.error?.message || "The analysis model could not process this source.";
      return json({ error: message }, openai.status >= 500 ? 502 : 400);
    }

    const text = outputText(response);
    if (!text) return json({ error: "The analysis model returned no structured result." }, 502);

    const draft = JSON.parse(text);
    draft.id = slugify(draft.id || draft.title);
    draft.sourceUrl = source.sourceUrl;
    draft.sourceTitle = source.sourceTitle;

    return json({ draft });
  } catch (error) {
    return json({ error: error?.message || "Could not analyze this source." }, 400);
  }
}
