import test from "node:test";
import assert from "node:assert/strict";
import { choosePrimaryLanguage, splitLanguageSections } from "../public/language-sections.js";

test("plain Markdown remains unchanged", () => {
  assert.deepEqual(splitLanguageSections("A prayer.\n\nAmen."), {
    text: "A prayer.\n\nAmen.",
    sections: {},
  });
});

test("EN, LA, and SP sections are extracted without rendering the authoring headers", () => {
  const parsed = splitLanguageSections(`## EN\n\nEnglish prayer.\n\n## LA\n\nOratio Latina.\n\n## SP\n\nOración española.`);
  assert.equal(parsed.text, "");
  assert.deepEqual(parsed.sections, {
    en: "English prayer.",
    la: "Oratio Latina.",
    es: "Oración española.",
  });
  assert.equal(choosePrimaryLanguage(parsed.sections, "en"), "en");
});

test("IT sections are available as Italian source text", () => {
  const parsed = splitLanguageSections("## IT\n\nPreghiera italiana.\n\n## EN\n\nEnglish prayer.");
  assert.equal(parsed.sections.it, "Preghiera italiana.");
  assert.equal(choosePrimaryLanguage(parsed.sections), "en");
});

test("declared source language wins when present", () => {
  assert.equal(choosePrimaryLanguage({ en: "English", la: "Latin" }, "la"), "la");
});

test("language sections reject ambiguous text before the first header", () => {
  assert.throws(
    () => splitLanguageSections("Preface\n\n## EN\n\nPrayer"),
    /must begin with/,
  );
});

test("language sections reject duplicates and empty sections", () => {
  assert.throws(
    () => splitLanguageSections("## EN\n\nOne\n\n## EN\n\nTwo"),
    /duplicate language section/,
  );
  assert.throws(
    () => splitLanguageSections("## EN\n\n## SP\n\nOración"),
    /cannot be empty/,
  );
});
