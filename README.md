# Florilegium Orarium

A small, distraction-free collection of prayers and hymns for Sacrum Florilegium.

The site is deliberately static: the texts live in this repository, the search runs in the browser, and Cloudflare Pages serves the generated files. There is no database, account, analytics script, or R2 dependency.

## Add a text

Create a Markdown file in `content/`. Keep the body as the prayer or hymn alone, without commentary. A normal entry contains one language; the bilingual Little Office pattern is described below.

```md
---
id: anima-christi
title: Anima Christi
type: prayer
devotion: Holy Eucharist
search: Soul of Christ, communion, thanksgiving
---
Anima Christi, sanctifica me.
Corpus Christi, salva me.
```

Required fields:

- `id`: lowercase letters, numbers, and hyphens; it should match the filename
- `title`: the title shown in the index and search results
- `type`: `prayer` or `hymn`
- `devotion`: one primary devotion that determines the text's section in the index

`search` is an optional comma-separated list for alternate titles, secondary devotions, and useful subjects. The title, primary devotion, and complete text are searched automatically, and the contents of `search` never appear on the reading page.

Begin each liturgical versicle and response on its own line with `V.` or `R.`. The reader automatically displays those markers in the established purple (`#8451CF`) for every current and future text; no HTML or other formatting is needed in the content file.

## Add a Little Office

A Little Office appears once in the devotional index and links to separate Hour pages. Its parent file has an ordered `children` list and no body:

```md
---
id: little-office-example
title: Little Office Example
type: prayer
devotion: Example Devotion
search: Matins, Prime, Vespers
children: little-office-example-matins, little-office-example-prime, little-office-example-vespers
---
```

Each child file uses the normal content pattern, plus `parent` and `hour`:

```md
---
id: little-office-example-matins
title: Little Office Example — Matins
type: prayer
devotion: Example Devotion
parent: little-office-example
hour: Matins
search: Matutinum
---
The complete text for Matins.
```

For a side-by-side Latin and English Hour, add `layout: parallel` and write its sections as two-column Markdown tables:

```md
---
id: little-office-example-matins
title: Little Office Example — Matins
type: prayer
devotion: Example Devotion
parent: little-office-example
hour: Matins
layout: parallel
---
## Hymnus — Hymn

| Latin | English |
|---|---|
| V. Deus in adjutorium meum intende. | V. O God, come to my assistance. |
| R. Domine, ad adjuvandum me festina. | R. O Lord, make haste to help me. |

| Latin | English |
|---|---|
| *A Septuagesima usque ad Pascha, loco Alleluia, dicitur:* | *From Septuagesima until Easter, instead of Alleluia, say:* |
```

The reader keeps both columns together on desktop and mobile. A heading separated by an em dash, such as `## Hymnus — Hymn`, is placed into matching Latin and English columns. Headings use the red, bold, italic Office hierarchy; named table headings such as `Absolutio` / `Absolution` are retained as paired subheadings.

Put recitation directions and seasonal rubrics in italics on both sides of the table, as in the example above. They render in liturgical red. `Ant.` labels and cross symbols receive the same red treatment automatically, while every line-opening `V.` and `R.` remains in the established purple (`#8451CF`). These rules are shared by every current and future bilingual Little Office Hour.

The build verifies both sides of every parent/child relationship. Hour pages remain directly linkable and searchable, but only their parent appears in the main index.

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
