import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseParallelText, splitParallelHeading } from "../public/parallel-text.js";
import { loadGeneratedTranslations, sourceFingerprint } from "./spanish-translation-data.mjs";
import {
  devotionsEs,
  parallelHeadingsEs,
  parallelTextEs,
  sourceHashesEs,
  textEs,
} from "../translations/es.mjs";

const contentDirectory = new URL("../content/", import.meta.url);
const generatedDirectory = new URL("../translations/es/", import.meta.url);
const generatedTranslations = loadGeneratedTranslations(generatedDirectory.pathname);
const gaps = [];
const seenIds = new Set();
let items = 0;
let translatedTexts = 0;
let parallelRows = 0;

const parallelKey = (value) => createHash("sha256")
  .update(String(value))
  .digest("hex")
  .slice(0, 12);

for (const filename of readdirSync(contentDirectory).filter((name) => name.endsWith(".md")).sort()) {
  const source = readFileSync(join(contentDirectory.pathname, filename), "utf8").replace(/\r\n/g, "\n");
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) continue;
  items += 1;

  const metadata = Object.fromEntries(match[1].split("\n").map((line) => {
    const separator = line.indexOf(":");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
  const splitList = (value = "") => value.split(",").map((entry) => entry.trim()).filter(Boolean);
  const item = {
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
  seenIds.add(metadata.id);

  if (!devotionsEs[metadata.devotion]) {
    gaps.push(`${metadata.id}: missing devotion translation for ${JSON.stringify(metadata.devotion)}`);
  }

  if (metadata.language && metadata.language !== "la") {
    translatedTexts += 1;
    const generated = generatedTranslations.get(metadata.id);
    if (generated) {
      if (generated.sourceHash !== sourceFingerprint(item)) {
        gaps.push(`${metadata.id}: generated Spanish body is stale`);
      }
    } else if (!Object.hasOwn(textEs, metadata.id)) {
      gaps.push(`${metadata.id}: missing complete Spanish body`);
    } else if (sourceHashesEs[metadata.id] !== sourceFingerprint(item)) {
      gaps.push(`${metadata.id}: curated Spanish body is stale`);
    }
  }

  if (metadata.layout !== "parallel") continue;
  for (const block of parseParallelText(match[2].trim())) {
    if (block.type === "heading") {
      const parts = splitParallelHeading(block.text);
      const english = parts.english ?? parts.text;
      if (!parallelHeadingsEs.has(english)) {
        gaps.push(`${metadata.id}: missing heading ${JSON.stringify(english)}`);
      }
      continue;
    }

    if (block.type === "pair") {
      parallelRows += 1;
      const key = parallelKey(block.english);
      if (!parallelTextEs.has(key)) {
        gaps.push(`${metadata.id}: add [${JSON.stringify(key)}, \`Spanish\`] for ${JSON.stringify(block.english)}`);
      }
    }
  }
}

for (const [id, generated] of generatedTranslations) {
  if (!seenIds.has(id)) gaps.push(`${generated.filename}: generated translation references unknown id`);
}

if (JSON.stringify(Object.keys(textEs).sort()) !== JSON.stringify(Object.keys(sourceHashesEs).sort())) {
  gaps.push("curated Spanish bodies and source fingerprints must have identical ids");
}

if (gaps.length > 0) {
  console.error(`Spanish translation audit found ${gaps.length} gap${gaps.length === 1 ? "" : "s"}:`);
  for (const gap of gaps) console.error(`- ${gap}`);
  process.exitCode = 1;
} else {
  const awaitingReview = [...generatedTranslations.values()].filter((translation) => translation.review === "required").length;
  console.log(`Spanish translation audit passed: ${items} texts, ${translatedTexts} non-Latin bodies, ${parallelRows} Office rows, ${generatedTranslations.size} generated overrides (${awaitingReview} awaiting review).`);
}
