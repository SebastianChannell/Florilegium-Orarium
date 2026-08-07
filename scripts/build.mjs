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
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/);

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

  const requiredFields = ["id", "title", "type", "language"];
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

  const text = match[2].trim();
  if (!text) {
    throw new Error(`${filename}: prayer or hymn text cannot be empty`);
  }

  return {
    id: metadata.id,
    title: metadata.title,
    type: metadata.type,
    language: metadata.language,
    aliases: splitList(metadata.aliases),
    keywords: splitList(metadata.keywords),
    incipit: text.split("\n").find((line) => line.trim())?.trim() ?? "",
    text,
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
