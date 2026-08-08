export function splitLiturgicalText(text = "") {
  const source = String(text);
  const parts = [];
  const markerPattern = /(^|\n)([\t ]*)([VR]\.)(?=[\t ]|$)/g;
  let cursor = 0;

  for (const match of source.matchAll(markerPattern)) {
    const markerStart = match.index + match[1].length + match[2].length;
    if (markerStart > cursor) {
      parts.push({ text: source.slice(cursor, markerStart), marker: false });
    }

    parts.push({ text: match[3], marker: true });
    cursor = markerStart + match[3].length;
  }

  if (cursor < source.length) {
    parts.push({ text: source.slice(cursor), marker: false });
  }

  return parts;
}
