import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSearchText, prepareLibrary, searchLibrary } from "../public/search.js";

const items = prepareLibrary([
  {
    id: "ave-maria",
    title: "Ave Maria",
    type: "prayer",
    language: "Latin",
    aliases: ["Hail Mary"],
    keywords: ["rosary"],
    incipit: "Ave María, grátia plena",
    text: "Ave María, grátia plena, Dóminus tecum.",
  },
  {
    id: "salve-regina",
    title: "Salve Regina",
    type: "hymn",
    language: "Latin",
    aliases: ["Hail Holy Queen"],
    keywords: ["compline"],
    incipit: "Salve, Regína",
    text: "Ad te clamámus, éxsules fílii Evæ.",
  },
]);

test("normalization ignores accents and traditional ligatures", () => {
  assert.equal(normalizeSearchText("cælis, María"), "caelis maria");
});

test("search finds titles without requiring accent marks", () => {
  assert.deepEqual(searchLibrary(items, "Maria").map((item) => item.id), ["ave-maria"]);
});

test("search finds aliases and full text", () => {
  assert.deepEqual(searchLibrary(items, "holy queen").map((item) => item.id), ["salve-regina"]);
  assert.deepEqual(searchLibrary(items, "exsules filii").map((item) => item.id), ["salve-regina"]);
});

test("type filters remain active during search", () => {
  assert.equal(searchLibrary(items, "hail", "prayer")[0].id, "ave-maria");
  assert.equal(searchLibrary(items, "hail", "hymn")[0].id, "salve-regina");
});
