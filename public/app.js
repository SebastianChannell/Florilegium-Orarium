import { browseLibrary, groupByDevotion, prepareLibrary, searchLibrary } from "./search.js";
import { parseDevotionalText } from "./devotional-text.js";
import { splitLiturgicalText } from "./liturgical-text.js";
import { parseParallelText, splitParallelHeading } from "./parallel-text.js";

const elements = {
  backButton: document.querySelector("#back-button"),
  browseView: document.querySelector("#browse-view"),
  clearDevotions: document.querySelector("#clear-devotions"),
  devotionOptions: document.querySelector("#devotion-options"),
  devotionSelection: document.querySelector("#devotion-selection"),
  filters: [...document.querySelectorAll("[data-filter]")],
  officeHours: document.querySelector("#office-hours"),
  officeHoursList: document.querySelector("#office-hours-list"),
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
  currentItem: null,
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
  const options = groupByDevotion(browseLibrary(state.items)).map(({ devotion }, index) => {
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

function makeDevotionGroup({ devotion, items }, index, expanded) {
  const section = document.createElement("details");
  section.className = "index-section";
  section.open = expanded;

  const headingRow = document.createElement("summary");
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
  state.currentItem = null;
  const matches = searchLibrary(
    browseLibrary(state.items),
    state.query,
    state.filter,
    state.devotions,
  );
  const groups = groupByDevotion(matches);
  const expanded = Boolean(state.query);
  elements.results.replaceChildren(
    ...groups.map((group, index) => makeDevotionGroup(group, index, expanded)),
  );
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

function makeOfficeHour(child) {
  const listItem = document.createElement("li");

  const link = document.createElement("a");
  link.className = "office-hour-link";
  link.href = pageUrl({ item: child.id });
  link.dataset.officeItemId = child.id;
  link.textContent = child.hour;

  listItem.append(link);
  return listItem;
}

function makeLiturgicalNodes(text) {
  return splitLiturgicalText(text).map((part) => {
    if (part.kind === "text") return document.createTextNode(part.text);

    const token = document.createElement("span");
    token.className = `liturgical-${part.kind}`;
    token.textContent = part.text;
    return token;
  });
}

function makeParallelCell(text, language) {
  const cell = document.createElement("div");
  cell.className = "parallel-cell";
  cell.lang = language;
  cell.append(...makeLiturgicalNodes(text));
  return cell;
}

function renderParallelText(text) {
  const languageRow = document.createElement("div");
  languageRow.className = "parallel-language-row";

  const latinLabel = document.createElement("span");
  latinLabel.lang = "la";
  latinLabel.textContent = "Latin";

  const englishLabel = document.createElement("span");
  englishLabel.lang = "en";
  englishLabel.textContent = "English";

  languageRow.append(latinLabel, englishLabel);

  const blocks = parseParallelText(text).map((block) => {
    if (block.type === "heading") {
      const heading = document.createElement("div");
      heading.className = `parallel-heading parallel-heading-${block.level}`;
      heading.setAttribute("role", "heading");
      heading.setAttribute("aria-level", String(Math.min(block.level, 6)));

      const parts = splitParallelHeading(block.text);
      if (parts.latin && parts.english) {
        heading.classList.add("is-paired");

        const latin = document.createElement("span");
        latin.lang = "la";
        latin.textContent = parts.latin;

        const english = document.createElement("span");
        english.lang = "en";
        english.textContent = parts.english;

        heading.append(latin, english);
      } else {
        heading.textContent = parts.text;
      }
      return heading;
    }

    if (block.type === "pair") {
      const row = document.createElement("div");
      row.className = `parallel-pair parallel-${block.kind}`;
      row.append(
        makeParallelCell(block.latin, "la"),
        makeParallelCell(block.english, "en"),
      );
      return row;
    }

    const note = document.createElement("div");
    note.className = "parallel-note";
    note.append(...makeLiturgicalNodes(block.text));
    return note;
  });

  elements.readerText.replaceChildren(languageRow, ...blocks);
}

function makeDevotionalBlock(block) {
  if (block.type === "heading") {
    const heading = document.createElement(`h${block.level}`);
    heading.className = `devotional-heading devotional-heading-${block.level}`;
    heading.textContent = block.text;
    return heading;
  }

  if (block.type === "link") {
    const link = document.createElement("a");
    link.className = "devotional-link";
    link.href = pageUrl({ item: block.item });
    link.dataset.devotionalItemId = block.item;

    const arrow = document.createElement("span");
    arrow.className = "devotional-link-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";

    const label = document.createElement("span");
    label.textContent = block.text;
    link.append(arrow, label);
    return link;
  }

  const element = document.createElement(block.type === "note" ? "aside" : "p");
  element.className = `devotional-${block.type}`;
  element.append(...makeLiturgicalNodes(block.text));
  return element;
}

function renderDevotionalText(text) {
  elements.readerText.replaceChildren(...parseDevotionalText(text).map(makeDevotionalBlock));
}

function renderReaderText(item) {
  const isParallel = item.layout === "parallel";
  const isDevotional = item.layout === "devotional";
  const isOffice = isParallel && Boolean(item.parent);
  elements.readerText.classList.toggle("is-parallel", isParallel);
  elements.readerText.classList.toggle("is-devotional", isDevotional);
  elements.readerText.classList.toggle("is-office", isOffice);
  elements.readerView.classList.toggle("is-office", isOffice);

  if (isParallel) {
    renderParallelText(item.text);
    return;
  }

  if (isDevotional) {
    renderDevotionalText(item.text);
    return;
  }

  elements.readerText.replaceChildren(...makeLiturgicalNodes(item.text));
}

function openReader(item, {
  entryRoot = false,
  fromOffice = false,
  fromItem = null,
  push = true,
  replace = false,
} = {}) {
  if (!item) {
    showBrowse({ replace: true });
    return;
  }

  state.currentItem = item;
  elements.readerTitle.textContent = item.title;
  renderReaderText(item);
  elements.readerText.hidden = !item.text;

  const children = (item.children ?? [])
    .map((childId) => state.items.find((candidate) => candidate.id === childId))
    .filter(Boolean);
  const isOfficeIndex = children.length > 0;
  elements.officeHours.hidden = !isOfficeIndex;
  elements.officeHours.setAttribute("aria-label", `Hours of ${item.title}`);
  elements.officeHoursList.replaceChildren(...children.map(makeOfficeHour));

  const parent = item.parent
    ? state.items.find((candidate) => candidate.id === item.parent)
    : null;
  const linkedFrom = fromItem
    ? state.items.find((candidate) => candidate.id === fromItem)
    : null;
  elements.backButton.textContent = parent
    ? "← Office Hours"
    : linkedFrom
      ? `← ${linkedFrom.title}`
      : "← All texts";
  elements.backButton.setAttribute(
    "aria-label",
    parent
      ? `Back to ${parent.title}`
      : linkedFrom
        ? `Back to ${linkedFrom.title}`
        : "Back to all texts",
  );
  elements.browseView.hidden = true;
  elements.readerView.hidden = false;
  document.title = `${item.title} — Orarium`;

  const historyState = {
    view: "reader",
    item: item.id,
    ...(entryRoot ? { entryRoot: true } : {}),
    ...(fromOffice ? { fromOffice: true } : {}),
    ...(linkedFrom ? { fromItem: linkedFrom.id } : {}),
  };
  if (push) {
    history.pushState(historyState, "", pageUrl({ item: item.id }));
  } else if (replace) {
    history.replaceState(historyState, "", pageUrl({ item: item.id }));
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
    openReader(state.items.find((item) => item.id === selectedId), {
      fromItem: history.state?.fromItem,
      push: false,
    });
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

elements.officeHours.addEventListener("click", (event) => {
  const link = event.target.closest("[data-office-item-id]");
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openReader(
    state.items.find((item) => item.id === link.dataset.officeItemId),
    { fromOffice: true },
  );
});

elements.readerText.addEventListener("click", (event) => {
  const link = event.target.closest("[data-devotional-item-id]");
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const target = state.items.find((item) => item.id === link.dataset.devotionalItemId);
  if (!target) return;
  openReader(target, { fromItem: state.currentItem?.id });
});

elements.backButton.addEventListener("click", () => {
  if (state.currentItem?.parent) {
    if (history.state?.fromOffice) {
      history.back();
      return;
    }

    const parent = state.items.find((item) => item.id === state.currentItem.parent);
    openReader(parent, {
      entryRoot: Boolean(history.state?.entryRoot),
      push: false,
      replace: true,
    });
  } else if (history.state?.fromItem) {
    history.back();
  } else if (history.state?.view === "reader" && !history.state?.entryRoot) {
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
    const initialItem = new URLSearchParams(window.location.search).get("text");
    history.replaceState(
      initialItem
        ? { view: "reader", item: initialItem, entryRoot: true }
        : { view: "list", entryRoot: true },
      "",
      window.location.href,
    );
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
