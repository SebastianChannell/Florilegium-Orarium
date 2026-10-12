import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

const sidebarStart = html.indexOf('<aside id="browse-sidebar"');
const sidebarEnd = html.indexOf("</aside>", sidebarStart);
const mainStart = html.indexOf('<main id="main-content"');
const mainEnd = html.indexOf("</main>", mainStart);
const sidebar = html.slice(sidebarStart, sidebarEnd);
const main = html.slice(mainStart, mainEnd);

test("existing browse controls and devotional index live in the drawer", () => {
  for (const id of ["search-form", "search-input", "type-filter", "result-count", "results"]) {
    assert.match(sidebar, new RegExp('id="' + id + '"'));
    assert.doesNotMatch(main, new RegExp('id="' + id + '"'));
  }
  assert.match(sidebar, /class="add-text-button"/);
  assert.match(main, /id="reader-view"/);
});

test("navigation drawer is closed and inert until activated", () => {
  assert.match(sidebar, /aria-hidden="true" inert>/);
  assert.match(html, /id="sidebar-toggle"[^>]+aria-expanded="false"/);
  assert.match(script, /elements\.sidebar\.inert = false/);
  assert.match(script, /elements\.sidebar\.inert = true/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /event\.key === "Tab"/);
});

test("sidebar uses the current Orarium palette and a single-column index", () => {
  assert.match(styles, /--accent: #8451CF;/);
  assert.match(styles, /--background: #070606;/);
  assert.match(styles, /\.browse-sidebar-content \.index-entries \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
});
