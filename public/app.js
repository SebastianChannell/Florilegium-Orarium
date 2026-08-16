import { browseLibrary, groupByDevotion, prepareLibrary, searchLibrary } from "./search.js";
import { parseDevotionalText } from "./devotional-text.js";
import { localizedField, localizedText, supportedLanguages, uiText } from "./i18n.js";
import { splitLiturgicalText } from "./liturgical-text.js";
import { parseParallelText, splitParallelHeading } from "./parallel-text.js";

const elements = {
  backButton: document.querySelector("#back-button"),
  browseView: document.querySelector("#browse-view"),
  browseHeading: document.querySelector("#browse-heading"),
  clearDevotions: document.querySelector("#clear-devotions"),
  devotionsLabel: document.querySelector("#devotions-label"),
  devotionsLegend: document.querySelector("#devotions-legend"),
  devotionOptions: document.querySelector("#devotion-options"),
  devotionSelection: document.querySelector("#devotion-selection"),
  filters: [...document.querySelectorAll("[data-filter]")],
  homeLink: document.querySelector("#home-link"),
  languageButtons: [...document.querySelectorAll("[data-language]")],
  languageSwitch: document.querySelector("#language-switch"),
  metaDescription: document.querySelector("#meta-description"),
  officeHours: document.querySelector("#office-hours"),
  officeHoursLabel: document.querySelector("#office-hours-label"),
  officeHoursList: document.querySelector("#office-hours-list"),
  readerText: document.querySelector("#reader-text"),
  readerTitle: document.querySelector("#reader-title"),
  readerView: document.querySelector("#reader-view"),
  resultCount: document.querySelector("#result-count"),
  results: document.querySelector("#results"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  searchLabel: document.querySelector("#search-label"),
  skipLink: document.querySelector("#skip-link"),
  statusMessage: document.querySelector("#status-message"),
  typeFilters: document.querySelector("#type-filters"),
};

function preferredLanguage() {
  const requested = new URLSearchParams(window.location.search).get("lang");
  if (supportedLanguages.has(requested)) return requested;

  try {
    const stored = window.localStorage.getItem("orarium-language");
    if (supportedLanguages.has(stored)) return stored;
  } catch {
    // Local storage may be unavailable in a private browsing context.
  }

  return navigator.languages?.some((language) => language.toLocaleLowerCase().startsWith("es"))
    ? "es"
    : "en";
}

const state = {
  currentItem: null,
  devotions: new Set(),
  filter: "all",
  items: [],
  language: preferredLanguage(),
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
  if (state.language !== "en") url.searchParams.set("lang", state.language);
  if (item) url.searchParams.set("text", item);
  if (query) url.searchParams.set("q", query);
  if (filter !== "all") url.searchParams.set("type", filter);
  for (const devotion of [...devotions].sort()) {
    url.searchParams.append("devotion", devotion);
  }
  return `${url.pathname}${url.search}`;
}

function updateInterfaceCopy() {
  document.documentElement.lang = state.language;
  elements.metaDescription.content = uiText(state.language, "description");
  elements.skipLink.textContent = uiText(state.language, "skip");
  elements.homeLink.setAttribute("aria-label", uiText(state.language, "home"));
  elements.browseHeading.textContent = uiText(state.language, "title");
  elements.searchLabel.textContent = uiText(state.language, "search");
  elements.searchInput.placeholder = uiText(state.language, "searchPlaceholder");
  elements.devotionsLabel.textContent = uiText(state.language, "devotions");
  elements.devotionsLegend.textContent = uiText(state.language, "chooseDevotions");
  elements.clearDevotions.textContent = uiText(state.language, "clearSelection");
  elements.typeFilters.setAttribute("aria-label", uiText(state.language, "textType"));
  elements.results.setAttribute("aria-label", uiText(state.language, "devotionalIndex"));
  elements.officeHoursLabel.textContent = uiText(state.language, "hours");
  elements.languageSwitch.setAttribute("aria-label", uiText(state.language, "language"));

  const filterLabels = {
    all: uiText(state.language, "all"),
    prayer: uiText(state.language, "prayers"),
    hymn: uiText(state.language, "hymns"),
  };
  for (const button of elements.filters) button.textContent = filterLabels[button.dataset.filter];

  for (const button of elements.languageButtons) {
    const active = button.dataset.language === state.language;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function syncDevotionControls() {
  for (const checkbox of elements.devotionOptions.querySelectorAll("[data-devotion]")) {
    checkbox.checked = state.devotions.has(checkbox.value);
  }

  const count = state.devotions.size;
  elements.devotionSelection.textContent = count === 0
    ? uiText(state.language, "all")
    : uiText(state.language, "selected", count);
  elements.clearDevotions.hidden = count === 0;
}

function buildDevotionOptions() {
  const options = groupByDevotion(browseLibrary(state.items), state.language).map(({ key, devotion }, index) => {
    const label = document.createElement("label");
    label.className = "devotion-option";
    label.htmlFor = `devotion-option-${index + 1}`;

    const checkbox = document.createElement("input");
    checkbox.id = label.htmlFor;
    checkbox.type = "checkbox";
    checkbox.name = "devotion";
    checkbox.value = key;
    checkbox.dataset.devotion = key;

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
  title.textContent = localizedField(item, "title", state.language);

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
  count.setAttribute("aria-label", uiText(state.language, "textCount", items.length));

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
    state.language,
  );
  const groups = groupByDevotion(matches, state.language);
  const expanded = Boolean(state.query);
  elements.results.replaceChildren(
    ...groups.map((group, index) => makeDevotionGroup(group, index, expanded)),
  );
  elements.resultCount.textContent = uiText(state.language, "textCount", matches.length);
  elements.statusMessage.hidden = matches.length !== 0;
  elements.statusMessage.textContent = state.query
    ? state.language === "es"
      ? `Ningún texto contiene «${state.query}».`
      : `No text contains “${state.query}”.`
    : state.devotions.size > 0 || state.filter !== "all"
      ? uiText(state.language, "noFilters")
      : uiText(state.language, "noAvailable");
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
  if (updateUrl) history.replaceState({ view: "list", language: state.language }, "", pageUrl());
}

function makeOfficeHour(child) {
  const listItem = document.createElement("li");

  const link = document.createElement("a");
  link.className = "office-hour-link";
  link.href = pageUrl({ item: child.id });
  link.dataset.officeItemId = child.id;
  link.textContent = localizedField(child, "hour", state.language);

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
  latinLabel.textContent = uiText(state.language, "latin");

  const englishLabel = document.createElement("span");
  englishLabel.lang = state.language;
  englishLabel.textContent = uiText(state.language, state.language === "es" ? "spanish" : "english");

  languageRow.append(latinLabel, englishLabel);

  const blocks = parseParallelText(text).map((block) => {
    if (block.type === "heading") {
      const heading = document.createElement("div");
      heading.className = `parallel-heading parallel-heading-${block.level}`;
      heading.setAttribute("role", "heading");
      heading.setAttribute("aria-level", String(Math.min(block.level, 6)));

      const parts = splitParallelHeading(block.text, state.language);
      if (parts.latin && parts.english) {
        heading.classList.add("is-paired");

        const latin = document.createElement("span");
        latin.lang = "la";
        latin.textContent = parts.latin;

        const english = document.createElement("span");
        english.lang = state.language;
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
        makeParallelCell(block.english, state.language),
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
  const hasLocalizedBody = Boolean(item.translations?.[state.language]?.text);
  elements.readerText.lang = hasLocalizedBody ? state.language : item.language ?? "la";
  elements.readerText.classList.toggle("is-parallel", isParallel);
  elements.readerText.classList.toggle("is-devotional", isDevotional);
  elements.readerText.classList.toggle("is-office", isOffice);
  elements.readerView.classList.toggle("is-office", isOffice);

  if (isParallel) {
    renderParallelText(localizedText(item, state.language));
    return;
  }

  if (isDevotional) {
    renderDevotionalText(localizedText(item, state.language));
    return;
  }

  elements.readerText.replaceChildren(...makeLiturgicalNodes(localizedText(item, state.language)));
}

function openReader(item, {
  entryRoot = false,
  focus = true,
  fromOffice = false,
  fromItem = null,
  push = true,
  replace = false,
  scroll = true,
} = {}) {
  if (!item) {
    showBrowse({ replace: true });
    return;
  }

  state.currentItem = item;
  const itemTitle = localizedField(item, "title", state.language);
  elements.readerTitle.textContent = itemTitle;
  renderReaderText(item);
  elements.readerText.hidden = !item.text;

  const children = (item.children ?? [])
    .map((childId) => state.items.find((candidate) => candidate.id === childId))
    .filter(Boolean);
  const isOfficeIndex = children.length > 0;
  elements.officeHours.hidden = !isOfficeIndex;
  elements.officeHours.setAttribute(
    "aria-label",
    state.language === "es" ? `Horas de ${itemTitle}` : `Hours of ${itemTitle}`,
  );
  elements.officeHoursList.replaceChildren(...children.map(makeOfficeHour));

  const parent = item.parent
    ? state.items.find((candidate) => candidate.id === item.parent)
    : null;
  const linkedFrom = fromItem
    ? state.items.find((candidate) => candidate.id === fromItem)
    : null;
  elements.backButton.textContent = parent
    ? uiText(state.language, "backToOffice")
    : linkedFrom
      ? `← ${localizedField(linkedFrom, "title", state.language)}`
      : uiText(state.language, "backToAll");
  elements.backButton.setAttribute(
    "aria-label",
    parent
      ? state.language === "es"
        ? `Volver a ${localizedField(parent, "title", state.language)}`
        : `Back to ${localizedField(parent, "title", state.language)}`
      : linkedFrom
        ? state.language === "es"
          ? `Volver a ${localizedField(linkedFrom, "title", state.language)}`
          : `Back to ${localizedField(linkedFrom, "title", state.language)}`
        : state.language === "es"
          ? "Volver a todos los textos"
          : "Back to all texts",
  );
  elements.browseView.hidden = true;
  elements.readerView.hidden = false;
  document.title = `${itemTitle} — Orarium`;

  const historyState = {
    view: "reader",
    item: item.id,
    ...(entryRoot ? { entryRoot: true } : {}),
    ...(fromOffice ? { fromOffice: true } : {}),
    ...(linkedFrom ? { fromItem: linkedFrom.id } : {}),
    language: state.language,
  };
  if (push) {
    history.pushState(historyState, "", pageUrl({ item: item.id }));
  } else if (replace) {
    history.replaceState(historyState, "", pageUrl({ item: item.id }));
  }

  if (scroll) window.scrollTo({ top: 0, behavior: "auto" });
  if (focus) elements.readerTitle.focus({ preventScroll: true });
}

function showBrowse({ replace = false } = {}) {
  renderList();
  const method = replace ? "replaceState" : "pushState";
  history[method]({ view: "list", language: state.language }, "", pageUrl());
  window.scrollTo({ top: 0, behavior: "auto" });
}

function rememberLanguage(language) {
  try {
    window.localStorage.setItem("orarium-language", language);
  } catch {
    // The URL still preserves the selected language when storage is unavailable.
  }
}

function setLanguage(language, { updateUrl = true } = {}) {
  if (!supportedLanguages.has(language)) return;
  state.language = language;
  rememberLanguage(language);
  updateInterfaceCopy();
  buildDevotionOptions();

  if (state.currentItem) {
    openReader(state.currentItem, {
      entryRoot: Boolean(history.state?.entryRoot),
      focus: false,
      fromOffice: Boolean(history.state?.fromOffice),
      fromItem: history.state?.fromItem,
      push: false,
      scroll: false,
    });
  } else {
    renderList();
  }

  if (updateUrl) {
    history.replaceState(
      { ...history.state, language },
      "",
      pageUrl({ item: state.currentItem?.id }),
    );
  }
}

function readLocation() {
  const params = new URLSearchParams(window.location.search);
  const requestedLanguage = params.get("lang");
  const historyLanguage = history.state?.language;
  const nextLanguage = supportedLanguages.has(requestedLanguage)
    ? requestedLanguage
    : supportedLanguages.has(historyLanguage)
      ? historyLanguage
      : state.language;
  if (nextLanguage !== state.language) {
    state.language = nextLanguage;
    rememberLanguage(nextLanguage);
    updateInterfaceCopy();
    buildDevotionOptions();
  }
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

for (const button of elements.languageButtons) {
  button.addEventListener("click", () => setLanguage(button.dataset.language));
}

elements.searchInput.addEventListener("input", () => {
  state.query = elements.searchInput.value.trim();
  renderList();
  history.replaceState({ view: "list", language: state.language }, "", pageUrl());
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
  history.replaceState({ view: "list", language: state.language }, "", pageUrl());
});

elements.clearDevotions.addEventListener("click", () => {
  state.devotions.clear();
  syncDevotionControls();
  renderList();
  history.replaceState({ view: "list", language: state.language }, "", pageUrl());
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
  updateInterfaceCopy();
  elements.resultCount.textContent = uiText(state.language, "loading");
  try {
    const response = await fetch("./library.json");
    if (!response.ok) throw new Error(`Library request failed with ${response.status}`);
    const library = await response.json();
    state.items = prepareLibrary(library.items);
    buildDevotionOptions();
    const initialItem = new URLSearchParams(window.location.search).get("text");
    history.replaceState(
      initialItem
        ? { view: "reader", item: initialItem, entryRoot: true, language: state.language }
        : { view: "list", entryRoot: true, language: state.language },
      "",
      window.location.href,
    );
    readLocation();
    history.replaceState(
      { ...history.state, language: state.language },
      "",
      pageUrl({ item: initialItem ?? undefined }),
    );
  } catch (error) {
    console.error(error);
    elements.results.replaceChildren();
    elements.resultCount.textContent = uiText(state.language, "unavailable");
    elements.statusMessage.textContent = uiText(state.language, "errorLoading");
    elements.statusMessage.hidden = false;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.error("Offline setup failed", error));
  }
}

start();
