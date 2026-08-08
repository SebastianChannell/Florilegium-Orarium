import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { browseLibrary, prepareLibrary, searchLibrary } from "../public/search.js";

const library = JSON.parse(
  readFileSync(new URL("../dist/library.json", import.meta.url), "utf8"),
).items;
const itemsById = new Map(library.map((item) => [item.id, item]));

const offices = new Map([
  ["little-office-of-the-immaculate-conception", 7],
  ["little-office-of-the-sacred-heart-of-jesus", 8],
  ["little-office-of-the-holy-trinity", 7],
  ["little-office-of-the-blessed-sacrament", 7],
  ["little-office-of-penance", 8],
]);

test("each Little Office appears once and links to bilingual Hour pages", () => {
  const visibleIds = new Set(browseLibrary(library).map((item) => item.id));

  for (const [officeId, expectedHours] of offices) {
    const office = itemsById.get(officeId);
    assert.ok(office, `${officeId}: parent record`);
    assert.equal(office.children.length, expectedHours, `${officeId}: Hour count`);
    assert.equal(visibleIds.has(officeId), true, `${officeId}: visible parent`);

    for (const childId of office.children) {
      const child = itemsById.get(childId);
      assert.ok(child, `${childId}: child record`);
      assert.equal(child.parent, officeId, `${childId}: parent link`);
      assert.equal(child.layout, "parallel", `${childId}: bilingual layout`);
      assert.equal(visibleIds.has(childId), false, `${childId}: hidden from main index`);
      assert.match(child.text, /\| Latin \| English \|/, `${childId}: paired source`);
    }
  }
});

test("Latin and English Hour text remains searchable through its Office parent", () => {
  const prepared = prepareLibrary(library);
  const visible = browseLibrary(prepared);

  assert.equal(searchLibrary(visible, "Patrem misericordiarum")[0].id, "little-office-of-penance");
  assert.equal(searchLibrary(visible, "Father of mercies")[0].id, "little-office-of-penance");
  assert.equal(searchLibrary(visible, "manducavit")[0].id, "little-office-of-the-blessed-sacrament");
  assert.equal(searchLibrary(visible, "Thus Angels’ Bread is made")[0].id, "little-office-of-the-blessed-sacrament");
});
