const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const KEY_STORAGE = "orarium-admin-key";

const state = {
  devotions: [],
  sourceUrl: "",
  sourceTitle: "",
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

function setLanguage(code, language) {
  const textarea = $(`[data-language="${code}"]`);
  const provenance = $(`[data-provenance="${code}"]`);
  textarea.value = language?.text || "";
  provenance.value = language?.provenance === "generated" ? "generated" : "source";
  textarea.closest(".language-card").classList.toggle("is-empty", !textarea.value.trim());
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

  const byCode = new Map((draft.languages || []).map((language) => [language.code, language]));
  for (const code of ["LA", "EN", "SP"]) setLanguage(code, byCode.get(code));

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
  const languages = ["LA", "EN", "SP"].map((code) => ({
    code,
    text: $(`[data-language="${code}"]`).value.trim(),
    provenance: $(`[data-provenance="${code}"]`).value,
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
    const { draft } = await api("../api/analyze", { source, devotions: state.devotions });
    populateDraft(draft);
    setStatus(status, "Prepared. Review the text below before publishing.", "success");
  } catch (error) {
    setStatus(status, error.message, "error");
  } finally {
    setBusy(button, false, "Preparing…", "Prepare prayer");
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

  if (draft.languages.some((language) => language.code === "SP") && !draft.languages.some((language) => language.code === "EN")) {
    setStatus(status, "Keep an English section when publishing Spanish so the current Orarium build can display both correctly.", "error");
    return;
  }

  setBusy(button, true, "Publishing…", "Publish to Orarium");
  setStatus(status, "Creating the Markdown file on main…");
  try {
    const result = await api("../api/publish", draft);
    setStatus(status, `Published ${result.path}. Cloudflare and the Spanish review automation will pick up the commit automatically.`, "success");
    button.textContent = "Published ✓";
    button.disabled = true;
  } catch (error) {
    setStatus(status, error.message, "error");
    setBusy(button, false, "Publishing…", "Publish to Orarium");
  }
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

  $("#analyze-button").addEventListener("click", analyze);
  $("#publish-button").addEventListener("click", publish);
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

  for (const element of $$("#review-panel input, #review-panel textarea, #review-panel select")) {
    if (element.id === "title" || element.id === "id") continue;
    element.addEventListener("input", updatePreview);
    element.addEventListener("change", updatePreview);
  }
}

init();
