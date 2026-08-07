import { prepareLibrary, searchLibrary } from "./search.js";

const elements = {
  backButton: document.querySelector("#back-button"),
  browseView: document.querySelector("#browse-view"),
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
  filter: "all",
  items: [],
  query: "",
};

function pageUrl({ item, query = state.query, filter = state.filter } = {}) {
  const url = new URL(window.location.href);
  url.search = "";
  if (item) url.searchParams.set("text", item);
  if (query) url.searchParams.set("q", query);
  if (filter !== "all") url.searchParams.set("type", filter);
  return `${url.pathname}${url.search}`;
}

function makeResult(item) {
  const listItem = document.createElement("li");
  listItem.className = "result-item";

  const link = document.createElement("a");
  link.className = "result-link";
  link.href = pageUrl({ item: item.id });
  link.dataset.itemId = item.id;

  const title = document.createElement("h2");
  title.className = "result-title";
  title.textContent = item.title;

  link.append(title);
  listItem.append(link);
  return listItem;
}

function renderList() {
  const matches = searchLibrary(state.items, state.query, state.filter);
  elements.results.replaceChildren(...matches.map(makeResult));
  elements.resultCount.textContent = `${matches.length} ${matches.length === 1 ? "text" : "texts"}`;
  elements.statusMessage.hidden = matches.length !== 0;
  elements.statusMessage.textContent = state.query
    ? `No text contains “${state.query}”.`
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
  elements.searchInput.value = state.query;
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
