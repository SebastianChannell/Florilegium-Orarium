import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseParallelText, splitParallelHeading } from "../public/parallel-text.js";
import {
  devotionsEs,
  parallelHeadingsEs,
  parallelTextEs,
  textEs,
} from "../translations/es.mjs";

const contentDirectory = new URL("../content/", import.meta.url);
const gaps = [];
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

  if (!devotionsEs[metadata.devotion]) {
    gaps.push(`${metadata.id}: missing devotion translation for ${JSON.stringify(metadata.devotion)}`);
  }

  if (metadata.language && metadata.language !== "la") {
    translatedTexts += 1;
    if (!Object.hasOwn(textEs, metadata.id)) gaps.push(`${metadata.id}: missing complete Spanish body`);
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

if (gaps.length > 0) {
  console.error(`Spanish translation audit found ${gaps.length} gap${gaps.length === 1 ? "" : "s"}:`);
  for (const gap of gaps) console.error(`- ${gap}`);
  process.exitCode = 1;
} else {
  console.log(`Spanish translation audit passed: ${items} texts, ${translatedTexts} non-Latin bodies, ${parallelRows} Office rows.`);
}
