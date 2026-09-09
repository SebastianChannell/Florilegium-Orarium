const DEFAULT_REPO = "SebastianChannell/Florilegium-Orarium";
const DEFAULT_BRANCH = "main";

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function requireAdmin(request, env) {
  const expected = String(env.ORARIUM_ADMIN_KEY || "");
  if (!expected) {
    return json({ error: "ORARIUM_ADMIN_KEY is not configured." }, 503);
  }

  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supplied || supplied !== expected) {
    return json({ error: "Unauthorized." }, 401);
  }

  return null;
}

export function normalizeInline(value = "") {
  return String(value).replace(/\r\n/g, "\n").trim();
}

export function oneLine(value = "") {
  return normalizeInline(value).replace(/\s+/g, " ");
}

export function slugify(value = "") {
  return oneLine(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function normalizeLanguages(input = []) {
  const allowed = new Set(["LA", "EN", "SP"]);
  const result = [];
  const seen = new Set();

  for (const language of Array.isArray(input) ? input : []) {
    const code = String(language?.code || "").toUpperCase();
    const text = normalizeInline(language?.text || "");
    if (!allowed.has(code) || !text || seen.has(code)) continue;
    seen.add(code);
    result.push({
      code,
      text,
      provenance: language?.provenance === "generated" ? "generated" : "source",
    });
  }

  const order = new Map([["LA", 0], ["EN", 1], ["SP", 2]]);
  return result.sort((a, b) => order.get(a.code) - order.get(b.code));
}

export function validateDraft(input = {}) {
  const id = slugify(input.id || input.title || "");
  const title = oneLine(input.title || "");
  const type = String(input.type || "").toLowerCase();
  const devotion = oneLine(input.devotion || "");
  const search = Array.isArray(input.search)
    ? input.search.map(oneLine).filter(Boolean).slice(0, 10)
    : oneLine(input.search || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 10);
  const languages = normalizeLanguages(input.languages);
  const sourceUrl = oneLine(input.sourceUrl || "");
  const sourceTitle = oneLine(input.sourceTitle || "");

  const errors = [];
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) errors.push("A valid id is required.");
  if (!title) errors.push("A title is required.");
  if (!new Set(["prayer", "hymn"]).has(type)) errors.push("Type must be prayer or hymn.");
  if (!devotion) errors.push("A devotion is required.");
  if (languages.length === 0) errors.push("At least one language text is required.");

  const codes = new Set(languages.map((language) => language.code));
  if (codes.has("SP") && !codes.has("EN")) {
    errors.push("Spanish text requires an English section in the current Orarium language model.");
  }

  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      if (!new Set(["https:", "http:"]).has(url.protocol)) throw new Error("bad protocol");
    } catch {
      errors.push("Source URL is not valid.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    draft: { id, title, type, devotion, search, languages, sourceUrl, sourceTitle },
  };
}

export function draftToMarkdown(input = {}) {
  const validation = validateDraft(input);
  if (!validation.ok) return validation;

  const { draft } = validation;
  const metadata = [
    "---",
    `id: ${draft.id}`,
    `title: ${draft.title}`,
    `type: ${draft.type}`,
    `devotion: ${draft.devotion}`,
  ];

  if (draft.search.length) metadata.push(`search: ${draft.search.join(", ")}`);
  if (draft.sourceUrl) metadata.push(`source: ${draft.sourceUrl}`);
  if (draft.sourceTitle) metadata.push(`source-title: ${draft.sourceTitle}`);

  const generated = draft.languages.filter((language) => language.provenance === "generated").map((language) => language.code);
  if (generated.length) {
    metadata.push(`generated-languages: ${generated.join(", ")}`);
    metadata.push("translation-review: required");
  }

  metadata.push("---", "");

  const body = draft.languages
    .map((language) => `## ${language.code}\n\n${language.text}`)
    .join("\n\n");

  return { ...validation, markdown: `${metadata.join("\n")}${body}\n` };
}

function githubConfig(env) {
  const repo = String(env.ORARIUM_GITHUB_REPO || DEFAULT_REPO);
  const branch = String(env.ORARIUM_GITHUB_BRANCH || DEFAULT_BRANCH);
  const token = String(env.GITHUB_TOKEN || "");
  return { repo, branch, token };
}

export async function githubRequest(env, path, options = {}) {
  const { repo, token } = githubConfig(env);
  if (!token) throw new Error("GITHUB_TOKEN is not configured.");

  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "Sacrum-Florilegium-Orarium",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  return response;
}

export function repoConfig(env) {
  return githubConfig(env);
}

export function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
