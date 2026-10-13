# Tokens and the checkpoint

## Build
`node tokens.mjs <repo>` reads `extraction/baseline/*.json` and writes `extraction/tokens.json`. Its output is the first
finding — read it:
- `roles: …` — how many roles were read from where the app spends them (`measured`), how many `derived`;
- `left out N: …` — framework internals (`--tw-*`, `--radix-*`) and scoped properties: counted, not tokens;
- `derived N token(s) from painted values` — the app declares no token of that kind; the names (`surface-1`, `fg-2`,
  `spacing-16px`) are proposals the designer checks;
- `literals: …` — values painted outside the declared tokens (`lit-*`): findings, not decisions;
- `one colour scheme captured` / `a dark theme exists` — capture the dark scheme before the checkpoint.
- `$meta.platform.fonts` in tokens.json — the web fonts the app loads (font stylesheets, declared faces, faces in use); the Workbench loads them from the generated src/tokens/fonts.css.

## Labels
Every token: `$provenance.label` is `measured` (read from the app), `derived` (computed from what it paints) or
`decided` (a person). Its role has its own label: `$extensions["co.eleken.ds"].roleProvenance.label`. Never change a
label by hand.

## A value a person decides
Write it into `extraction/canon/decided.tokens.json`, then run `tokens.mjs` again:

```json
{ "color-warning": { "$type": "color", "$value": "#B45309",
  "$provenance": { "label": "decided", "evidence": "approved by <designer> 2026-10-12: the app has no warning colour" } } }
```

The evidence needs a date (`YYYY-MM-DD`) or the value is refused; a decision may not overwrite a measured token. Both
refusals are printed.

## Components
`node inventory.mjs <repo>` writes `extraction/components.draft.json`. A name a component library writes on the
element (shadcn `data-slot`, MUI, Chakra, Ant) is `measured`; the rest are named by role (`derived`). Layout
primitives are flagged and start unticked at the checkpoint.

## The checkpoint
1. `node checkpoint.mjs prepare <repo>` → `extraction/checkpoint.json`.
2. Look at the screenshots in `extraction/baseline/`. Then edit `checkpoint.json`:
   - `excluded`: `{ "id", "what", "why", "texts": [...] }` for every part that looks prototype-only — a role or "view as" switcher, a
     demo or screen-state toggle, a prototype toolbar, colours only those use. `what` says what it looks like, `why`
     why you think so — both in the designer's language. They start unticked. When the part has colours or values only it
     uses (a prototype toolbar's `--proto-*`), list their token ids in `tokens: [...]` — they are left out of the Workbench's
     CSS unless the designer puts the part back. `texts`: the visible words of the part exactly as the
     app shows them (button labels, tab names): the test flow's description and the similarity check then leave them
     out. When several prototype-only parts sit in one bar or panel, list the whole bar as one part — its texts and every
     token only it paints, `lit-*` colours included (`prepare` also adds, to a part that has `texts`, every `lit-*`/derived
     colour whose uses in all captures sit inside that part, noted "painted only inside this part"; the designer can
     still change it on the page). A bar at the top or a column at the left that is a part is cut out of the app's picture
     in compare.html and its size is allowed for in parity. A component candidate that IS such a part (the bar's nav): say so in
     the part's `why`; the designer unticks it.
   - `questions`: `{ "id", "text", "options": [...] }` — only what the designer can answer (whose screens these are;
     whether a screen is in scope).
   `prepare` keeps both when it runs again.
3. Start `node checkpoint.mjs serve <repo> --lang <uk|en>` **in the background** (the designer's language). Give the
   designer http://localhost:6020 and ask them to choose the test flow, check the proposed names, and press the
   button. Wait until the process exits; do not continue before. Port taken: it says which port to use instead.
4. Read `extraction/decisions.json`: `flow.screens` (in order) and `flow.name`; renamed tokens (`name` ≠ `id`);
   components with `include`; prototype-only parts put back (`include: true`); answers; the comment. Tell the
   designer in one or two lines what was decided. If `flow.screens` is empty, ask the designer which screens to start with (name them) before going on.

- Variables the app declares but nothing uses get their own groups on the page ("Declared, not used", one per name
  prefix): the screens cannot tell whether they are the product's or a prototype panel's. A prefix that names a
  prototype (proto, demo, mock, …) starts unticked. Tell the designer to decide them; an unticked group stays out of
  the Workbench.
