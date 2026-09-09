import assert from "node:assert/strict";
import test from "node:test";
import { draftToMarkdown, slugify, validateDraft } from "../src/ingest-common.js";

test("slugify creates Orarium ids", () => {
  assert.equal(slugify("Prayer to St. Joseph — After Mass"), "prayer-to-st-joseph-after-mass");
});

test("draftToMarkdown writes language headings without a language property", () => {
  const result = draftToMarkdown({
    id: "test-prayer",
    title: "Test Prayer",
    type: "prayer",
    devotion: "Holy Eucharist",
    search: ["test"],
    languages: [
      { code: "LA", text: "Orémus.", provenance: "source" },
      { code: "EN", text: "Let us pray.", provenance: "generated" },
      { code: "SP", text: "Oremos.", provenance: "generated" },
    ],
  });

  assert.equal(result.ok, true);
  assert.match(result.markdown, /## LA\n\nOrémus\./);
  assert.match(result.markdown, /## EN\n\nLet us pray\./);
  assert.match(result.markdown, /## SP\n\nOremos\./);
  assert.doesNotMatch(result.markdown, /^language:/m);
  assert.match(result.markdown, /^generated-languages: EN, SP$/m);
});

test("Spanish cannot be published without English", () => {
  const result = validateDraft({
    id: "solo-espanol",
    title: "Solo Español",
    type: "prayer",
    devotion: "Sacred Heart of Jesus",
    languages: [{ code: "SP", text: "Jesús, en Ti confío.", provenance: "source" }],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Spanish text requires an English section/);
});
