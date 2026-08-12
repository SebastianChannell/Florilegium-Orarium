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
  assert.doesNotMatch(body, /\*Glory be to the Father, etc\.\*/);
  assert.equal(blocks.filter((block) => block.type === "heading").length, 4);
  assert.equal(blocks.filter((block) => block.type === "note").length, 3);
  assert.deepEqual(
    blocks.filter((block) => block.type === "link").map((block) => block.item),
    ["act-of-contrition", "prayer-for-a-happy-death"],
  );
});

test("the photographed Morning Prayer is retained as one structured entry", () => {
  const source = readFileSync(new URL("../content/morning-prayer.md", import.meta.url), "utf8");
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const blocks = parseDevotionalText(body);

  assert.match(source, /^devotion: Sacred Heart of Jesus$/m);
  assert.match(source, /^layout: devotional$/m);
  assert.match(body, /through the Immaculate Heart of Mary/);
  assert.match(body, /I renew my baptismal vows/);
  assert.match(body, /I take Jesus Christ for my Model and my Guide/);
  assert.deepEqual(blocks.map((block) => block.type), [
    "rubric",
    "paragraph",
    "paragraph",
    "rubric",
  ]);
  assert.deepEqual(
    blocks.filter((block) => block.type === "rubric").map((block) => block.text),
    ["Bless yourself on rising.", "Our Father, Hail Mary, Glory, etc."],
  );
});

test("the linked Prayer for a Happy Death retains the three invocations", () => {
  const source = readFileSync(
    new URL("../content/prayer-for-a-happy-death.md", import.meta.url),
    "utf8",
  );

  assert.match(source, /^devotion: Holy Family$/m);
  assert.match(source, /Jesus, Mary, Joseph, I give you my heart and my soul\./);
  assert.match(source, /Jesus, Mary, Joseph, assist me in my last agony\./);
  assert.match(source, /may I breathe forth my soul in peace with You\. Amen\./);
});

test("structured prayer notes stay quiet and unboxed", () => {
  const stylesheet = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(stylesheet, /\.devotional-note\s*\{[^}]*color:\s*var\(--muted\);/s);
  const markerRule = stylesheet.match(/\.devotional-note::before\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(markerRule, /content:\s*"¶";/);
  assert.match(markerRule, /color:\s*var\(--rubric\);/);
  assert.doesNotMatch(stylesheet, /\.devotional-note\s*\{[^}]*(?:border|background):/s);
});

test("spoken intention headings are white while directions remain rubric red", () => {
  const stylesheet = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(stylesheet, /\.devotional-heading-3\s*\{[^}]*color:\s*var\(--text\);/s);
  assert.match(stylesheet, /\.devotional-rubric\s*\{[^}]*color:\s*var\(--rubric\);/s);
});
