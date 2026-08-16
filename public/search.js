import { localizedField } from "./i18n.js";

function collator(language = "en") {
  return new Intl.Collator(language, { sensitivity: "base" });
}

export function normalizeSearchText(value = "") {
  return String(value)
    .toLocaleLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("œ", "oe")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function prepareLibrary(items) {
  const prepared = items.map((item) => {
    const languages = {};
    for (const language of ["en", "es"]) {
      const translation = item.translations?.[language] ?? {};
      const devotion = normalizeSearchText(translation.devotion ?? item.devotion);
      const search = normalizeSearchText((translation.search ?? item.search ?? []).join(" "));
      const title = normalizeSearchText(translation.title ?? item.title);
      const text = normalizeSearchText(translation.text ?? item.text);

      languages[language] = {
        devotion,
        haystack: `${title} ${devotion} ${search} ${text}`,
        search,
        text,
        title,
      };
    }

    return {
      ...item,
      _search: {
        all: `${languages.en.haystack} ${languages.es.haystack}`,
        languages,
      },
    };
  });

  const itemsById = new Map(prepared.map((item) => [item.id, item]));
  for (const item of prepared) {
    if (!item.children?.length) continue;

    for (const language of ["en", "es"]) {
      const childText = item.children
        .map((childId) => itemsById.get(childId)?._search.languages[language].text ?? "")
        .filter(Boolean)
        .join(" ");
      const fields = item._search.languages[language];
      fields.text = `${fields.text} ${childText}`.trim();
      fields.haystack = [fields.title, fields.devotion, fields.search, fields.text].join(" ");
    }
    item._search.all = `${item._search.languages.en.haystack} ${item._search.languages.es.haystack}`;
  }

  return prepared;
}

export function browseLibrary(items) {
  return items.filter((item) => !item.parent);
}

function rankItem(item, normalizedQuery, tokens, language) {
  if (!tokens.every((token) => item._search.all.includes(token))) {
    return null;
  }

  const preferred = item._search.languages[language] ?? item._search.languages.en;
  const alternate = item._search.languages[language === "es" ? "en" : "es"];
  let score = 0;
  if (preferred.title === normalizedQuery) score += 1_000;
  if (preferred.title.startsWith(normalizedQuery)) score += 500;
  if (preferred.devotion === normalizedQuery) score += 400;
  if (preferred.search.includes(normalizedQuery)) score += 300;

  for (const token of tokens) {
    if (preferred.title.includes(token)) score += 100;
    if (preferred.devotion.includes(token)) score += 80;
    if (preferred.search.includes(token)) score += 70;
    if (preferred.text.includes(token)) score += 5;
    if (alternate.title.includes(token)) score += 40;
    if (alternate.devotion.includes(token)) score += 30;
    if (alternate.search.includes(token)) score += 25;
    if (alternate.text.includes(token)) score += 2;
  }

  return score;
}

export function searchLibrary(items, query = "", filter = "all", devotions = [], language = "en") {
  const selectedDevotions = new Set(devotions);
  const matchingType = filter === "all" ? items : items.filter((item) => item.type === filter);
  const eligible = selectedDevotions.size === 0
    ? matchingType
    : matchingType.filter((item) => selectedDevotions.has(item.devotion));
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    const sorter = collator(language);
    return [...eligible].sort((left, right) => sorter.compare(
      localizedField(left, "title", language),
      localizedField(right, "title", language),
    ));
  }

  const tokens = [...new Set(normalizedQuery.split(" ").filter(Boolean))];
  const sorter = collator(language);
  return eligible
    .map((item) => ({ item, score: rankItem(item, normalizedQuery, tokens, language) }))
    .filter((entry) => entry.score !== null)
    .sort((left, right) => right.score - left.score || sorter.compare(
      localizedField(left.item, "title", language),
      localizedField(right.item, "title", language),
    ))
    .map((entry) => entry.item);
}

export function groupByDevotion(items, language = "en") {
  const grouped = new Map();

  for (const item of items) {
    const devotion = item.devotion || "Other";
    if (!grouped.has(devotion)) grouped.set(devotion, []);
    grouped.get(devotion).push(item);
  }

  const sorter = collator(language);
  return [...grouped]
    .map(([key, devotionItems]) => ({
      key,
      devotion: localizedField(devotionItems[0], "devotion", language),
      items: devotionItems.sort((left, right) => sorter.compare(
        localizedField(left, "title", language),
        localizedField(right, "title", language),
      )),
    }))
    .sort((left, right) => sorter.compare(left.devotion, right.devotion));
}
