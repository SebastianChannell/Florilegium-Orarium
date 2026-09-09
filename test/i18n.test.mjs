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

test("translation metadata remains available while interface metadata stays in English", () => {
  assert.ok(library.length >= 99);

  for (const item of library) {
    const spanish = item.translations?.es;
    assert.ok(spanish, `${item.id}: Spanish translation record`);
    assert.ok(spanish.title, `${item.id}: Spanish title`);
    assert.ok(spanish.devotion, `${item.id}: Spanish devotion`);
    assert.ok(Array.isArray(spanish.search), `${item.id}: Spanish search terms`);
    if (item.hour) assert.ok(spanish.hour, `${item.id}: Spanish Hour name`);

    assert.equal(localizedField(item, "title", "es"), item.title, `${item.id}: title stays in source interface language`);
    assert.equal(localizedField(item, "devotion", "es"), item.devotion, `${item.id}: devotion stays in source interface language`);
  }
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
    assert.equal(localizedText(item, "es"), spanish, `${item.id}: reader selects the Spanish prayer body`);

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

test("Latin texts remain untouched when no translated body exists", () => {
  const preserved = library.filter((item) => !item.language && item.layout !== "parallel");
  assert.ok(preserved.length > 40);

  for (const item of preserved) {
    assert.equal(item.translations.es.text, undefined, `${item.id}: no replacement body`);
    assert.equal(localizedText(item, "es"), item.text, `${item.id}: original text fallback`);
  }
});

test("translated words remain searchable while browse labels stay in English", () => {
  const prepared = prepareLibrary(library);
  const visible = browseLibrary(prepared);

  assert.equal(searchLibrary(visible, "Padre nuestro", "all", [], "es")[0].id, "pater-noster");
  assert.equal(searchLibrary(visible, "Nos diste Pan del cielo", "all", [], "es")[0].id, "little-office-of-the-blessed-sacrament");
  assert.equal(searchLibrary(visible, "Para expiar", "prayer", [], "es")[0].id, "evening-prayers");

  for (const group of groupByDevotion(visible, "es")) {
    assert.equal(group.devotion, group.items[0].devotion, `${group.key}: devotion label stays in English/source metadata`);
  }
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

test("the site shell is English and language controls live only in the reader", () => {
  assert.equal(uiText("en", "prayers"), "Prayers");
  assert.equal(uiText("es", "prayers"), "Prayers");
  assert.equal(uiText("la", "hymns"), "Hymns");
  assert.match(uiText("es", "description"), /prayers and hymns/);
  assert.equal(uiText("es", "textCount", 1), "1 text");
  assert.equal(uiText("es", "textCount", 2), "2 texts");

  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const readerLanguage = readFileSync(new URL("../public/reader-language.js", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

  assert.match(html, /data-language="en"/);
  assert.match(html, /data-language="la"/);
  assert.match(html, /data-language="es"/);
  assert.ok(html.indexOf('id="language-switch"') > html.indexOf('id="reader-view"'));
  assert.doesNotMatch(html, /Se requiere JavaScript/);
  assert.match(html, /reader-language\.js/);
  assert.match(html, /reader-language\.css/);

  assert.match(app, /orarium-language/);
  assert.match(app, /item\.language \?\? "la"/);
  assert.match(readerLanguage, /availableLanguages/);
  assert.match(readerLanguage, /languageSwitch\.hidden = true/);
  assert.match(readerLanguage, /document\.documentElement\.lang = "en"/);
  assert.match(readerLanguage, /url\.searchParams\.delete\("lang"\)/);

  assert.match(serviceWorker, /\.\/i18n\.js/);
  assert.match(serviceWorker, /\.\/reader-language\.js/);
  assert.match(serviceWorker, /\.\/reader-language\.css/);
});
