const collator = new Intl.Collator(undefined, { sensitivity: "base" });

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
  return items.map((item) => {
    const devotion = normalizeSearchText(item.devotion);
    const search = normalizeSearchText(item.search.join(" "));
    const title = normalizeSearchText(item.title);
    const text = normalizeSearchText(item.text);

    return {
      ...item,
      _search: {
        devotion,
        haystack: `${title} ${devotion} ${search} ${text}`,
        search,
        text,
        title,
      },
    };
  });
}

function rankItem(item, normalizedQuery, tokens) {
  if (!tokens.every((token) => item._search.haystack.includes(token))) {
    return null;
  }

  let score = 0;
  if (item._search.title === normalizedQuery) score += 1_000;
  if (item._search.title.startsWith(normalizedQuery)) score += 500;
  if (item._search.devotion === normalizedQuery) score += 400;
  if (item._search.search.includes(normalizedQuery)) score += 300;

  for (const token of tokens) {
    if (item._search.title.includes(token)) score += 100;
    if (item._search.devotion.includes(token)) score += 80;
    if (item._search.search.includes(token)) score += 70;
    if (item._search.text.includes(token)) score += 5;
  }

  return score;
}

export function searchLibrary(items, query = "", filter = "all", devotions = []) {
  const selectedDevotions = new Set(devotions);
  const matchingType = filter === "all" ? items : items.filter((item) => item.type === filter);
  const eligible = selectedDevotions.size === 0
    ? matchingType
    : matchingType.filter((item) => selectedDevotions.has(item.devotion));
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [...eligible].sort((left, right) => collator.compare(left.title, right.title));
  }

  const tokens = [...new Set(normalizedQuery.split(" ").filter(Boolean))];
  return eligible
    .map((item) => ({ item, score: rankItem(item, normalizedQuery, tokens) }))
    .filter((entry) => entry.score !== null)
    .sort((left, right) => right.score - left.score || collator.compare(left.item.title, right.item.title))
    .map((entry) => entry.item);
}

export function groupByDevotion(items) {
  const grouped = new Map();

  for (const item of items) {
    const devotion = item.devotion || "Other";
    if (!grouped.has(devotion)) grouped.set(devotion, []);
    grouped.get(devotion).push(item);
  }

  return [...grouped]
    .sort(([left], [right]) => collator.compare(left, right))
    .map(([devotion, devotionItems]) => ({
      devotion,
      items: devotionItems.sort((left, right) => collator.compare(left.title, right.title)),
    }));
}
