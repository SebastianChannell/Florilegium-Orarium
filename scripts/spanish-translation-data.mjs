import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sourceHashPattern = /^[a-f0-9]{64}$/;

function parseMetadata(source, filename) {
  const match = String(source).replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: expected translation metadata between --- lines`);

  const metadata = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) throw new Error(`${filename}: invalid metadata line “${line}”`);
    metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }

  return { metadata, text: match[2].trim() };
}

function parseJsonField(metadata, key, filename) {
  try {
    return JSON.parse(metadata[key]);
  } catch {
    throw new Error(`${filename}: ${key} must contain valid JSON`);
  }
}

function cleanSearchTerms(terms, filename = "translation") {
  if (!Array.isArray(terms) || terms.some((term) => typeof term !== "string")) {
    throw new Error(`${filename}: search_json must be an array of strings`);
  }

  const cleaned = terms.map((term) => term.trim()).filter(Boolean);
  if (cleaned.some((term) => term.includes("\n"))) {
    throw new Error(`${filename}: search terms must stay on one line`);
  }
  return [...new Set(cleaned)];
}

export function sourceFingerprint(item) {
  const source = {
    id: item.id,
    title: item.title,
    type: item.type,
    devotion: item.devotion,
    search: item.search ?? [],
    text: item.text ?? "",
    language: item.language ?? null,
    layout: item.layout ?? null,
    parent: item.parent ?? null,
    hour: item.hour ?? null,
    children: item.children ?? [],
  };

  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

export function parseGeneratedTranslation(source, filename) {
  const { metadata, text } = parseMetadata(source, filename);
  const id = metadata.id;
  if (!idPattern.test(id ?? "")) throw new Error(`${filename}: invalid or missing id`);
  if (`${id}.md` !== filename) throw new Error(`${filename}: filename must match id “${id}.md”`);
  if (!sourceHashPattern.test(metadata.source_hash ?? "")) {
    throw new Error(`${filename}: source_hash must be a complete SHA-256 fingerprint`);
  }
  if (!new Set(["required", "approved"]).has(metadata.review)) {
    throw new Error(`${filename}: review must be “required” or “approved”`);
  }
  if (!text) throw new Error(`${filename}: Spanish text cannot be empty`);

  const title = parseJsonField(metadata, "title_json", filename);
  if (typeof title !== "string" || !title.trim() || title.includes("\n")) {
    throw new Error(`${filename}: title_json must be one non-empty string`);
  }

  const model = parseJsonField(metadata, "model_json", filename);
  if (typeof model !== "string" || !model.trim() || model.includes("\n")) {
    throw new Error(`${filename}: model_json must be one non-empty string`);
  }

  return {
    id,
    sourceHash: metadata.source_hash,
    review: metadata.review,
    model: model.trim(),
    title: title.trim(),
    search: cleanSearchTerms(parseJsonField(metadata, "search_json", filename), filename),
    text,
    filename,
  };
}

export function loadGeneratedTranslations(directory) {
  const translations = new Map();
  if (!existsSync(directory)) return translations;

  for (const filename of readdirSync(directory).filter((name) => name.endsWith(".md")).sort()) {
    const translation = parseGeneratedTranslation(
      readFileSync(join(directory, filename), "utf8"),
      filename,
    );
    if (translations.has(translation.id)) {
      throw new Error(`${filename}: duplicate generated Spanish translation id “${translation.id}”`);
    }
    translations.set(translation.id, translation);
  }
  return translations;
}

export function formatGeneratedTranslation({ id, sourceHash, review = "required", model, title, search, text }) {
  if (!idPattern.test(id ?? "")) throw new Error("Generated translation requires a valid id");
  if (!sourceHashPattern.test(sourceHash ?? "")) throw new Error(`${id}: invalid source fingerprint`);
  if (!new Set(["required", "approved"]).has(review)) throw new Error(`${id}: invalid review state`);
  if (typeof title !== "string" || !title.trim() || title.includes("\n")) {
    throw new Error(`${id}: generated Spanish title must stay on one line`);
  }
  if (typeof model !== "string" || !model.trim() || model.includes("\n")) {
    throw new Error(`${id}: translation model must stay on one line`);
  }
  if (typeof text !== "string" || !text.trim()) throw new Error(`${id}: generated Spanish text is empty`);

  const terms = cleanSearchTerms(search, id);
  return `---\nid: ${id}\nsource_hash: ${sourceHash}\nreview: ${review}\nmodel_json: ${JSON.stringify(model.trim())}\ntitle_json: ${JSON.stringify(title.trim())}\nsearch_json: ${JSON.stringify(terms)}\n---\n${text.trim()}\n`;
}
