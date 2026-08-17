import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { devotionsEs, sourceHashesEs } from "../translations/es.mjs";
import {
  formatGeneratedTranslation,
  loadGeneratedTranslations,
  sourceFingerprint,
} from "./spanish-translation-data.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contentDirectory = join(root, "content");
const outputDirectory = join(root, "translations", "es");
const defaultModel = "gpt-5.6-terra";
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const translationSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    search: {
      type: "array",
      items: { type: "string" },
    },
    text: { type: "string" },
  },
  required: ["title", "search", "text"],
  additionalProperties: false,
};

const instructions = `You are translating a traditional Catholic prayer or hymn into neutral, reverent Spanish for devotional use.

Translate faithfully rather than paraphrasing. Use established Catholic wording and traditional forms when they are natural in Spanish. Preserve the complete meaning, theological distinctions, titles of God, and devotional tone.

Formatting is inviolable:
- Preserve the exact Markdown block order, number of lines, blank-line pattern, heading levels, blockquotes, emphasis, numbered lists, and line breaks.
- Preserve V., R., Ant., crosses, punctuation that carries liturgical meaning, and every Markdown link destination exactly.
- Translate visible link labels, headings, rubrics, notes, and prose.
- Leave every word or phrase already written in Latin exactly as supplied. Do not translate or modernize Latin.
- Do not add commentary, translator notes, quotation marks, or headings that are absent from the source.

Return a concise Spanish title, 3–8 useful Spanish search aliases, and the complete Spanish Markdown body in the required schema.`;

