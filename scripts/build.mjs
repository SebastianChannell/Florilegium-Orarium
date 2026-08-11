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
import { parseParallelText } from "../public/parallel-text.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentDirectory = join(root, "content");
const publicDirectory = join(root, "public");
const outputDirectory = join(root, "dist");

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
    ...(metadata.layout ? { layout: metadata.layout } : {}),
    ...(metadata.parent ? { parent: metadata.parent, hour: metadata.hour } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
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

console.log(`Built ${items.length} texts in dist/`);
