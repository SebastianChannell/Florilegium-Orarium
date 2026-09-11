const $ = (selector) => document.querySelector(selector);
const KEY_STORAGE = "orarium-admin-key";
const LANGUAGE_DEFINITIONS = Object.freeze({
  LA: { name: "Latin", placeholder: "Latin text" },
  EN: { name: "English", placeholder: "English text" },
  SP: { name: "Español", placeholder: "Spanish text" },
  IT: { name: "Italiano", placeholder: "Italian text" },
});
const LANGUAGE_ORDER = ["LA", "EN", "SP", "IT"];

const state = {
  devotions: [],
  sourceUrl: "",
  sourceTitle: "",
  languages: [],
};

function slugify(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function adminKey() {
  return $("#admin-key").value.trim();
}

function saveKeyIfNeeded() {
  const key = adminKey();
  if ($("#remember-key").checked && key) {
    localStorage.setItem(KEY_STORAGE, key);
    $("#key-state").textContent = "Saved on device";
  } else {
    localStorage.removeItem(KEY_STORAGE);
    $("#key-state").textContent = "Not saved";
  }
}

async function api(path, payload) {
  const key = adminKey();
  if (!key) throw new Error("Enter the Orarium admin key first.");
  saveKeyIfNeeded();

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

async function loadDevotions() {
  const response = await fetch("../library.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Could not load Orarium's devotion list.");
  const library = await response.json();
  state.devotions = [...new Set((library.items || []).map((item) => item.devotion).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

  const select = $("#devotion");
  select.replaceChildren(...state.devotions.map((devotion) => {
    const option = document.createElement("option");
    option.value = devotion;
    option.textContent = devotion;
    return option;
  }));
}

function setBusy(button, busy, busyLabel, normalLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : normalLabel;
}

function setStatus(element, message = "", kind = "") {
  element.textContent = message;
  element.className = `status${kind ? ` ${kind}` : ""}`;
}

function renderLanguages(languages = state.languages) {
  state.languages = [...languages]
    .filter((language) => LANGUAGE_DEFINITIONS[language.code])
    .sort((left, right) => LANGUAGE_ORDER.indexOf(left.code) - LANGUAGE_ORDER.indexOf(right.code));

  const grid = $("#language-grid");
  grid.replaceChildren(...state.languages.map((language) => {
    const definition = LANGUAGE_DEFINITIONS[language.code];
    const card = document.createElement("section");
    card.className = "language-card";
    card.dataset.languageCard = language.code;
    card.innerHTML = `
      <div class="language-heading">
        <h3>${language.code} · ${definition.name}</h3>
        <div class="language-actions">
          <select class="provenance" data-provenance="${language.code}" aria-label="${definition.name} provenance">
            <option value="source">Source text</option>
            <option value="generated">Generated</option>
          </select>
          <button class="remove-language" type="button" data-remove-language="${language.code}" aria-label="Remove ${definition.name}">×</button>
        </div>
      </div>
      <textarea data-language="${language.code}" rows="10" placeholder="${definition.placeholder}"></textarea>`;
    card.querySelector("textarea").value = language.text || "";
    card.querySelector("select").value = language.provenance === "generated" ? "generated" : "source";
    return card;
  }));

  syncTranslationTargets();
}

function syncTranslationTargets() {
  const select = $("#translation-language");
  const existing = new Set(state.languages.map((language) => language.code));
  for (const option of select.options) option.disabled = existing.has(option.value);
  const firstAvailable = [...select.options].find((option) => !option.disabled);
  if (select.selectedOptions[0]?.disabled) select.value = firstAvailable?.value || "";
  $("#translate-button").disabled = !firstAvailable;
}

function populateDraft(draft) {
  $("#title").value = draft.title || "";
  $("#id").value = slugify(draft.id || draft.title || "");
  $("#type").value = draft.type === "hymn" ? "hymn" : "prayer";

  if (draft.devotion && !state.devotions.includes(draft.devotion)) {
    const option = document.createElement("option");
    option.value = draft.devotion;
    option.textContent = `${draft.devotion} (not configured)`;
    option.dataset.unconfigured = "true";
    $("#devotion").append(option);
  }
  $("#devotion").value = draft.devotion || state.devotions[0] || "";
  $("#search").value = (draft.search || []).join(", ");

  renderLanguages(draft.languages || []);

  state.sourceUrl = draft.sourceUrl || "";
  state.sourceTitle = draft.sourceTitle || "";
  const meta = $("#source-meta");
  if (state.sourceUrl) {
    meta.hidden = false;
    const link = $("#source-link");
    link.href = state.sourceUrl;
    link.textContent = state.sourceUrl;
    $("#source-page-title").textContent = state.sourceTitle ? `Page title: ${state.sourceTitle}` : "";
  } else {
    meta.hidden = true;
  }

  const notes = (draft.notes || []).filter(Boolean);
  $("#analysis-notes").hidden = notes.length === 0;
  $("#notes-list").replaceChildren(...notes.map((note) => {
    const li = document.createElement("li");
    li.textContent = note;
    return li;
  }));

  $("#review-panel").hidden = false;
  $("#preview-panel").hidden = false;
  updatePreview();
  $("#review-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function collectDraft() {
  const languages = state.languages.map(({ code }) => ({
    code,
    text: $(`[data-language="${code}"]`)?.value.trim() || "",
    provenance: $(`[data-provenance="${code}"]`)?.value || "source",
  })).filter((language) => language.text);

  return {
    title: $("#title").value.trim(),
    id: slugify($("#id").value || $("#title").value),
    type: $("#type").value,
    devotion: $("#devotion").value,
    search: $("#search").value.split(",").map((value) => value.trim()).filter(Boolean),
    languages,
    sourceUrl: state.sourceUrl,
    sourceTitle: state.sourceTitle,
  };
}

function renderText(text) {
  return escapeHtml(text)
    .replace(/^(V\.|R\.)\s*/gm, '<strong class="vr">$1</strong> ')
    .replace(/^(Ant\.)\s*/gm, '<strong class="ant">$1</strong> ')
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function updatePreview() {
  const draft = collectDraft();
  $("#id").value = draft.id;
  $("#preview-heading").textContent = draft.title || "Untitled text";
  $("#preview-meta").textContent = [draft.type === "hymn" ? "Hymn" : "Prayer", draft.devotion].filter(Boolean).join(" · ");
  $("#preview-body").innerHTML = draft.languages.map((language) => `
    <section class="preview-language">
      <div class="preview-language-title">
        <h3>${language.code}</h3>
        <span>${language.provenance === "generated" ? "generated · review" : "source text"}</span>
      </div>
      <div class="preview-text">${renderText(language.text)}</div>
    </section>
  `).join("");
}

async function analyze() {
  const button = $("#analyze-button");
  const status = $("#analyze-status");
  const source = $("#source-input").value.trim();
  if (!source) {
    setStatus(status, "Paste a prayer, hymn, or webpage URL first.", "error");
    return;
  }

  setBusy(button, true, "Preparing…", "Prepare prayer");
  setStatus(status, "Reading the source and preparing the entry…");
  try {
    const { draft } = await api("../api/analyze", {
      source,
      devotions: state.devotions,
      generateTranslations: $("#generate-translations").checked,
    });
    populateDraft(draft);
    setStatus(status, "Prepared. Review the text below before publishing.", "success");
  } catch (error) {
    setStatus(status, error.message, "error");
  } finally {
    setBusy(button, false, "Preparing…", "Prepare prayer");
  }
}

async function translateLanguage() {
  const button = $("#translate-button");
  const status = $("#translate-status");
  const targetCode = $("#translation-language").value;
  const draft = collectDraft();
  if (!targetCode) return;
  if (draft.languages.length === 0) {
    setStatus(status, "Add source text before translating.", "error");
    return;
  }

  setBusy(button, true, "Translating…", "Add & translate");
  setStatus(status, `Translating into ${LANGUAGE_DEFINITIONS[targetCode].name}…`);
  try {
    const { language } = await api("../api/translate", { targetCode, languages: draft.languages });
    renderLanguages([...draft.languages, language]);
    updatePreview();
    setStatus(status, `${LANGUAGE_DEFINITIONS[targetCode].name} added. Review and edit it before publishing.`, "success");
  } catch (error) {
    setStatus(status, error.message, "error");
  } finally {
    setBusy(button, false, "Translating…", "Add & translate");
    syncTranslationTargets();
  }
}

async function publish() {
  const button = $("#publish-button");
  const status = $("#publish-status");
  const draft = collectDraft();

  if (!draft.title || !draft.devotion || draft.languages.length === 0) {
    setStatus(status, "Title, devotion, and at least one language are required.", "error");
    return;
  }

  if (!state.devotions.includes(draft.devotion)) {
    setStatus(status, "Choose an existing Orarium devotion before publishing so the Spanish site build remains valid.", "error");
    return;
  }

  setBusy(button, true, "Publishing…", "Publish to Orarium");
  setStatus(status, "Creating the Markdown file on main…");
  try {
    const result = await api("../api/publish", draft);
    setStatus(status, `Published ${result.path}. Cloudflare will deploy the commit automatically.`, "success");
    button.textContent = "Published ✓";
    button.disabled = true;
    $("#add-another-button").hidden = false;
  } catch (error) {
    setStatus(status, error.message, "error");
    setBusy(button, false, "Publishing…", "Publish to Orarium");
  }
}

function resetForm() {
  $("#source-input").value = "";
  $("#generate-translations").checked = false;
  $("#review-panel").hidden = true;
  $("#preview-panel").hidden = true;
  $("#add-another-button").hidden = true;
  $("#publish-button").disabled = false;
  $("#publish-button").textContent = "Publish to Orarium";
  $("#id").removeAttribute("data-edited");
  state.sourceUrl = "";
  state.sourceTitle = "";
  renderLanguages([]);
  for (const id of ["analyze-status", "publish-status", "translate-status"]) setStatus($(`#${id}`));
  $("#source-input").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function init() {
  const stored = localStorage.getItem(KEY_STORAGE) || "";
  if (stored) {
    $("#admin-key").value = stored;
    $("#key-state").textContent = "Saved on device";
  }

  try {
    await loadDevotions();
  } catch (error) {
    setStatus($("#analyze-status"), error.message, "error");
  }

  renderLanguages([]);

  $("#analyze-button").addEventListener("click", analyze);
  $("#publish-button").addEventListener("click", publish);
  $("#translate-button").addEventListener("click", translateLanguage);
  $("#add-another-button").addEventListener("click", resetForm);
  $("#admin-key").addEventListener("change", saveKeyIfNeeded);
  $("#remember-key").addEventListener("change", saveKeyIfNeeded);

  $("#title").addEventListener("input", () => {
    if (!$("#id").dataset.edited) $("#id").value = slugify($("#title").value);
    updatePreview();
  });
  $("#id").addEventListener("input", () => {
    $("#id").dataset.edited = "true";
    updatePreview();
  });

  $("#review-panel").addEventListener("input", (event) => {
    if (event.target.id !== "title" && event.target.id !== "id") updatePreview();
  });
  $("#review-panel").addEventListener("change", updatePreview);
  $("#language-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-language]");
    if (!button) return;
    const draft = collectDraft();
    renderLanguages(draft.languages.filter((language) => language.code !== button.dataset.removeLanguage));
    updatePreview();
  });
}

init();
