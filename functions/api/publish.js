import {
  draftToMarkdown,
  githubRequest,
  json,
  repoConfig,
  requireAdmin,
  utf8ToBase64,
} from "../../src/ingest-common.js";

async function githubError(response, fallback) {
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      const payload = JSON.parse(text);
      if (payload?.message) return payload.message;
    } catch {
      // Fall through to the status-based message below.
    }
  }

  return `${fallback} GitHub returned HTTP ${response.status}.`;
}

export async function onRequestPost({ request, env }) {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  try {
    const input = await request.json();
    const result = draftToMarkdown(input);
    if (!result.ok) return json({ error: result.errors.join(" "), errors: result.errors }, 400);

    const { draft, markdown } = result;
    const { branch, repo } = repoConfig(env);
    const path = `/contents/content/${encodeURIComponent(draft.id)}.md`;

    const existing = await githubRequest(env, `${path}?ref=${encodeURIComponent(branch)}`);
    if (existing.ok) {
      return json({ error: `A text with id “${draft.id}” already exists.` }, 409);
    }
    if (existing.status !== 404) {
      return json({ error: await githubError(existing, "Could not check the repository.") }, 502);
    }

    const created = await githubRequest(env, path, {
      method: "PUT",
      body: JSON.stringify({
        message: `Add ${draft.title} via Orarium ingest`,
        content: utf8ToBase64(markdown),
        branch,
      }),
    });
    if (!created.ok) {
      const status = created.status === 422 ? 409 : 502;
      return json({ error: await githubError(created, "GitHub rejected the new prayer.") }, status);
    }

    const payload = await created.json().catch(() => ({}));
    return json({
      ok: true,
      id: draft.id,
      path: `content/${draft.id}.md`,
      commit: payload?.commit?.sha || "",
      commitUrl: payload?.commit?.html_url || "",
      repo,
      branch,
      markdown,
    }, 201);
  } catch (error) {
    return json({ error: error?.message || "Could not publish this text." }, 400);
  }
}
