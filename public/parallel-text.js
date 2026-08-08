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

function hasOuterEmphasis(value = "") {
  const trimmed = String(value).trim();
  return /^\*(?!\*)([\s\S]*?)(?<!\*)\*$/.test(trimmed)
    || /^_(?!_)([\s\S]*?)(?<!_)_$/.test(trimmed);
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => ({
    text: cleanInlineText(cell),
    emphasized: hasOuterEmphasis(cell),
  }));
}

function isDelimiterRow(cells) {
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.text));
}

function isLanguageHeader(cells) {
  return cells[0]?.text.toLocaleLowerCase() === "latin"
    && cells[1]?.text.toLocaleLowerCase() === "english";
}

function isRubricText(text = "") {
  return /\b(?:dicitur|dicuntur|omittitur|omittuntur|secreto|loco alleluia|instead of alleluia|is said|are said|said silently|say:)\b/i.test(text);
}

function pairKind(cells) {
  if (cells.slice(0, 2).some((cell) => cell.emphasized)) return "rubric";
  if (cells.slice(0, 2).some((cell) => isRubricText(cell.text))) return "rubric";
  return "text";
}

const ENGLISH_HEADING = /^(?:Ordinary|Hymn|Antiphon|Conclusion of the Hour|Commendation|The Commendation|Let Us Pray|Prayer|Collect|Another Prayer|Invitatory|Lesson(?: I)?|Little Chapter|Responsory|Short Responsory|Psalm from Various Psalms [IVX]+)$/i;

export function splitParallelHeading(value = "") {
  const text = cleanHeading(value);
  const parts = text.split(/\s+—\s+/);
  const english = parts.at(-1) ?? "";

  if (parts.length > 1 && ENGLISH_HEADING.test(english)) {
    const latin = parts.slice(0, -1).join(" — ");
    const source = latin.match(/^Capitulum\s+—\s+(.+)$/i)?.[1];
    return {
      latin,
      english: source ? `${english} — ${source}` : english,
    };
  }

  const psalm = text.match(/^Psalmus\s+(.+?)(?:\s+—\s+.+)?$/i);
  if (psalm) {
    return { latin: text, english: `Psalm ${psalm[1]}` };
  }

  const canticle = text.match(/^Canticum\s+(.+?)(?:\s+—\s+(.+))?$/i);
  if (canticle) {
    const names = new Map([
      ["Beatæ Mariæ Virginis", "Canticle of the Blessed Virgin Mary"],
      ["Simeonis", "Canticle of Simeon"],
      ["Zachariæ", "Canticle of Zachary"],
    ]);
    const translated = names.get(canticle[1]);
    if (translated) {
      return {
        latin: text,
        english: canticle[2] ? `${translated} — ${canticle[2]}` : translated,
      };
    }
  }

  return { text };
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
            latin: rows[0][0]?.text ?? "",
            english: rows[0][1]?.text ?? "",
          });
        }

        for (const row of rows.slice(2)) {
          if (row.length < 2) continue;
          blocks.push({
            type: "pair",
            kind: pairKind(row),
            latin: row[0].text,
            english: row[1].text,
          });
        }
        continue;
      }

      for (const row of rows) {
        if (row.length < 2) continue;
        blocks.push({
          type: "pair",
          kind: pairKind(row),
          latin: row[0].text,
          english: row[1].text,
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
