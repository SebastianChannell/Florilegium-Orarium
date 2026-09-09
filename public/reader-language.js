const languageOrder = ["en", "la", "es"];
const languageSwitch = document.querySelector("#language-switch");
const languageButtons = [...document.querySelectorAll("[data-language]")];
const readerView = document.querySelector("#reader-view");

let itemsById = new Map();

function currentItem() {
  const id = new URLSearchParams(window.location.search).get("text");
  return id ? itemsById.get(id) : null;
}

function availableLanguages(item) {
  if (!item?.text) return [];

  if (item.layout === "parallel") {
    return languageOrder.filter((language) => {
      if (language === "en") return true;
      if (language === "la") return false;
      return Boolean(item.translations?.[language]?.text);
    });
  }

  const available = new Set();
  const sourceLanguage = languageOrder.includes(item.language) ? item.language : "la";
  available.add(sourceLanguage);

  for (const language of languageOrder) {
    if (item.translations?.[language]?.text) available.add(language);
  }

  return languageOrder.filter((language) => available.has(language));
}

function effectiveLanguage(item, available) {
  const active = languageButtons.find((button) => button.classList.contains("is-active"))?.dataset.language;
  if (available.includes(active)) return active;

  const sourceLanguage = languageOrder.includes(item?.language) ? item.language : "la";
  if (available.includes(sourceLanguage)) return sourceLanguage;
  if (available.includes("en")) return "en";
  return available[0] ?? "en";
}

function stripBrowseLanguageParameter() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("lang")) return;
  url.searchParams.delete("lang");
  history.replaceState(history.state, "", `${url.pathname}${url.search}`);
}

function syncLanguageControls() {
  const item = currentItem();
  const readerOpen = !readerView.hidden && Boolean(item);

  if (!readerOpen) {
    languageSwitch.hidden = true;
    document.documentElement.lang = "en";
    stripBrowseLanguageParameter();
    return;
  }

  const available = availableLanguages(item);
  const selected = effectiveLanguage(item, available);

  for (const button of languageButtons) {
    const isAvailable = available.includes(button.dataset.language);
    button.hidden = !isAvailable;

    if (!isAvailable || !available.includes(
      languageButtons.find((candidate) => candidate.classList.contains("is-active"))?.dataset.language,
    )) {
      const active = button.dataset.language === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  languageSwitch.hidden = available.length < 2;
  document.documentElement.lang = selected;
}

const observer = new MutationObserver(syncLanguageControls);
observer.observe(readerView, { attributes: true, attributeFilter: ["hidden"] });
observer.observe(document.querySelector("#reader-title"), { childList: true, subtree: true });

window.addEventListener("popstate", () => queueMicrotask(syncLanguageControls));

async function start() {
  try {
    const response = await fetch("./library.json");
    if (!response.ok) throw new Error(`Library request failed with ${response.status}`);
    const library = await response.json();
    itemsById = new Map((library.items ?? []).map((item) => [item.id, item]));
  } catch (error) {
    console.error("Prayer language controls could not be prepared", error);
  }

  syncLanguageControls();
}

start();