function splitList(value = "") {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseContentFile(path) {
  const filename = basename(path);
  const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: expected metadata between --- lines`);

  const metadata = Object.fromEntries(match[1].split("\n").map((line) => {
    const separator = line.indexOf(":");
    if (separator === -1) throw new Error(`${filename}: invalid metadata line “${line}”`);
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));

  if (!idPattern.test(metadata.id ?? "") || `${metadata.id}.md` !== filename) {
    throw new Error(`${filename}: id must be lowercase, hyphenated, and match the filename`);
  }

  return {
    id: metadata.id,
    title: metadata.title,
    type: metadata.type,
    devotion: metadata.devotion,
    search: splitList(metadata.search),
    text: match[2].trim(),
    ...(metadata.language ? { language: metadata.language } : {}),
    ...(metadata.layout ? { layout: metadata.layout } : {}),
    ...(metadata.parent ? { parent: metadata.parent, hour: metadata.hour } : {}),
    ...(metadata.children ? { children: splitList(metadata.children) } : {}),
  };
}

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  throw new Error("OpenAI returned no structured translation text");
}

function markdownDestinations(text) {
  return [...String(text).matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function liturgicalMarkers(text) {
  return [...String(text).matchAll(/^[\t ]*(V\.|R\.|Ant\.)(?=[\t ]|$)/gm)].map((match) => match[1]);
}

function lineKind(line) {
  const trimmed = line.trim();
  if (!trimmed) return "blank";
  const heading = trimmed.match(/^(#{1,6})\s/);
  if (heading) return `heading-${heading[1].length}`;
  if (trimmed.startsWith(">")) return "blockquote";
  if (/^(?:[-*+] |\d+\. )/.test(trimmed)) return "list";
  if (/^\*[^*].*\*$/.test(trimmed) || /^_[^_].*_$/.test(trimmed)) return "emphasis";
  return "text";
}

export function validateGeneratedTranslation(item, translation) {
  if (!translation || typeof translation !== "object") throw new Error(`${item.id}: translation is not an object`);
  if (typeof translation.title !== "string" || !translation.title.trim() || translation.title.includes("\n")) {
    throw new Error(`${item.id}: generated title must be one non-empty line`);
  }
  if (!Array.isArray(translation.search) || translation.search.some((term) => typeof term !== "string")) {
    throw new Error(`${item.id}: generated search aliases must be strings`);
  }
  const search = [...new Set(translation.search.map((term) => term.trim()).filter(Boolean))];
  if (search.length < 3 || search.length > 8 || search.some((term) => term.includes("\n"))) {
    throw new Error(`${item.id}: generated Spanish requires 3–8 one-line search aliases`);
  }
  if (typeof translation.text !== "string" || !translation.text.trim()) {
    throw new Error(`${item.id}: generated Spanish body is empty`);
  }
  if (translation.text.trim() === item.text.trim()) {
    throw new Error(`${item.id}: generated body did not translate the source`);
  }

  const sourceLines = item.text.replace(/\r\n/g, "\n").split("\n");
  const translatedLines = translation.text.replace(/\r\n/g, "\n").split("\n");
  if (translatedLines.length !== sourceLines.length) {
    throw new Error(`${item.id}: Spanish must preserve the source line count`);
  }
  const sourceKinds = sourceLines.map(lineKind);
  const translatedKinds = translatedLines.map(lineKind);
  if (JSON.stringify(translatedKinds) !== JSON.stringify(sourceKinds)) {
    throw new Error(`${item.id}: Spanish must preserve Markdown and blank-line structure`);
  }
  if (JSON.stringify(markdownDestinations(translation.text)) !== JSON.stringify(markdownDestinations(item.text))) {
    throw new Error(`${item.id}: Spanish must preserve every Markdown link destination`);
  }
  if (JSON.stringify(liturgicalMarkers(translation.text)) !== JSON.stringify(liturgicalMarkers(item.text))) {
    throw new Error(`${item.id}: Spanish must preserve every V., R., and Ant. marker`);
  }
  for (const cross of ["☩", "✠", "†"]) {
    if (translation.text.split(cross).length !== item.text.split(cross).length) {
      throw new Error(`${item.id}: Spanish must preserve every ${cross} symbol`);
    }
  }

  return {
    title: translation.title.trim(),
    search,
    text: translation.text.trim(),
  };
}

export async function requestSpanishTranslation(item, {
  apiKey,
  model = defaultModel,
  fetchImpl = globalThis.fetch,
  validationFeedback = "",
} = {}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required. Add it as an Actions repository secret before running translation generation.");
  }
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions,
      input: JSON.stringify({
        source_language: item.language,
        spanish_devotion: devotionsEs[item.devotion],
        id: item.id,
        title: item.title,
        type: item.type,
        devotion: item.devotion,
        search: item.search,
        text: item.text,
        ...(validationFeedback ? { previous_validation_error: validationFeedback } : {}),
      }),
      max_output_tokens: 12000,
      text: {
        format: {
          type: "json_schema",
          name: "spanish_prayer_translation",
          strict: true,
          schema: translationSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`OpenAI translation request failed (${response.status}): ${detail}`);
  }

  const body = await response.json();
  if (body.status === "incomplete") {
    throw new Error(`OpenAI translation was incomplete: ${body.incomplete_details?.reason ?? "unknown reason"}`);
  }

  try {
    return JSON.parse(outputText(body));
  } catch (error) {
    throw new Error(`OpenAI returned invalid structured translation JSON: ${error.message}`);
  }
}

export function changedContentPaths(base, head = "HEAD", { cwd = root } = {}) {
  const zero = /^0+$/.test(base ?? "");
  let comparisonBase = base;
  if (zero || !base) {
    try {
      comparisonBase = execFileSync("git", ["merge-base", "origin/main", head], {
        cwd,
        encoding: "utf8",
      }).trim();
    } catch {
      comparisonBase = "";
    }
  }
  const args = comparisonBase
    ? ["diff", "--name-only", "--diff-filter=AMR", comparisonBase, head, "--", "content"]
    : ["diff-tree", "--root", "--no-commit-id", "--name-only", "--diff-filter=AMR", "-r", head, "--", "content"];
  const output = execFileSync("git", args, { cwd, encoding: "utf8" });
  return [...new Set(output.split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => /^content\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(entry))
    .filter((entry) => existsSync(join(cwd, entry))))];
}

export function allContentPaths({ cwd = root } = {}) {
  return readdirSync(join(cwd, "content"))
    .filter((filename) => idPattern.test(filename.replace(/\.md$/, "")) && filename.endsWith(".md"))
    .sort()
    .map((filename) => `content/${filename}`);
}

export async function generateSpanishTranslations(paths, {
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_TRANSLATION_MODEL || defaultModel,
  force = false,
  fetchImpl = globalThis.fetch,
  destination = outputDirectory,
  curatedSourceHashes = sourceHashesEs,
} = {}) {
  const existing = loadGeneratedTranslations(destination);
  const results = [];
  mkdirSync(destination, { recursive: true });

  for (const relativePath of [...new Set(paths)].sort()) {
    const sourcePath = resolve(root, relativePath);
    if (!sourcePath.startsWith(`${contentDirectory}/`) || !existsSync(sourcePath)) continue;
    const item = parseContentFile(sourcePath);

    if (!item.language || item.language === "la") {
      results.push({ id: item.id, status: "skipped", reason: "Latin or unmarked original-language text" });
      continue;
    }
    if (item.layout === "parallel") {
      results.push({ id: item.id, status: "skipped", reason: "Little Office rows use the curated parallel translation map" });
      continue;
    }
    if (!devotionsEs[item.devotion]) {
      throw new Error(`${item.id}: add “${item.devotion}” to devotionsEs before generating Spanish`);
    }

    const fingerprint = sourceFingerprint(item);
    const currentSourceHash = existing.get(item.id)?.sourceHash ?? curatedSourceHashes[item.id];
    if (!force && currentSourceHash === fingerprint) {
      results.push({ id: item.id, status: "unchanged" });
      continue;
    }

    let translated;
    let validationError = "";
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const candidate = await requestSpanishTranslation(item, {
        apiKey,
        model,
        fetchImpl,
        validationFeedback: validationError,
      });
      try {
        translated = validateGeneratedTranslation(item, candidate);
        break;
      } catch (error) {
        validationError = error.message;
        if (attempt === 2) throw error;
      }
    }

    const outputPath = join(destination, `${item.id}.md`);
    writeFileSync(outputPath, formatGeneratedTranslation({
      id: item.id,
      sourceHash: fingerprint,
      review: "required",
      model,
      ...translated,
    }));
    results.push({ id: item.id, status: "generated", outputPath });
  }

  return results;
}

function usage() {
  return `Usage:
  node scripts/translate-spanish.mjs content/prayer-id.md [...]
  node scripts/translate-spanish.mjs --id prayer-id
  node scripts/translate-spanish.mjs --all
  node scripts/translate-spanish.mjs --base <commit> [--head <commit>]

Options:
  --force       Regenerate even when the source fingerprint is unchanged
  --help        Show this help`;
}

function parseArguments(argv) {
  const options = { paths: [], head: "HEAD", force: false, all: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--all") options.all = true;
    else if (argument === "--id") options.id = argv[++index];
    else if (argument === "--base") options.base = argv[++index];
    else if (argument === "--head") options.head = argv[++index];
    else if (argument.startsWith("--")) throw new Error(`Unknown option ${argument}`);
    else options.paths.push(argument);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.id) {
    if (!idPattern.test(options.id)) throw new Error("--id must be a lowercase, hyphenated content id");
    options.paths.push(`content/${options.id}.md`);
  }
  if (options.all) options.paths.push(...allContentPaths());
  if (options.base) options.paths.push(...changedContentPaths(options.base, options.head));
  if (options.paths.length === 0) throw new Error(usage());

  const results = await generateSpanishTranslations(options.paths, { force: options.force });
  for (const result of results) {
    const detail = result.reason ? ` — ${result.reason}` : "";
    console.log(`${result.id}: ${result.status}${detail}`);
  }
  const generated = results.filter((result) => result.status === "generated").length;
  console.log(`Spanish generation complete: ${generated} file${generated === 1 ? "" : "s"} written for review.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
