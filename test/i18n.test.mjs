import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDevotionalText } from "../public/devotional-text.js";
import { localizedField, localizedText, uiText } from "../public/i18n.js";
import { splitLiturgicalText } from "../public/liturgical-text.js";
import { parseParallelText } from "../public/parallel-text.js";
import { browseLibrary, groupByDevotion, prepareLibrary, searchLibrary } from "../public/search.js";
import { parallelHeadingsEs, parallelTextEs, textEs } from "../translations/es.mjs";
import { loadGeneratedTranslations } from "../scripts/spanish-translation-data.mjs";

const library = JSON.parse(
  readFileSync(new URL("../dist/library.json", import.meta.url), "utf8"),
).items;

test("every text has complete Spanish display metadata", () => {
  assert.ok(library.length >= 99);

  for (const item of library) {
    const spanish = item.translations?.es;
    assert.ok(spanish, `${item.id}: Spanish translation record`);
    assert.ok(spanish.title, `${item.id}: Spanish title`);
    assert.ok(spanish.devotion, `${item.id}: Spanish devotion`);
    assert.ok(Array.isArray(spanish.search), `${item.id}: Spanish search terms`);
    if (item.hour) assert.ok(spanish.hour, `${item.id}: Spanish Hour name`);
  }

  assert.equal(localizedField(library.find((item) => item.id === "morning-prayer"), "title", "es"), "Oración de la mañana");
  assert.equal(localizedField(library.find((item) => item.id === "pater-noster"), "devotion", "es"), "Dios Padre");
});

test("available non-Latin Spanish bodies are structurally complete", () => {
  const translatedItems = library.filter((item) => item.language && item.language !== "la");
  const generated = loadGeneratedTranslations(new URL("../translations/es/", import.meta.url).pathname);
  const translatedIds = new Set([...Object.keys(textEs), ...generated.keys()]);
  assert.ok(translatedItems.length >= 21);
  assert.ok(translatedIds.size >= 21);

  for (const item of translatedItems) {
    if (!translatedIds.has(item.id)) continue;

    const spanish = item.translations.es.text;
    assert.ok(spanish, `${item.id}: Spanish body`);
    assert.notEqual(spanish, item.text, `${item.id}: source was actually translated`);

    if (item.layout === "devotional") {
      assert.deepEqual(
        parseDevotionalText(spanish).map((block) => block.type),
        parseDevotionalText(item.text).map((block) => block.type),
        `${item.id}: headings, rubrics, notes, and links remain aligned`,
      );
    }
  }
});

test("all Little Office Hours become Latin and Spanish without changing Latin", () => {
  const hours = library.filter((item) => item.layout === "parallel");
  let rows = 0;
  let translatedRows = 0;

  assert.equal(hours.length, 37);
  assert.equal(parallelHeadingsEs.size, 35);
  assert.equal(parallelTextEs.size, 190);

  for (const item of hours) {
    const source = parseParallelText(item.text);
    const spanishSource = item.translations.es.text;
    const spanish = parseParallelText(spanishSource);
    const sourcePairs = source.filter((block) => block.type === "pair");
    const spanishPairs = spanish.filter((block) => block.type === "pair");

    assert.match(spanishSource, /\| Latin \| Español \|/, `${item.id}: language header`);
    assert.equal(spanishPairs.length, sourcePairs.length, `${item.id}: paired row count`);
    assert.deepEqual(
      spanishPairs.map((pair) => pair.latin),
      sourcePairs.map((pair) => pair.latin),
      `${item.id}: Latin is byte-for-byte unchanged after parsing`,
    );
    assert.equal(
      spanishPairs.every((pair) => pair.english.trim()),
      true,
      `${item.id}: every Spanish cell is populated`,
    );

    rows += spanishPairs.length;
    translatedRows += spanishPairs.filter((pair, index) => pair.english !== sourcePairs[index].english).length;
  }

  assert.equal(rows, 478);
  assert.ok(translatedRows > 450, "the English Office column should be translated throughout");
});

test("Latin texts remain untouched", () => {
  const preserved = library.filter((item) => !item.language && item.layout !== "parallel");
  assert.ok(preserved.length > 40);

  for (const item of preserved) {
    assert.equal(item.translations.es.text, undefined, `${item.id}: no replacement body`);
    assert.equal(localizedText(item, "es"), item.text, `${item.id}: original text fallback`);
  }
});

test("Spanish titles, devotions, aliases, and full text are searchable", () => {
  const prepared = prepareLibrary(library);
  const visible = browseLibrary(prepared);

  assert.equal(searchLibrary(visible, "Padre nuestro", "all", [], "es")[0].id, "pater-noster");
  assert.equal(searchLibrary(visible, "Nos diste Pan del cielo", "all", [], "es")[0].id, "little-office-of-the-blessed-sacrament");
  assert.equal(searchLibrary(visible, "Para expiar", "prayer", [], "es")[0].id, "evening-prayers");
  assert.ok(
    groupByDevotion(visible, "es").some((group) => group.devotion === "Santísima Virgen María"),
  );
});

test("Spanish versicles and responses retain the purple marker role", () => {
  let markers = 0;

  for (const item of library) {
    const translated = item.translations.es.text;
    if (!translated) continue;
    const segments = item.layout === "parallel"
      ? parseParallelText(translated).flatMap((block) => block.type === "pair" ? [block.latin, block.english] : [])
      : [translated];

    for (const segment of segments) {
      const expected = segment
        .split(/\r?\n/)
        .map((line) => line.match(/^[\t ]*([VR]\.)(?=[\t ]|$)/)?.[1])
        .filter(Boolean);
      const actual = splitLiturgicalText(segment)
        .filter((part) => part.marker)
        .map((part) => part.text);
      assert.deepEqual(actual, expected, `${item.id}: every Spanish V. and R. is detected`);
      markers += actual.length;
    }
  }

  assert.ok(markers > 580);
});

test("the interface supplies complete English and Spanish controls", () => {
  assert.equal(uiText("es", "prayers"), "Oraciones");
  assert.equal(uiText("es", "hymns"), "Himnos");
  assert.match(uiText("es", "description"), /oraciones e himnos/);
  assert.equal(uiText("es", "textCount", 1), "1 texto");
  assert.equal(uiText("es", "textCount", 2), "2 textos");

  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const sections = readFileSync(new URL("../public/sections.js", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(html, /data-language="en"/);
  assert.match(html, /data-language="es"/);
  assert.match(html, /Se requiere JavaScript/);
  assert.match(app, /orarium-language/);
  assert.match(app, /item\.language \?\? "la"/);
  assert.match(app, /url\.searchParams\.set\("lang", state\.language\)/);
  assert.doesNotMatch(html, /result-count/);
  assert.doesNotMatch(app, /resultCount/);
  assert.doesNotMatch(sections, /resultCount/);
  assert.match(serviceWorker, /\.\/i18n\.js/);
});
