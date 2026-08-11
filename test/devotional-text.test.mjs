import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDevotionalText } from "../public/devotional-text.js";

test("devotional pages preserve sections, rubrics, notes, and internal links", () => {
  const blocks = parseDevotionalText(`Eternal Father, I offer Thee all my works.

### To expiate

all the sins of this day.

*Glory be to the Father, etc.*

> A note retained from the prayer book.

[Recite the Act of Contrition.](?text=act-of-contrition)

## A Good Night Blessing`);

  assert.deepEqual(blocks.map((block) => block.type), [
    "paragraph",
    "heading",
    "paragraph",
    "rubric",
    "note",
    "link",
    "heading",
  ]);
  assert.deepEqual(blocks[5], {
    type: "link",
    text: "Recite the Act of Contrition.",
    item: "act-of-contrition",
  });
});

test("the photographed Evening Prayers are retained as one structured entry", () => {
  const source = readFileSync(new URL("../content/evening-prayers.md", import.meta.url), "utf8");
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const blocks = parseDevotionalText(body);

  assert.match(source, /^layout: devotional$/m);
  assert.match(body, /Sacred Heart of Jesus, with all Its Love/);
  assert.match(body, /the good I have done in my poor way/);
  assert.match(body, /Precious Blood of Jesus/);
  assert.match(body, /Grace of a happy death/);
  assert.equal(blocks.filter((block) => block.type === "heading").length, 4);
  assert.equal(blocks.filter((block) => block.type === "note").length, 3);
  assert.deepEqual(
    blocks.filter((block) => block.type === "link").map((block) => block.item),
    ["act-of-contrition"],
  );
});

test("structured prayer notes stay quiet and unboxed", () => {
  const stylesheet = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(stylesheet, /\.devotional-note\s*\{[^}]*color:\s*var\(--muted\);/s);
  const markerRule = stylesheet.match(/\.devotional-note::before\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(markerRule, /content:\s*"¶";/);
  assert.match(markerRule, /color:\s*var\(--rubric\);/);
  assert.doesNotMatch(stylesheet, /\.devotional-note\s*\{[^}]*(?:border|background):/s);
});
