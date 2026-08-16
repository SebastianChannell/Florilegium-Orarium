export const supportedLanguages = new Set(["en", "es"]);

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
    language: "Language",
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
  es: {
    all: "Todos",
    allTexts: "Todos los textos",
    backToAll: "← Todos los textos",
    backToOffice: "← Horas del Oficio",
    chooseDevotions: "Elija una o más devociones",
    clearSelection: "Borrar selección",
    devotions: "Devociones",
    devotionalIndex: "Índice devocional",
    description: "Una colección serena de oraciones e himnos, fácil de consultar, en sus lenguas originales.",
    english: "English",
    errorLoading: "No se pudieron cargar los textos. Inténtelo de nuevo.",
    home: "Inicio de Orarium",
    hours: "Horas",
    hymns: "Himnos",
    language: "Idioma",
    latin: "Latín",
    loading: "Cargando…",
    noAvailable: "No hay textos disponibles en esta sección.",
    noFilters: "Ningún texto coincide con los filtros seleccionados.",
    prayers: "Oraciones",
    search: "Buscar oraciones e himnos",
    searchPlaceholder: "Buscar por título, primeras palabras o texto",
    selected: (count) => `${count} seleccionada${count === 1 ? "" : "s"}`,
    skip: "Saltar a los textos",
    spanish: "Español",
    textCount: (count) => `${count} ${count === 1 ? "texto" : "textos"}`,
    textType: "Tipo de texto",
    title: "Oraciones e himnos",
    unavailable: "No disponible",
  },
};

export function uiText(language, key, value) {
  const selected = supportedLanguages.has(language) ? language : "en";
  const entry = copy[selected][key] ?? copy.en[key] ?? key;
  return typeof entry === "function" ? entry(value) : entry;
}

export function localizedField(item, field, language = "en") {
  if (language === "en") return item?.[field] ?? "";
  return item?.translations?.[language]?.[field] ?? item?.[field] ?? "";
}

export function localizedText(item, language = "en") {
  return localizedField(item, "text", language);
}
