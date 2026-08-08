function cleanInlineText(value = "") {
  return String(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\\\|/g, "|")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/^\s*\*([\s\S]*?)\*\s*$/, "$1")
    .replace(/^\s*_([\s\S]*?)_\s*$/, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function cleanHeading(value = "") {
  return cleanInlineText(value)
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map(cleanInlineText);
}

function isDelimiterRow(cells) {
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isLanguageHeader(cells) {
  return cells[0]?.toLocaleLowerCase() === "latin"
    && cells[1]?.toLocaleLowerCase() === "english";
}

export function parseParallelText(source = "") {
  const lines = String(source).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed || trimmed === "---") {
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: cleanHeading(heading[2]),
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("|")) {
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }

      if (rows.length >= 2 && isDelimiterRow(rows[1])) {
        if (!isLanguageHeader(rows[0])) {
          blocks.push({
            type: "pair",
            kind: "subheading",
            latin: rows[0][0] ?? "",
            english: rows[0][1] ?? "",
          });
        }

        for (const row of rows.slice(2)) {
          if (row.length < 2) continue;
          blocks.push({
            type: "pair",
            kind: "text",
            latin: row[0],
            english: row[1],
          });
        }
        continue;
      }

      for (const row of rows) {
        if (row.length < 2) continue;
        blocks.push({
          type: "pair",
          kind: "text",
          latin: row[0],
          english: row[1],
        });
      }
      continue;
    }

    const paragraph = [];
    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (!candidate || candidate === "---" || candidate.startsWith("|") || /^(#{2,4})\s+/.test(candidate)) {
        break;
      }
      paragraph.push(candidate.replace(/^>\s?/, ""));
      index += 1;
    }

    blocks.push({
      type: "note",
      text: cleanInlineText(paragraph.join("\n")),
    });
  }

  return blocks;
}
