import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { splitLiturgicalText } from "../public/liturgical-text.js";
import { parseParallelText } from "../public/parallel-text.js";

const contentDirectory = new URL("../content/", import.meta.url);
const stylesheet = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

test("versicle and response markers at the start of lines are identified", () => {
  const text = "V. O God, come to my assistance.\n  R. O Lord, make haste to help me.";
  const parts = splitLiturgicalText(text);

  assert.deepEqual(
    parts.filter((part) => part.marker).map((part) => part.text),
    ["V.", "R."],
  );
  assert.equal(parts.map((part) => part.text).join(""), text);
});

test("letters in ordinary prose are not treated as liturgical markers", () => {
  const text = "See Vol. V. for the response, then continue.";

  assert.equal(splitLiturgicalText(text).some((part) => part.marker), false);
});

test("every versicle and response marker in the content collection is identified", () => {
  let markerCount = 0;

  for (const filename of readdirSync(contentDirectory).filter((name) => name.endsWith(".md"))) {
    const source = readFileSync(new URL(filename, contentDirectory), "utf8");
    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    const isParallel = /^layout:\s*parallel$/m.test(source);
    const segments = isParallel
      ? parseParallelText(body).flatMap((block) => {
          if (block.type === "pair") return [block.latin, block.english];
          if (block.type === "note") return [block.text];
          return [];
        })
      : [body];
    let fileMarkerCount = 0;

    for (const segment of segments) {
      const expected = segment
        .split(/\r?\n/)
        .map((line) => line.match(/^[\t ]*([VR]\.)(?=[\t ]|$)/)?.[1])
        .filter(Boolean);
      const actual = splitLiturgicalText(segment)
        .filter((part) => part.marker)
        .map((part) => part.text);

      assert.deepEqual(actual, expected, `${filename}: every V. and R. must be highlighted`);
      markerCount += actual.length;
      fileMarkerCount += actual.length;
    }

    if (isParallel) {
      const sourceMarkerCount = [...body.matchAll(
        /(?:^|\n|<br\s*\/?\s*>|\|\s)(?:\*\*)?([VR]\.)(?:\*\*)?(?=[\t ])/g,
      )].length;
      assert.equal(
        fileMarkerCount,
        sourceMarkerCount,
        `${filename}: no table marker may be lost during parallel rendering`,
      );
    }
  }

  assert.ok(markerCount > 0, "the collection should include liturgical markers");
});

test("liturgical markers use the established purple accent", () => {
  assert.match(stylesheet, /--accent:\s*#8451CF;/);
  assert.match(stylesheet, /\.liturgical-marker\s*\{[^}]*color:\s*var\(--accent\);[^}]*\}/s);
});
