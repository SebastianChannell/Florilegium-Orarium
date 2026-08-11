function cleanText(value = "") {
  return String(value)
    .replace(/\\([\\`*_[\]{}()#+.!-])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function isBlockStart(line = "") {
  const trimmed = line.trim();
  return /^(?:#{2,3})\s+/.test(trimmed)
    || trimmed.startsWith(">")
    || /^\*(?!\*)([\s\S]*?)(?<!\*)\*$/.test(trimmed)
    || /^\[[^\]]+\]\(\?text=[a-z0-9]+(?:-[a-z0-9]+)*\)$/.test(trimmed);
}

export function parseDevotionalText(source = "") {
  const lines = String(source).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];

  for (let index = 0; index < lines.length;) {
    const trimmed = lines[index].trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: cleanText(heading[2]),
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const note = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        note.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "note", text: cleanText(note.join("\n")) });
      continue;
    }

    const rubric = trimmed.match(/^\*(?!\*)([\s\S]*?)(?<!\*)\*$/);
    if (rubric) {
      blocks.push({ type: "rubric", text: cleanText(rubric[1]) });
      index += 1;
      continue;
    }

    const link = trimmed.match(/^\[([^\]]+)\]\(\?text=([a-z0-9]+(?:-[a-z0-9]+)*)\)$/);
    if (link) {
      blocks.push({
        type: "link",
        text: cleanText(link[1]),
        item: link[2],
      });
      index += 1;
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: cleanText(paragraph.join("\n")) });
  }

  return blocks;
}
