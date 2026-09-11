export const supportedLanguages = new Set(["en", "la", "es", "it"]);

const copy = {
  en: {
    all: "All",
    allTexts: "All texts",
    backToAll: "← All texts",
    backToOffice: "← Office Hours",
    chooseDevotions: "Choose one or more devotions",
    clearSelection: "Clear selection",
    devotions: "Devotions",
    devotionalIndex: "Devotional index",
    description: "A quiet, searchable collection of prayers and hymns in their original languages.",
    english: "English",
    errorLoading: "The texts could not be loaded. Please try again.",
    home: "Orarium home",
    hours: "Hours",
    hymns: "Hymns",
    language: "Prayer language",
    latin: "Latin",
    loading: "Loading…",
    noAvailable: "No texts are available in this section.",
    noFilters: "No texts match the selected filters.",
    prayers: "Prayers",
    search: "Search prayers and hymns",
    searchPlaceholder: "Search title, opening words, or text",
    selected: (count) => `${count} selected`,
    skip: "Skip to texts",
    spanish: "Español",
    textCount: (count) => `${count} ${count === 1 ? "text" : "texts"}`,
    textType: "Text type",
    title: "Prayers and hymns",
    unavailable: "Unavailable",
  },
};

export function uiText(_language, key, value) {
  const entry = copy.en[key] ?? key;
  return typeof entry === "function" ? entry(value) : entry;
}

export function localizedField(item, field) {
  return item?.[field] ?? "";
}

export function localizedText(item, language = "en") {
  if (!item) return "";

  const sourceLanguage = item.language ?? "";
  if (sourceLanguage && language === sourceLanguage) return item.text ?? "";

  return item.translations?.[language]?.text ?? item.text ?? "";
}
