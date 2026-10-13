# ds-from-app — design

Date: 2026-10-12 · Status: draft for review · Author: Claude (Opus) with Dima

A Claude Code plugin: **live app → tokens → a test flow on them → Storybook → a repo with the Workbench harness**.
It's built from the tested core of `ds-extract-method` (@`ebaa66f`), shaped like the `prototype-storybook`
plugin (0.1.2), and its output repo follows the "Workbench" process from
[design-process-help](https://eleken-git.github.io/design-process-help/harness/).

---

## 0. Why, and for whom

**What Dima said:**
- `ds-extract-method` is "too big, with a lot of unnecessary detail";
- what's needed: extract tokens from a live app, build a test flow, put together a Storybook, and set up the harness and
  process "as in design-process-help";
- the users are **Eleken designers** (often without coding experience);
- the test flow is **first a check, then new work**: rebuild one real flow, compare it with production, then keep working
  in the same repo by the Workbench process;
- pilot: **a client's two-screen prototype** (its materials are kept private, out of this repository);
- packaging: **a new plugin** (approach A), name `ds-from-app`;
- styles: **plain CSS with variables**, not Tailwind (reasoning in §3);
- implementation: Opus orchestrates, mechanical work can go to cheaper models without losing quality.

**Assumptions (not Dima's words, accepted in the conversation without objection):**
- for the first pilot, the client's prototype counts as the "live app"; we capture its option page directly, because
  the root page is a wrapper with the option inside a frame;
- `ds-extract-method` stays an archive and isn't touched (it has 2 unpushed commits; Dima decides what to do with them).

**What success looks like:** a designer types one command, makes decisions at four points, and ends up with a
repo where the flow matches production within tolerance, every component has a story, and further work goes through the
Workbench cycle "plan → one task → gates → commit".

---

## 1. What's in the plugin

```
ds-from-app/
├── .claude-plugin/            plugin.json, marketplace.json
├── commands/ds-from-app.md    /ds-from-app <link> | /ds-from-app continue
├── skills/ds-from-app/
│   ├── SKILL.md               process + 8 rules, ≤ 1,500 words
│   └── references/            capture.md · tokens.md · flow.md · storybook.md (one per step)
├── scripts/                   extraction — runs from the plugin
│   ├── preflight.mjs          Node, Chrome, disk: what's missing and the exact fix command
│   ├── capture.mjs            ← walk_live.mjs
│   ├── tokens.mjs             ← captures_to_canon.mjs
│   ├── inventory.mjs          ← inventory_seed.mjs
│   ├── flows.mjs              ← map_flows.mjs
│   ├── checkpoint.mjs         ← prototype-storybook/scripts/checkpoint.mjs (adapted, with a note on the source)
│   ├── scaffold.mjs           creates the Workbench repo + the flow description from the captures
│   └── lib/                   color, safety, session (← ds-extract-method/scripts/lib)
├── templates/workbench/       the permanent part of the Workbench + Storybook + tools/ (gates)
└── selftest/                  a synthetic app with a known answer and traps
```

**The boundary between plugin and repo:** *the plugin extracts; the repo checks itself.* The gates (§4) live in the
repo's `tools/` (copied by `scaffold`), because a developer who clones the repo doesn't have the plugin, and the gates
have to run on GitHub as well. The Storybook maker does the same.

**Moved over, not rewritten.** Every script comes with its trap from `ds-extract-method` (`selftest_platform`,
`fixtures/`). A trap the script doesn't catch = the move isn't done.

**What stays only in `ds-extract-method`:** the Figma track (9 scripts), `research/`, `HISTORY.md`, `EVIDENCE-STATUS.md`,
scoring (`score_pilot`), `release_check`, `library_roles`/`library_theme`, `platform_drift`, `canon_diff`,
`component_tokens`, the Tailwind kit with `build_kit`/`verify_kit`/`dead_classes`, `states_gallery`.

### 8 rules (the essence of the method, one page instead of METHOD + RUN + CLAUDE)

1. Every value carries a label: `measured`, `derived` or `decided`; plus `not-reached`, which does not mean "absent".
2. The app's own names come first. A name is proposed only where none exists; the designer approves it at the checkpoint.
3. Read-only in the app: forms aren't submitted, nothing that changes data gets clicked, sign-in is by hand.
4. Absence is not proven by an empty search: first a counterexample the tool is required to catch.
5. States are produced (hover, focus, pressed), never guessed.
6. The set is closed: only tokens. A missing token = `NEEDS-TOKEN` in the plan, not an invented value.
7. Prototype-only parts stay out (role switchers, demo toggles, debug panels).
8. One flow is reproduced before the tokens are trusted.

**Language:** everything the designer sees (chat, checkpoint page, README) is in their language, in plain words.
Files for the agent (`SKILL.md`, `AGENTS.md`, `PROMPT_*`, scripts) are in English.

---

## 2. What the designer goes through

`/ds-from-app https://app.example.com`. The designer makes decisions at the ✋ points; the rest is Claude.

| # | Step | What happens | Result |
|---|---|---|---|
| 0 | Preparation ✋ | `preflight`; questions: is sign-in needed (by hand in a browser window, session only on this computer), is there a dark theme, where to create the repo | a session file outside the repo |
| 1 | Capturing screens | `flows` finds the screens and transitions read-only; `capture` captures each screen: picture, computed values, states | `extraction/baseline/`, report "captured N, didn't open M, why" |
| 2 | Tokens and components | `tokens` → list with labels and evidence; `inventory` → draft components | `tokens.json`, `components.draft.json` |
| 3 | Checkpoint ✋ | browser page: token swatches (where used, how often), names (proposed marked), components with pictures, likely prototype-only parts, **choice of the test flow** | `decisions.json` |
| 4 | Workbench repo | `scaffold`: tokens → `src/tokens/*.css`, harness files, `specs/pages/<flow>.md` from the captures, Storybook, gates, first commit | the repo |
| 5 | Test flow ✋ | `PROMPT_plan` → plan, the designer says OK; then `PROMPT_build`: one task = component + story → gates → commit → `progress.md` | the flow, task by task |
| 6 | Acceptance ✋ | side by side: production / ours; list of what matches, what doesn't and why, `NEEDS-TOKEN`, unreached states | ordinary Workbench work continues |

---

## 3. The repo the designer gets

```
<product>-workbench/
├── AGENTS.md, CLAUDE.md (one line @AGENTS.md)
├── PROJECT.md           source: link, date, plugin version, scope
├── DESIGN.md            generated from tokens: what exists, what's missing, the "nothing outside the set" sentence
├── FRONTEND.md          the quality standard (Workbench template)
├── PROMPT_plan.md, PROMPT_build.md
├── specs/pages/<flow>.md, specs/features/
├── plan/IMPLEMENTATION_PLAN.md, plan/progress.md
├── extraction/          captured by the tool; not edited by hand
│   ├── baseline/        values + screenshots (the baseline for comparison)
│   ├── tokens.json      every token with label and evidence
│   ├── canon/decided.tokens.json   values a person approved: reason + date
│   ├── components.json, flows.json, decisions.json
│   └── GAPS.md
├── src/tokens/          colors.css, spacing.css, typography.css, radius.css … — generated
├── src/components/<Name>/  Name.tsx · Name.module.css · Name.stories.tsx · index.ts
├── src/screens/<screen>/
├── .storybook/          Foundations pages from tokens
├── tools/               gates (§4)
├── .claude/             settings.json (Stop hook) + Workbench skills: build-page, frontend-qa
├── tests/               similarity to production, screenshots, accessibility
└── .github/             PR template, CI "builds + gates"
```

Stack: React + Vite + TypeScript + CSS Modules + Storybook (versions: the current stable ones at build time,
checked against the documentation, not from memory). Layers as in the Workbench: `screens → components → tokens`.

**Why plain CSS, not Tailwind** (agreed with Dima):
1. Tailwind brings its own palette (the method measured: `@import "tailwindcss"` alone gives 419 theme values), and
   Claude writes `text-gray-500`, which gets past the ban on arbitrary values. Plain CSS has no palette of its own;
   the check requires `var()`.
2. v4 needs prefixes; with the pilot's names that's `text-text`, `bg-bg`, `border-border`. In CSS:
   `color: var(--text2)`.
3. Any app (plain CSS, Tailwind, MUI) produces the same layer: `src/tokens/*.css`.
4. The practice project in design-process-help is built the same way; the team knows it.

Backlog: if developers want it, a Tailwind file generated from the same `tokens.json`.

**Decisions in the structure:**
1. **Tokens are generated.** Each line carries a comment with its label and evidence, e.g. (format example,
   numbers illustrative) `--text2: #5e5e5e; /* measured · 214 elements · 9 screens */`. A new token goes through
   `canon/decided.tokens.json` with a reason, then regeneration. Otherwise the next capture overwrites hand edits.
2. **Story next to its component.** Storybook replaces the Workbench's `#/ui-kit`.
3. **Captures are evidence**; comparison and a future "the app has changed" run against them. The sign-in session
   is never in the repo (`.gitignore`).
4. **The repo is private.** Screenshots of a real app can contain people's data. Publishing only with the designer's yes,
   with a warning (as in the Storybook maker).

---

## 4. Gates and how we test the plugin

### Gates in the repo

| # | Gate | Catches | When |
|---|---|---|---|
| 1 | `lint` (eslint + jsx-a11y) | `div` instead of a button, missing `alt` | Stop hook |
| 2 | only tokens (stylelint `declaration-strict-value` + inline-style check in TSX) | raw `#5E5E5E`, `13px`, radius without a variable | Stop hook |
| 3 | `typecheck` | types and props | Stop hook |
| 4 | `build` | the project and Storybook build | end of task |
| 5 | stories (Storybook + vitest + a11y addon) | component without a story; story doesn't open; accessibility errors | end of task |
| 6 | similarity to production (`tools/parity` ← `prototype_parity.mjs`) | flow screens vs captures: texts, transitions, position (± few px), colours (OKLab ≤ 0.02) | end of task |
| 7 | token integrity | `src/tokens/*.css` edited by hand; token without a label; reference to a missing one | end of task |

Gate 6 runs against the **captures**, not the live app, so it works without sign-in and on GitHub.
The Workbench's "a mistake becomes a rule" goes into `AGENTS.md`: 2nd time, a line in the rules; 3rd time, a check.

### How we test the plugin itself

1. **Self-check** (`selftest/`): a synthetic app with a known answer. Traps: an `oklch()` colour, a radius via
   shorthand with `var()`, a theme switched by a class, a hidden state, a prototype-only switcher. Each moved script
   catches its own; if it doesn't, the run is invalid (rule 4).
2. **Every gate fails once on purpose:** hex in a style → gate 2; component without a story → gate 5; padding shifted
   by 2px → gate 6; hand edit to `src/tokens` → gate 7.
3. **Pilot on the client's prototype** (one option page). Facts about the source (read from the file, 2026-10-12): 36
   declared variables in `:root`; 30 of them are used via `var()`; 6 are not (`--i-bd --i-bg --i-ic --proto
   --proto-line --proto-text`). Screens switch on clicks within one address (JS state, 116 `data-a` actions); only
   a few pages open by link (`#std=…`, `#policy=…`, `#orgview=1`, `role=user`).
   Success criteria, **fixed before the run**:
   - all 36 are found under their own names; the 30 used get a role from usage (`measured`); the 6 unused are
     marked separately (`derived`), not as "missing";
   - the option switcher, Admin/User and `--proto-*` go to "prototype-only" at the checkpoint;
   - the Option 1 flow is rebuilt and passes all 7 gates;
   - scoring against the answer key (the source file) only **after** the result is committed; the harness and raw output are
     committed alongside the number.
4. **Cold run:** a fresh Sonnet session with only the plugin's `SKILL.md` runs the pilot from start to finish. This
   checks that the instructions are enough without Opus's context.

---

## 5. Where it lives, build order, rollout

- **Where:** `~/ds-from-app` → a private GitHub repo on Dima's account (pushing only with his yes) → after the pilot,
  `eleken-git`, the same plugin catalogue as `prototype-storybook`. Version `0.1.0`, `CHANGES.md`.
- **Size limit as a check:** `SKILL.md` ≤ 1,500 words; ≤ 10 scripts in `scripts/` (without `lib/`); every line in
  `AGENTS.md` has a reason. Anything that doesn't fit goes to the backlog.

| Stage | What | Who |
|---|---|---|
| 1 | skeleton, `preflight`, moving capture/tokens/inventory/flows with traps, `selftest` | Sonnet agents with exact tasks; Opus checks the self-check and diff |
| 2 | checkpoint page | Sonnet; Opus checks with real clicks (mouse coordinates) |
| 3 | Workbench template, `scaffold`, token generation, gates 1–3, 7 | rules — Opus; code — Sonnet; review — Opus |
| 4 | flow description from captures, `tools/parity`, Storybook + Foundations, gates 4–6 | same |
| 5 | pilot + every gate fails on purpose | Opus |
| 6 | cold run on Sonnet; final `SKILL.md`, README for designers | Sonnet runs, Opus reads the result |

Every agent prompt includes "DO NOT SPAWN SUBAGENTS"; every result is checked by Opus with tests or diff, not
by retelling.

---

## 6. Not in the first version

- an app behind sign-in (second pilot, Pulse);
- a Figma file as source;
- a Tailwind file for developers;
- "the app has changed → update the repo";
- dark theme in the pilot (its app declares `color-scheme: light`).

## 7. Risks

1. **The pilot is a single-address app.** Screens are reached by clicks; `capture` refuses clicks that "could change
   something" (`lib/safety`). On a prototype nothing is saved, but the rules stay as they are; we only click tabs and
   navigation. If tabs are refused by mistake, that's a script defect: write it down and fix it with a trap, not with
   an "allow everything" flag.
2. **`walk_live.mjs` is 778 lines.** Moving it without rewriting means keeping the size; it can only be trimmed under
   the traps' protection.
3. **The checkpoint is code from someone else's plugin** (`prototype-storybook`, Eleken). It's adapted with a note on the
   source in the file and in `CHANGES.md`; if the author objects, we write our own.
4. **Gate 6 on a small prototype** may be either too lenient or too strict; tolerances are fixed before the run,
   and the reason for any change goes into `CHANGES.md`.
