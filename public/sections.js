const elements = {
  filters: document.querySelector("#type-filters"),
  resultCount: document.querySelector("#result-count"),
  results: document.querySelector("#results"),
  languageButtons: [...document.querySelectorAll("[data-language]")],
  languageSwitch: document.querySelector("#language-switch"),
  readerTitle: document.querySelector("#reader-title"),
  readerView: document.querySelector("#reader-view"),
};

const itemSections = new Map();
const itemLanguages = new Map();
let sections = [];
let activeSection = new URLSearchParams(window.location.search).get("section") || "all";

for (const method of ["pushState", "replaceState"]) {
  const original = history[method].bind(history);
  history[method] = (state, title, url) => {
    if (url && activeSection !== "all") {
      const next = new URL(url, window.location.href);
      next.searchParams.delete("type");
      next.searchParams.set("section", activeSection);
      return original(state, title, `${next.pathname}${next.search}${next.hash}`);
    }
    return original(state, title, url);
  };
}

function currentLanguage() {
  return document.documentElement.lang === "es" ? "es" : "en";
}

function allLabel() {
  return currentLanguage() === "es" ? "Todo" : "All";
}

function updateFilterCopy() {
  elements.filters?.setAttribute("aria-label", currentLanguage() === "es" ? "Secciones" : "Sections");
  const allButton = elements.filters?.querySelector('[data-section="all"]');
  if (allButton) allButton.textContent = allLabel();
}

