const elements = {
  filters: document.querySelector("#type-filters"),
  resultCount: document.querySelector("#result-count"),
  results: document.querySelector("#results"),
  languageButtons: [...document.querySelectorAll("[data-language]")],
};

const itemSections = new Map();
let sections = [];
let activeSection = "all";

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

startSections().catch((error) => console.error("Section filters failed", error));
