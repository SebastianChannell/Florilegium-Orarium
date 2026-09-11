import { json, normalizeInline, requireAdmin } from "../../src/ingest-common.js";

const DEFAULT_MODEL = "gpt-5.6-terra";
const languageNames = Object.freeze({
  LA: "Latin",
  EN: "English",
  SP: "Spanish",
  IT: "Italian",
});

function outputText(response) {
  if (typeof response.output_text === "string" && response.output_text) return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

export async function onRequestPost({ request, env }) {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured." }, 503);

  try {
    const body = await request.json();
    const targetCode = String(body.targetCode || "").toUpperCase();
    if (!new Set(["EN", "SP", "IT"]).has(targetCode)) {
      return json({ error: "Choose English, Spanish, or Italian as the translation language." }, 400);
    }

    const sources = (Array.isArray(body.languages) ? body.languages : [])
      .map((language) => ({
        code: String(language?.code || "").toUpperCase(),
        text: normalizeInline(language?.text || ""),
      }))
      .filter((language) => languageNames[language.code] && language.code !== targetCode && language.text);

    if (sources.length === 0) {
      return json({ error: "Add source text in another language before translating." }, 400);
    }

    const source = sources.find((language) => language.code === "LA") || sources[0];
    const instructions = [
      `Translate the supplied traditional Catholic prayer or hymn from ${languageNames[source.code]} into ${languageNames[targetCode]}.`,
      "Return the complete translation only, with no title, language heading, quotation marks, commentary, or translator notes.",
      "Use reverent, faithful devotional language. Do not paraphrase or modernize the theology.",
      "Preserve paragraph breaks, Markdown, crosses, and liturgical markers such as V. / R. / Ant.",
    ].join("\n");

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
        input: source.text,
        text: {
          format: {
            type: "json_schema",
            name: "orarium_review_translation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["text"],
              properties: { text: { type: "string" } },
            },
          },
        },
      }),
    });

    const response = await openai.json();
    if (!openai.ok) {
      return json({ error: response?.error?.message || "The translation model could not translate this text." }, openai.status >= 500 ? 502 : 400);
    }

    const raw = outputText(response);
    if (!raw) return json({ error: "The translation model returned no text." }, 502);
    const translated = normalizeInline(JSON.parse(raw).text || "");
    if (!translated) return json({ error: "The translation model returned an empty translation." }, 502);

    return json({ language: { code: targetCode, text: translated, provenance: "generated" } });
  } catch (error) {
    return json({ error: error?.message || "Could not translate this text." }, 400);
  }
}