function syncButtons() {
  for (const button of elements.filters?.querySelectorAll("[data-section]") ?? []) {
    const active = button.dataset.section === activeSection;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function applySectionFilter() {
  if (!elements.results) return;
  let visible = 0;

  for (const result of elements.results.querySelectorAll(".result-item")) {
    const itemId = result.querySelector("[data-item-id]")?.dataset.itemId;
    const matches = activeSection === "all" || itemSections.get(itemId) === activeSection;
    result.hidden = !matches;
    if (matches) visible += 1;
  }

  for (const group of elements.results.querySelectorAll(".index-section")) {
    const visibleItems = [...group.querySelectorAll(".result-item")].filter((item) => !item.hidden);
    group.hidden = visibleItems.length === 0;
    const count = group.querySelector(".index-count");
    if (count) count.textContent = String(visibleItems.length);
  }

  if (elements.resultCount) {
    elements.resultCount.textContent = currentLanguage() === "es"
      ? `${visible} texto${visible === 1 ? "" : "s"}`
      : `${visible} text${visible === 1 ? "" : "s"}`;
  }
  syncButtons();
}

function readSectionFromUrl() {
  const requested = new URLSearchParams(window.location.search).get("section");
  activeSection = requested && sections.includes(requested) ? requested : "all";
}

function writeSectionToUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("type");
  if (activeSection === "all") url.searchParams.delete("section");
  else url.searchParams.set("section", activeSection);
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function buildFilters() {
  if (!elements.filters) return;
  const buttons = ["all", ...sections].map((section) => {
    const button = document.createElement("button");
    button.className = "filter";
    button.type = "button";
    button.dataset.section = section;
    button.setAttribute("aria-pressed", "false");
    button.textContent = section === "all" ? allLabel() : section;
    button.addEventListener("click", () => {
      activeSection = section;
      writeSectionToUrl();
      applySectionFilter();
    });
    return button;
  });
  elements.filters.replaceChildren(...buttons);
  updateFilterCopy();
  syncButtons();
}

function availableBodyLanguages(item) {
  if (!item || item.layout === "parallel") return [];

  const available = new Set();
  if (item.text?.trim()) available.add(item.language || "la");
  for (const [language, translation] of Object.entries(item.translations ?? {})) {
    if (translation?.text?.trim()) available.add(language);
  }

  return ["en", "la", "es", "it"].filter((language) => available.has(language));
}

function installNoteLanguageStyle() {
  if (document.querySelector("#note-language-style")) return;
  const style = document.createElement("style");
  style.id = "note-language-style";
  style.textContent = `
    .language-switch.note-language-switch {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin: 0.9rem 0 0;
      padding: 0;
      border-radius: 0;
      background: transparent;
    }

    .note-language-switch .language-button {
      min-height: auto;
      padding: 0.15rem 0;
      border-radius: 0;
      background: transparent !important;
      color: var(--muted);
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .note-language-switch .language-button.is-active {
      color: var(--accent);
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 0.28rem;
    }

    .note-language-switch .language-button[hidden],
    .language-switch.note-language-switch[hidden] {
      display: none;
    }
  `;
  document.head.append(style);
}

function syncNoteLanguageSwitcher() {
  if (!elements.languageSwitch || !elements.readerTitle) return;

  if (elements.languageSwitch.previousElementSibling !== elements.readerTitle) {
    elements.readerTitle.insertAdjacentElement("afterend", elements.languageSwitch);
  }
  elements.languageSwitch.classList.add("note-language-switch");
  elements.languageSwitch.setAttribute("aria-label", "Text language");

  const itemId = new URLSearchParams(window.location.search).get("text");
  const available = itemLanguages.get(itemId) ?? [];
  elements.languageSwitch.hidden = available.length <= 1 || elements.readerView?.hidden === true;

  for (const button of elements.languageButtons) {
    button.hidden = !available.includes(button.dataset.language);
  }

  if (available.length <= 1) return;

  const activeVisible = elements.languageButtons.some(
    (button) => !button.hidden && button.getAttribute("aria-pressed") === "true",
  );
  if (activeVisible) return;

  const preferred = available.includes("en") ? "en" : available[0];
  elements.languageButtons.find((button) => button.dataset.language === preferred)?.click();
}

async function startNoteLanguages() {
  if (!elements.languageSwitch || !elements.readerTitle) return;
  installNoteLanguageStyle();
  elements.readerTitle.insertAdjacentElement("afterend", elements.languageSwitch);
  elements.languageSwitch.classList.add("note-language-switch");
  elements.languageSwitch.hidden = true;

  const response = await fetch("./library.json", { cache: "no-store" });
  if (!response.ok) return;
  const library = await response.json();
  for (const item of library.items ?? []) {
    itemLanguages.set(item.id, availableBodyLanguages(item));
  }

  const observer = new MutationObserver(() => queueMicrotask(syncNoteLanguageSwitcher));
  observer.observe(elements.readerTitle, { childList: true, subtree: true });
  if (elements.readerView) observer.observe(elements.readerView, { attributes: true, attributeFilter: ["hidden"] });

  window.addEventListener("popstate", () => queueMicrotask(syncNoteLanguageSwitcher));
  for (const button of elements.languageButtons) {
    button.addEventListener("click", () => queueMicrotask(syncNoteLanguageSwitcher));
  }

  syncNoteLanguageSwitcher();
}

async function startSections() {
  if (!elements.filters || !elements.results) return;
  const response = await fetch("./sections.json", { cache: "no-store" });
  if (!response.ok) return;
  const data = await response.json();
  for (const [id, section] of Object.entries(data.items ?? {})) {
    if (typeof section === "string" && section.trim()) itemSections.set(id, section.trim());
  }
  if (itemSections.size === 0) return;

  sections = [...new Set(itemSections.values())]
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
  readSectionFromUrl();
  writeSectionToUrl();
  buildFilters();

  const observer = new MutationObserver(() => applySectionFilter());
  observer.observe(elements.results, { childList: true });
  applySectionFilter();

  window.addEventListener("popstate", () => {
    readSectionFromUrl();
    applySectionFilter();
  });

  for (const button of elements.languageButtons) {
    button.addEventListener("click", () => queueMicrotask(() => {
      updateFilterCopy();
      applySectionFilter();
    }));
  }
}

startNoteLanguages().catch((error) => console.error("Note language selector failed", error));
startSections().catch((error) => console.error("Section filters failed", error));
