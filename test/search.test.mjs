import assert from "node:assert/strict";
import { test } from "node:test";
import {
  browseLibrary,
  groupByDevotion,
  normalizeSearchText,
  prepareLibrary,
  searchLibrary,
} from "../public/search.js";

const items = prepareLibrary([
  {
    id: "ave-maria",
    title: "Ave Maria",
    type: "prayer",
    devotion: "Blessed Virgin Mary",
    search: ["Hail Mary", "rosary"],
    text: "Ave María, grátia plena, Dóminus tecum.",
  },
  {
    id: "salve-regina",
    title: "Salve Regina",
    type: "hymn",
    devotion: "Blessed Virgin Mary",
    search: ["Hail Holy Queen", "compline"],
    text: "Ad te clamámus, éxsules fílii Evæ.",
  },
  {
    id: "veni-creator-spiritus",
    title: "Veni Creator Spiritus",
    type: "hymn",
    devotion: "Holy Ghost",
    search: ["Come Creator Spirit", "Pentecost"],
    text: "Veni, Creátor Spíritus, mentes tuórum vísita.",
  },
]);

test("normalization ignores accents and traditional ligatures", () => {
  assert.equal(normalizeSearchText("cælis, María"), "caelis maria");
});

test("search finds titles without requiring accent marks", () => {
  assert.deepEqual(searchLibrary(items, "Maria").map((item) => item.id), ["ave-maria"]);
});

test("search finds the consolidated search field and full text", () => {
  assert.deepEqual(searchLibrary(items, "holy queen").map((item) => item.id), ["salve-regina"]);
  assert.deepEqual(searchLibrary(items, "exsules filii").map((item) => item.id), ["salve-regina"]);
});

test("type filters remain active during search", () => {
  assert.equal(searchLibrary(items, "hail", "prayer")[0].id, "ave-maria");
  assert.equal(searchLibrary(items, "hail", "hymn")[0].id, "salve-regina");
});

test("one or more devotions can be combined with the type filter", () => {
  assert.deepEqual(
    searchLibrary(items, "", "all", ["Blessed Virgin Mary", "Holy Ghost"]).map((item) => item.id),
    ["ave-maria", "salve-regina", "veni-creator-spiritus"],
  );
  assert.deepEqual(
    searchLibrary(items, "", "prayer", new Set(["Blessed Virgin Mary", "Holy Ghost"]))
      .map((item) => item.id),
    ["ave-maria"],
  );
});

test("search finds a primary devotion", () => {
  assert.deepEqual(searchLibrary(items, "Blessed Virgin Mary").map((item) => item.id), [
    "ave-maria",
    "salve-regina",
  ]);
});

test("the index groups and sorts texts by devotion", () => {
  const groups = groupByDevotion([
    { title: "Salve Regina", devotion: "Blessed Virgin Mary" },
    { title: "Pater noster", devotion: "God the Father" },
    { title: "Ave Maria", devotion: "Blessed Virgin Mary" },
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      devotion: group.devotion,
      titles: group.items.map((item) => item.title),
    })),
    [
      { devotion: "Blessed Virgin Mary", titles: ["Ave Maria", "Salve Regina"] },
      { devotion: "God the Father", titles: ["Pater noster"] },
    ],
  );
});

test("Little Office Hours search through one visible parent item", () => {
  const office = prepareLibrary([
    {
      id: "little-office-example",
      title: "Little Office Example",
      type: "prayer",
      devotion: "Example Devotion",
      search: ["Matins", "Vespers"],
      text: "",
      children: ["little-office-example-vespers"],
    },
    {
      id: "little-office-example-vespers",
      title: "Little Office Example — Vespers",
      type: "prayer",
      devotion: "Example Devotion",
      search: ["Vesperae"],
      text: "Before the ending of the day, Creator of the world, we pray.",
      parent: "little-office-example",
      hour: "Vespers",
    },
  ]);

  const visible = browseLibrary(office);
  assert.deepEqual(visible.map((item) => item.id), ["little-office-example"]);
  assert.deepEqual(
    searchLibrary(visible, "ending of the day").map((item) => item.id),
    ["little-office-example"],
  );
});
