import assert from "node:assert/strict";
import { test } from "node:test";
import { splitLiturgicalText } from "../public/liturgical-text.js";

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
