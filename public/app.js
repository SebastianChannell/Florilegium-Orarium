import { groupByDevotion, prepareLibrary, searchLibrary } from "./search.js";

const elements = {
  backButton: document.querySelector("#back-button"),
  browseView: document.querySelector("#browse-view"),
  clearDevotions: document.querySelector("#clear-devotions"),
  devotionOptions: document.querySelector("#devotion-options"),
  devotionSelection: document.querySelector("#devotion-selection"),
  filters: [...document.querySelectorAll("[data-filter]")],
  readerText: document.querySelector("#reader-text"),
  readerTitle: document.querySelector("#reader-title"),
  readerView: document.querySelector("#reader-view"),
  resultCount: document.querySelector("#result-count"),
  results: document.querySelector("#results"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  statusMessage: document.querySelector("#status-message"),
};

const state = {
  devotions: new Set(),
  filter: "all",
  items: [],
  query: "",
};

function pageUrl({
  item,
  query = state.query,
  filter = state.filter,
  devotions = state.devotions,
} = {}) {
  const url = new URL(window.location.href);
  url.search = "";
  if (item) url.searchParams.set("text", item);
  if (query) url.searchParams.set("q", query);
  if (filter !== "all") url.searchParams.set("type", filter);
  for (const devotion of [...devotions].sort()) {
    url.searchParams.append("devotion", devotion);
  }
  return `${url.pathname}${url.search}`;
}

function syncDevotionControls() {
  for (const checkbox of elements.devotionOptions.querySelectorAll("[data-devotion]")) {
    checkbox.checked = state.devotions.has(checkbox.value);
  }

  const count = state.devotions.size;
  elements.devotionSelection.textContent = count === 0 ? "All" : `${count} selected`;
  elements.clearDevotions.hidden = count === 0;
}

function buildDevotionOptions() {
  const options = groupByDevotion(state.items).map(({ devotion }, index) => {
    const label = document.createElement("label");
    label.className = "devotion-option";
    label.htmlFor = `devotion-option-${index + 1}`;

    const checkbox = document.createElement("input");
    checkbox.id = label.htmlFor;
    checkbox.type = "checkbox";
    checkbox.name = "devotion";
    checkbox.value = devotion;
    checkbox.dataset.devotion = devotion;

    const name = document.createElement("span");
    name.textContent = devotion;

    label.append(checkbox, name);
    return label;
  });

  elements.devotionOptions.replaceChildren(...options);
  syncDevotionControls();
}

function makeResult(item) {
  const listItem = document.createElement("li");
  listItem.className = "result-item";

  const link = document.createElement("a");
  link.className = "result-link";
  link.href = pageUrl({ item: item.id });
  link.dataset.itemId = item.id;

  const title = document.createElement("span");
  title.className = "result-title";
  title.textContent = item.title;

  link.append(title);
  listItem.append(link);
  return listItem;
}

function makeDevotionGroup({ devotion, items }, index) {
  const section = document.createElement("section");
  section.className = "index-section";

  const headingRow = document.createElement("div");
  headingRow.className = "index-heading";

  const heading = document.createElement("h2");
  heading.id = `devotion-${index + 1}`;
  heading.textContent = devotion;
  section.setAttribute("aria-labelledby", heading.id);

  const count = document.createElement("span");
  count.className = "index-count";
  count.textContent = String(items.length);
  count.setAttribute("aria-label", `${items.length} ${items.length === 1 ? "text" : "texts"}`);

  const list = document.createElement("ol");
  list.className = "index-entries";
  list.append(...items.map(makeResult));

  headingRow.append(heading, count);
  section.append(headingRow, list);
  return section;
}

function renderList() {
  const matches = searchLibrary(state.items, state.query, state.filter, state.devotions);
  const groups = groupByDevotion(matches);
  elements.results.replaceChildren(...groups.map(makeDevotionGroup));
  elements.resultCount.textContent = `${matches.length} ${matches.length === 1 ? "text" : "texts"}`;
  elements.statusMessage.hidden = matches.length !== 0;
  elements.statusMessage.textContent = state.query
    ? `No text contains “${state.query}”.`
    : state.devotions.size > 0 || state.filter !== "all"
      ? "No texts match the selected filters."
      : "No texts are available in this section.";
  elements.browseView.hidden = false;
  elements.readerView.hidden = true;
  document.title = "Orarium — Sacrum Florilegium";
}

function setFilter(filter, { updateUrl = true } = {}) {
  state.filter = new Set(["all", "prayer", "hymn"]).has(filter) ? filter : "all";
  for (const button of elements.filters) {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  renderList();
  if (updateUrl) history.replaceState({ view: "list" }, "", pageUrl());
}

function openReader(item, { push = true } = {}) {
  if (!item) {
    showBrowse({ replace: true });
    return;
  }

  elements.readerTitle.textContent = item.title;
  elements.readerText.textContent = item.text;
  elements.browseView.hidden = true;
  elements.readerView.hidden = false;
  document.title = `${item.title} — Orarium`;

  if (push) {
    history.pushState({ view: "reader", item: item.id }, "", pageUrl({ item: item.id }));
  }

  window.scrollTo({ top: 0, behavior: "auto" });
  elements.readerTitle.focus({ preventScroll: true });
}

function showBrowse({ replace = false } = {}) {
  renderList();
  const method = replace ? "replaceState" : "pushState";
  history[method]({ view: "list" }, "", pageUrl());
  window.scrollTo({ top: 0, behavior: "auto" });
}

function readLocation() {
  const params = new URLSearchParams(window.location.search);
  state.query = params.get("q") ?? "";
  const availableDevotions = new Set(state.items.map((item) => item.devotion));
  state.devotions = new Set(
    params.getAll("devotion").filter((devotion) => availableDevotions.has(devotion)),
  );
  elements.searchInput.value = state.query;
  syncDevotionControls();
  setFilter(params.get("type") ?? "all", { updateUrl: false });

  const selectedId = params.get("text");
  if (selectedId) {
    openReader(state.items.find((item) => item.id === selectedId), { push: false });
  } else {
    renderList();
  }
}

elements.searchForm.addEventListener("submit", (event) => event.preventDefault());

elements.searchInput.addEventListener("input", () => {
  state.query = elements.searchInput.value.trim();
  renderList();
  history.replaceState({ view: "list" }, "", pageUrl());
});

elements.devotionOptions.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.matches("[data-devotion]")) return;

  if (event.target.checked) {
    state.devotions.add(event.target.value);
  } else {
    state.devotions.delete(event.target.value);
  }

  syncDevotionControls();
  renderList();
  history.replaceState({ view: "list" }, "", pageUrl());
});

