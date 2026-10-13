# The Workbench and the test flow

## The Workbench
- `node scaffold.mjs workbench <repo>` needs extraction/decisions.json (the checkpoint). It copies the Workbench
  (never overwriting a file), writes PROJECT.md, DESIGN.md, specs/pages/<flow>.md, and generates src/tokens.
- `npm install` in the repo (a few minutes the first time). No Google Chrome → `npx playwright install chromium`.
- `npm run check:fast` must pass before anything is built; `npm run parity` fails until the flow screens exist —
  that is expected, and proves the gate sees.
- Each flow screen lives at `#/<screen name>` (src/screens/index.ts maps the name to the component); parity opens it
  there. `extraction/flows/routes.json` is only for a screen that must open elsewhere (`{ "<screen name>": "#/…" }`).
- `npm run tokens` and `check:tokens` print `note:` lines for tokens left out because of the designer's exclusions (`<N> token(s) left out as prototype-only
  (the designer's decision): --a, --b`, then the tokens that referred to them) or the app's own broken references. Tell the designer once; notes never fail a gate.
- Commit the fresh Workbench before the first task.

## The loop (PROMPT_plan.md, PROMPT_build.md)
Run it in a Claude Code session opened IN the repo: its AGENTS.md rules, Stop hook and skills load only there.
1. Plan: one task per screen or per component. Show the plan to the designer; nothing is built before their OK.
2. Build one task (the build-page skill). `npm run check:fast` while working; `npm run parity` for the screen.
3. Read every ✗ line of parity: missing text, a DEAD control (the app's opens or navigates, ours does nothing),
   `off:` (position, size, colour, padding beyond tolerance). Fix and re-run. Look at `npm run compare` yourself.
   A control the app draws as an icon alone has no name to find it by: put `data-icon="<icon>"` (the name the spec's
   control line gives) on the icon inside it. If the app's control has neither a name nor an icon,
   `extraction/flows/names.json` gives the accessible name the kit chose: per screen name and role, the names in the
   order the app's unnamed controls come (`{ "orders": { "combobox": ["Status"] } }`); parity finds the control
   by that role and name.
4. A value that no token holds → `NEEDS-TOKEN: <what, where, the app's value>` in plan/progress.md and ask the
   designer. If they approve it, add it to extraction/canon/decided.tokens.json with their name and the date, then run `npm run tokens` (gate 7 refuses an undated one, or one that overrides a measured value). Never approximate with a nearby token silently.
5. Data in the app's tables and lists is data, not interface: invent plausible rows. If parity reports such text as
   missing, list it in extraction/flows/data-text.json (`{ "texts": ["…"], "patterns": ["…"] }`) with the reason.
   A prototype-only part's texts come from the checkpoint (`excluded[].texts`) and are already left out;
   data-text.json is for data only.
6. plan/progress.md updated → `npm run check:task` passes → commit (one task per session, on its own branch). The flow is
   done when `npm run check` passes.

## Acceptance
`npm run compare` → extraction/compare.html (the app's screenshot and the prototype's, per flow screen, with what
parity found). Tell the designer, plain words: what matches, what differs and why, what was missing (NEEDS-*),
which states could not be reached. Ask before publishing anything.
