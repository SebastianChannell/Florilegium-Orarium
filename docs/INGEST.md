# Orarium mobile ingest

The private ingest screen lives at `/add/`. It turns a pasted prayer, hymn, or webpage URL into a reviewable Orarium Markdown entry and publishes the approved file directly to `content/` on `main`.

Orarium is deployed as a Cloudflare Worker with Static Assets. `wrangler.jsonc` serves `dist/` as the public site and routes `/api/*` through `src/worker.js`, which exposes the analyze and publish handlers.

## Workflow

1. Open `/add/` on the iPhone.
2. Paste prayer text or a webpage URL.
3. Tap **Prepare prayer**.
4. Review the generated title, id, type, devotion, search terms, and `LA` / `EN` / `SP` sections.
5. Generated translations are visibly marked **generated · review**. Source text is marked **source text**.
6. Tap **Publish to Orarium**.
7. The Git-integrated Worker deploys the resulting commit automatically. Existing GitHub translation automation continues to handle any missing Spanish body that was not included inline.

The page is intentionally absent from the public navigation and includes `noindex`. The APIs require a separate admin key.

## One-time Cloudflare Worker setup

After a deployment that includes `wrangler.jsonc` and `src/worker.js`, the Worker is no longer static-assets-only and its **Settings → Variables and Secrets** panel accepts runtime secrets.

Add these as encrypted runtime secrets:

- `ORARIUM_ADMIN_KEY` — a long random value used only to authorize `/add/` API calls.
- `GITHUB_TOKEN` — a fine-grained GitHub personal access token limited to `SebastianChannell/Florilegium-Orarium` with **Contents: Read and write**. Do not expose this token in browser code.
- `OPENAI_API_KEY` — an OpenAI Platform API key used by `/api/analyze`.

Optional runtime variables:

- `ORARIUM_INGEST_MODEL` — defaults to `gpt-5.6-terra`.
- `ORARIUM_GITHUB_REPO` — defaults to `SebastianChannell/Florilegium-Orarium`.
- `ORARIUM_GITHUB_BRANCH` — defaults to `main`.

For Workers Builds, use:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: repository root

After saving the secrets, redeploy the current production commit so the runtime receives them.

## Security model

`GITHUB_TOKEN` and `OPENAI_API_KEY` are only read by Worker runtime code. They are never returned to the browser. The iPhone may remember `ORARIUM_ADMIN_KEY` in local storage when **Remember on this device** is selected; uncheck it if the device is shared.

The publisher only creates new Markdown files. It refuses to overwrite an existing `content/<id>.md` file. The add screen also requires an existing devotion so a new entry cannot break the current Spanish devotion mapping.

Only publish source material that Sacrum Florilegium is permitted to reproduce.
