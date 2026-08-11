export function splitLiturgicalText(text = "") {
  const source = String(text);
  const parts = [];
  const tokenPattern = /(^|\n)([\t ]*)((?:[VR]\.)|(?:Ant\.(?:\s+(?:ad|at)\s+(?:the\s+)?(?:Benedictus|Magnificat)\.)?))(?=[\t ]|$)|([☩✠✙])/g;
  let cursor = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const lineToken = match[3];
    const tokenStart = lineToken
      ? match.index + match[1].length + match[2].length
      : match.index;

    if (tokenStart > cursor) {
      parts.push({ text: source.slice(cursor, tokenStart), marker: false, kind: "text" });
    }

    const token = lineToken ?? match[4];
    const marker = /^[VR]\.$/.test(token);
    parts.push({
      text: token,
      marker,
      kind: marker ? "marker" : lineToken ? "label" : "cross",
    });
    cursor = tokenStart + token.length;
  }

  if (cursor < source.length) {
    parts.push({ text: source.slice(cursor), marker: false, kind: "text" });
  }

  return parts;
}
