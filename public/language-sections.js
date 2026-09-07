const authoringCodes = Object.freeze({
  EN: "en",
  LA: "la",
  SP: "es",
});

export const languageSectionCodes = new Map(Object.entries(authoringCodes));

export function splitLanguageSections(value = "") {
  const text = String(value).replace(/\r\n/g, "\n").trim();
  const headingPattern = /^##[ \t]+(EN|LA|SP)[ \t]*$/gim;
  const matches = [...text.matchAll(headingPattern)];

  if (matches.length === 0) {
    return { text, sections: {} };
  }

  const prefix = text.slice(0, matches[0].index).trim();
  if (prefix) {
    throw new Error("language-section text must begin with ## EN, ## LA, or ## SP");
  }

  const sections = {};
  for (let index = 0; index < matches.length; index += 1) {
    const code = matches[index][1].toUpperCase();
    const language = authoringCodes[code];
    if (sections[language]) {
      throw new Error(`duplicate language section “${code}”`);
    }

    const bodyStart = matches[index].index + matches[index][0].length;
    const bodyEnd = matches[index + 1]?.index ?? text.length;
    const body = text.slice(bodyStart, bodyEnd).trim();
    if (!body) {
      throw new Error(`language section “${code}” cannot be empty`);
    }
    sections[language] = body;
  }

  return { text: "", sections };
}

export function choosePrimaryLanguage(sections, declaredLanguage = "") {
  const declared = String(declaredLanguage).toLowerCase().split("-")[0];
  if (declared && sections[declared]) return declared;
  if (sections.en) return "en";
  if (sections.la) return "la";
  if (sections.es) return "es";
  return "";
}