elements.clearDevotions.addEventListener("click", () => {
  state.devotions.clear();
  syncDevotionControls();
  renderList();
  history.replaceState({ view: "list" }, "", pageUrl());
});

for (const button of elements.filters) {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
}

elements.results.addEventListener("click", (event) => {
  const link = event.target.closest("[data-item-id]");
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openReader(state.items.find((item) => item.id === link.dataset.itemId));
});

elements.backButton.addEventListener("click", () => {
  if (history.state?.view === "reader") {
    history.back();
  } else {
    showBrowse({ replace: true });
  }
});

window.addEventListener("popstate", readLocation);

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !elements.browseView.hidden && document.activeElement !== elements.searchInput) {
    event.preventDefault();
    elements.searchInput.focus();
  }
});

async function start() {
  try {
    const response = await fetch("./library.json");
    if (!response.ok) throw new Error(`Library request failed with ${response.status}`);
    const library = await response.json();
    state.items = prepareLibrary(library.items);
    buildDevotionOptions();
    history.replaceState({ view: "list" }, "", window.location.href);
    readLocation();
  } catch (error) {
    console.error(error);
    elements.results.replaceChildren();
    elements.resultCount.textContent = "Unavailable";
    elements.statusMessage.textContent = "The texts could not be loaded. Please try again.";
    elements.statusMessage.hidden = false;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.error("Offline setup failed", error));
  }
}

start();
