# Florilegium Orarium

A small, distraction-free collection of prayers and hymns for Sacrum Florilegium.

The site is deliberately static: the texts live in this repository, the search runs in the browser, and Cloudflare Pages serves the generated files. There is no database, account, analytics script, or R2 dependency.

## Add a text

Create a Markdown file in `content/`. Keep the body as the prayer or hymn alone, without a translation or commentary.

```md
---
id: anima-christi
title: Anima Christi
type: prayer
language: Latin
aliases: Soul of Christ
keywords: communion, thanksgiving
---
Anima Christi, sanctifica me.
Corpus Christi, salva me.
```

Required fields:

- `id`: lowercase letters, numbers, and hyphens; it should match the filename
- `title`: the title shown in search results
- `type`: `prayer` or `hymn`
- `language`: for example `Latin`, `Greek`, `Greek · Transliteration`, or `Arabic`

`aliases` and `keywords` are optional comma-separated search terms. They help someone find a text without appearing on its reading page.

## Local use

```sh
npm run dev
```

Then open `http://localhost:4173`.

Run the checks with:

```sh
npm run check
```

## Cloudflare Pages

Connect this repository to Cloudflare Pages with:

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

No environment variables or storage bindings are required.
