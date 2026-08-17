import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDevotionalText } from "../public/devotional-text.js";
import { parseParallelText, splitParallelHeading } from "../public/parallel-text.js";
import { loadGeneratedTranslations, sourceFingerprint } from "./spanish-translation-data.mjs";
import {
  devotionsEs,
  hoursEs,
  parallelHeadingsEs,
  parallelTextEs,
  searchEs,
  sourceHashesEs,
  textEs,
  titlesEs,
} from "../translations/es.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentDirectory = join(root, "content");
const generatedTranslationsDirectory = join(root, "translations", "es");
const publicDirectory = join(root, "public");
const outputDirectory = join(root, "dist");
const allowPendingSpanish = process.argv.includes("--allow-pending-spanish");
const pendingSpanish = new Map();

const splitList = (value = "") =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

function parseTextFile(filename) {
  const source = readFileSync(join(contentDirectory, filename), "utf8").replace(/\r\n/g, "\n");
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    throw new Error(`${filename}: expected YAML-style metadata between --- lines`);
  }

  const metadata = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      throw new Error(`${filename}: invalid metadata line “${line}”`);
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    metadata[key] = value;
  }

  const requiredFields = ["id", "title", "type", "devotion"];
  for (const field of requiredFields) {
    if (!metadata[field]) {
      throw new Error(`${filename}: missing required field “${field}”`);
    }
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.id)) {
    throw new Error(`${filename}: id must contain only lowercase letters, numbers, and hyphens`);
  }

  if (`${metadata.id}.md` !== filename) {
    throw new Error(`${filename}: filename must match id “${metadata.id}.md”`);
  }

  if (!new Set(["prayer", "hymn"]).has(metadata.type)) {
    throw new Error(`${filename}: type must be “prayer” or “hymn”`);
  }

  if (metadata.layout && !new Set(["devotional", "parallel"]).has(metadata.layout)) {
    throw new Error(`${filename}: layout must be “devotional” or “parallel” when provided`);
  }

  if (metadata.language && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(metadata.language)) {
    throw new Error(`${filename}: language must be a BCP 47 language tag such as “en” or “ga”`);
  }

  const children = splitList(metadata.children);
  const text = match[2].trim();
  if (!text && children.length === 0) {
    throw new Error(`${filename}: prayer or hymn text cannot be empty`);
  }

  if (metadata.parent && children.length > 0) {
    throw new Error(`${filename}: an Hour cannot also be an office index`);
  }

  if (Boolean(metadata.parent) !== Boolean(metadata.hour)) {
    throw new Error(`${filename}: parent and hour must be provided together`);
  }

  if (metadata.layout === "parallel") {
    const blocks = parseParallelText(text);
    const pairs = blocks.filter((block) => block.type === "pair");
    if (pairs.length === 0) {
      throw new Error(`${filename}: parallel layout requires a Latin and English table`);
    }
    if (blocks.some((block) => block.type === "note")) {
      throw new Error(`${filename}: text outside a parallel table must be a heading`);
    }
    if (pairs.some((pair) => !pair.latin || !pair.english)) {
      throw new Error(`${filename}: every parallel row requires both Latin and English`);
    }
  }

  if (metadata.layout === "devotional") {
    const blocks = parseDevotionalText(text);
    if (blocks.length === 0 || blocks.every((block) => block.type !== "paragraph")) {
      throw new Error(`${filename}: devotional layout requires prayer text`);
    }
  }

  return {
    id: metadata.id,
    title: metadata.title,
    type: metadata.type,
    devotion: metadata.devotion,
    search: splitList(metadata.search),
    text,
    ...(metadata.language ? { language: metadata.language } : {}),
    ...(metadata.layout ? { layout: metadata.layout } : {}),
    ...(metadata.parent ? { parent: metadata.parent, hour: metadata.hour } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

function tableCell(value = "") {
  return String(value)
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br>");
}

function parallelKey(value = "") {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function translateParallelText(item) {
  const sourceBlocks = parseParallelText(item.text);
  const translated = [];

  for (const block of sourceBlocks) {
    if (block.type === "heading") {
      const parts = splitParallelHeading(block.text);
      const sourceHeading = parts.english ?? parts.text;
      const spanish = parallelHeadingsEs.get(sourceHeading);
      if (!spanish) throw new Error(`${item.id}: missing Spanish heading “${sourceHeading}”`);
      const latin = parts.latin ?? block.text;
      translated.push(`${"#".repeat(block.level)} ${latin} — ${spanish}`);
      continue;
    }

    if (block.type !== "pair") {
      throw new Error(`${item.id}: every parallel block must be paired`);
    }

    const spanish = parallelTextEs.get(parallelKey(block.english));
    if (!spanish) {
      const preview = block.english.split("\n", 1)[0].slice(0, 80);
      throw new Error(`${item.id}: missing Spanish parallel text “${preview}”`);
    }

    if (block.kind === "subheading") {
      translated.push(
        `| *${tableCell(block.latin)}* | *${tableCell(spanish)}* |\n|---|---|`,
      );
      continue;
    }

    const latin = block.kind === "rubric" ? `*${tableCell(block.latin)}*` : tableCell(block.latin);
    const translation = block.kind === "rubric" ? `*${tableCell(spanish)}*` : tableCell(spanish);
    translated.push(`| Latin | Español |\n|---|---|\n| ${latin} | ${translation} |`);
  }

  const text = translated.join("\n\n");
  const translatedBlocks = parseParallelText(text);
  const sourcePairs = sourceBlocks.filter((block) => block.type === "pair");
  const translatedPairs = translatedBlocks.filter((block) => block.type === "pair");
  if (translatedPairs.length !== sourcePairs.length) {
    throw new Error(`${item.id}: Spanish parallel row count must match the source`);
  }
  for (let index = 0; index < sourcePairs.length; index += 1) {
    if (translatedPairs[index].latin !== sourcePairs[index].latin) {
      throw new Error(`${item.id}: Spanish mode must not alter Latin row ${index + 1}`);
    }
  }
  return text;
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
cpSync(publicDirectory, outputDirectory, { recursive: true });

const filenames = readdirSync(contentDirectory)
  .filter((filename) => filename.endsWith(".md"))
  .sort((left, right) => left.localeCompare(right));

if (filenames.length === 0) {
  throw new Error("Add at least one Markdown file to content/");
}

const items = filenames.map(parseTextFile);
const ids = new Set();
for (const item of items) {
  if (ids.has(item.id)) {
    throw new Error(`Duplicate id “${item.id}”`);
  }
  ids.add(item.id);
}

const itemsById = new Map(items.map((item) => [item.id, item]));
const generatedTranslations = loadGeneratedTranslations(generatedTranslationsDirectory);
for (const item of items) {
  if (item.layout === "devotional") {
    for (const block of parseDevotionalText(item.text)) {
      if (block.type === "link" && !itemsById.has(block.item)) {
        throw new Error(`${item.id}: unknown linked text id “${block.item}”`);
      }
    }
  }

  if (item.children) {
    if (new Set(item.children).size !== item.children.length) {
      throw new Error(`${item.id}: children must not contain duplicate ids`);
    }

    for (const childId of item.children) {
      const child = itemsById.get(childId);
      if (!child) throw new Error(`${item.id}: unknown child id “${childId}”`);
      if (child.parent !== item.id) {
        throw new Error(`${childId}: parent must be “${item.id}”`);
      }
      if (child.type !== item.type || child.devotion !== item.devotion) {
        throw new Error(`${childId}: type and devotion must match its office index`);
      }
    }
  }

  if (item.parent) {
    const parent = itemsById.get(item.parent);
    if (!parent) throw new Error(`${item.id}: unknown parent id “${item.parent}”`);
    if (!parent.children?.includes(item.id)) {
      throw new Error(`${item.id}: parent index must include this Hour in children`);
    }
  }
}

for (const collection of [titlesEs, searchEs, textEs, sourceHashesEs]) {
  for (const id of Object.keys(collection)) {
    if (!itemsById.has(id)) throw new Error(`Spanish translation references unknown id “${id}”`);
  }
}

for (const [id, generated] of generatedTranslations) {
  const item = itemsById.get(id);
  if (!item) throw new Error(`${generated.filename}: generated translation references unknown id “${id}”`);
  if (!item.language || item.language === "la" || item.layout === "parallel") {
    throw new Error(`${generated.filename}: generated body translations are only for non-Latin reading texts`);
  }
  const fingerprint = sourceFingerprint(item);
  if (generated.sourceHash !== fingerprint) {
    if (!allowPendingSpanish) {
      throw new Error(`${generated.filename}: Spanish translation is stale; regenerate it from the current source`);
    }
    generatedTranslations.delete(id);
    pendingSpanish.set(id, "generated Spanish is stale");
  }
}

const curatedIds = Object.keys(textEs).sort();
const fingerprintIds = Object.keys(sourceHashesEs).sort();
if (JSON.stringify(curatedIds) !== JSON.stringify(fingerprintIds)) {
  throw new Error("Every curated Spanish body must have exactly one source fingerprint");
}

for (const item of items) {
  const generated = generatedTranslations.get(item.id);
  const devotion = devotionsEs[item.devotion];
  if (!devotion) throw new Error(`${item.id}: missing Spanish devotion “${item.devotion}”`);

  const parentTitle = item.parent
    ? titlesEs[item.parent] ?? itemsById.get(item.parent)?.title
    : null;
  const hour = item.hour ? hoursEs[item.hour] : null;
  if (item.hour && !hour) throw new Error(`${item.id}: missing Spanish Hour “${item.hour}”`);

  const title = item.parent
    ? `${parentTitle} — ${hour}`
    : generated?.title ?? titlesEs[item.id] ?? item.title;
  const translation = {
    title,
    devotion,
    search: [...item.search, ...(generated?.search ?? searchEs[item.id] ?? [])],
    ...(hour ? { hour } : {}),
  };

  if (item.layout === "parallel") {
    translation.text = translateParallelText(item);
  } else if (item.language && item.language !== "la") {
    const curatedText = textEs[item.id];
    const curatedIsCurrent = curatedText && sourceHashesEs[item.id] === sourceFingerprint(item);
    const translatedText = generated?.text ?? (curatedIsCurrent ? curatedText : undefined);
    if (!translatedText) {
      const reason = curatedText ? "curated Spanish is stale" : "Spanish has not been generated yet";
      if (!allowPendingSpanish) {
        if (curatedText) {
          throw new Error(`${item.id}: curated Spanish translation is stale; regenerate it from the current source`);
        }
        throw new Error(`${item.id}: non-Latin source text requires a complete Spanish translation`);
      }
      pendingSpanish.set(item.id, reason);
    } else {
      translation.text = translatedText.trim();
      if (!translation.text) throw new Error(`${item.id}: Spanish translation cannot be empty`);

      if (item.layout === "devotional") {
        const blocks = parseDevotionalText(translation.text);
        if (blocks.length === 0 || blocks.every((block) => block.type !== "paragraph")) {
          throw new Error(`${item.id}: Spanish devotional translation requires prayer text`);
        }
        const sourceTypes = parseDevotionalText(item.text).map((block) => block.type);
        const translatedTypes = blocks.map((block) => block.type);
        if (JSON.stringify(translatedTypes) !== JSON.stringify(sourceTypes)) {
          throw new Error(`${item.id}: Spanish devotional structure must match the source`);
        }
        for (const block of blocks) {
          if (block.type === "link" && !itemsById.has(block.item)) {
            throw new Error(`${item.id}: unknown Spanish linked text id “${block.item}”`);
          }
        }
      }
    }
  }

  item.translations = { es: translation };
}

for (const id of Object.keys(textEs)) {
  const sourceLanguage = itemsById.get(id)?.language;
  if (!sourceLanguage || sourceLanguage === "la") {
    throw new Error(`${id}: Spanish body translations require a non-Latin source language`);
  }
}

const usedParallelHeadings = new Set();
const usedParallelText = new Set();
for (const item of items.filter((candidate) => candidate.layout === "parallel")) {
  for (const block of parseParallelText(item.text)) {
    if (block.type === "heading") {
      const parts = splitParallelHeading(block.text);
      usedParallelHeadings.add(parts.english ?? parts.text);
    } else if (block.type === "pair") {
      usedParallelText.add(parallelKey(block.english));
    }
  }
}
for (const source of parallelHeadingsEs.keys()) {
  if (!usedParallelHeadings.has(source)) throw new Error(`Unused Spanish heading translation “${source}”`);
}
for (const key of parallelTextEs.keys()) {
  if (!usedParallelText.has(key)) {
    throw new Error(`Unused Spanish parallel translation key “${key}”`);
  }
}

items.sort((left, right) => left.title.localeCompare(right.title, "en", { sensitivity: "base" }));

const library = `${JSON.stringify({ items }, null, 2)}\n`;
writeFileSync(join(outputDirectory, "library.json"), library);

const hash = createHash("sha256");
for (const filename of readdirSync(outputDirectory).sort()) {
  if (filename !== "sw.js") {
    hash.update(readFileSync(join(outputDirectory, filename)));
  }
}

const serviceWorkerPath = join(outputDirectory, "sw.js");
const serviceWorker = readFileSync(serviceWorkerPath, "utf8").replace(
  "__BUILD_HASH__",
  hash.digest("hex").slice(0, 12),
);
writeFileSync(serviceWorkerPath, serviceWorker);

for (const [id, reason] of pendingSpanish) {
  console.warn(`Pending Spanish for ${id}: ${reason}; using the original text until automation finishes.`);
}
console.log(`Built ${items.length} texts in dist/`);
