import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { parseParallelText } from "../public/parallel-text.js";

test("parallel tables become aligned Latin and English blocks", () => {
  const blocks = parseParallelText(`## Hymnus — Hymn

| Latin | English |
|---|---|
| **V.** Deus in adjutorium.<br>**R.** Domine, festina. | **V.** O God, come to my assistance.<br>**R.** O Lord, make haste to help me. |`);

  assert.deepEqual(blocks, [
    { type: "heading", level: 2, text: "Hymnus — Hymn" },
    {
      type: "pair",
      kind: "text",
      latin: "V. Deus in adjutorium.\nR. Domine, festina.",
      english: "V. O God, come to my assistance.\nR. O Lord, make haste to help me.",
    },
  ]);
});

test("named table headings remain visible as paired subheadings", () => {
  const blocks = parseParallelText(`| *Absolutio* | *Absolution* |
|---|---|
| Amen. | Amen. |`);

  assert.equal(blocks[0].kind, "subheading");
  assert.equal(blocks[0].latin, "Absolutio");
  assert.equal(blocks[0].english, "Absolution");
});

test("the responsive reader keeps both languages side by side", () => {
  const stylesheet = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(
    stylesheet,
    /\.parallel-language-row,\s*\n\.parallel-pair\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
  );
  assert.doesNotMatch(stylesheet, /\.parallel-pair\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("every bilingual content file has complete paired rows", () => {
  const contentDirectory = new URL("../content/", import.meta.url);
  let bilingualFiles = 0;

  for (const filename of readdirSync(contentDirectory).filter((name) => name.endsWith(".md"))) {
    const source = readFileSync(new URL(filename, contentDirectory), "utf8");
    if (!/^layout:\s*parallel$/m.test(source)) continue;
    bilingualFiles += 1;

    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    const blocks = parseParallelText(body);
    const pairs = blocks.filter((block) => block.type === "pair");

    assert.ok(pairs.length > 0, `${filename}: expected bilingual rows`);
    assert.equal(blocks.some((block) => block.type === "note"), false, `${filename}: unpaired text`);
    assert.equal(
      pairs.every((pair) => pair.latin && pair.english),
      true,
      `${filename}: both columns must be complete`,
    );
  }

  assert.ok(bilingualFiles >= 37, "the five Little Offices should all use the bilingual layout");
});
