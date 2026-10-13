---
name: ds-from-app
description: Pull a design system out of a live web app — tokens that each say how they were obtained, components, screens and transitions — let the designer decide what goes in on a checkpoint page, then build a Workbench repository where one flow of the app is rebuilt and checked against it. Use when someone asks to extract tokens or a design system from a running app or site, or runs /ds-from-app.
argument-hint: "[https://… | continue]"
---

# Live app → tokens → checkpoint → Workbench

The people running this are Eleken designers, often without coding experience. Speak to them in their language, in
plain words. Files for agents stay in English.

## Input
What the designer typed after `/ds-from-app`:
- a link → start a new extraction (step 0);
- `continue`, or this folder holds `extraction/capture-manifest.json` → continue from the first step whose output is
  missing (extraction → checkpoint → Workbench → flow);
- nothing → ask the designer, in their language and plain words, for the link to the app.

## The rules (never bend these)

1. **Every value says how it was obtained**: `measured` (read from the app), `derived` (computed from what it paints),
   `decided` (a person, with a date). `not-reached` is not "absent".
2. **The app's own names first.** Propose a name only where the app has none; the designer approves it at the checkpoint.
3. **Read-only.** Never submit a form, never press what could change data, never type a password. The designer signs in by hand.
4. **Absence is not proven by an empty search.** Before saying "the app has no X", show the instrument catching a
   planted X (`npm run selftest`) or name what it cannot see.
5. **States are produced, never guessed** — forced hover / focus / active, or `not-reached`.
6. **The set is closed.** Nothing outside the extracted tokens; what is missing is `NEEDS-TOKEN` / `NEEDS-COMPONENT` /
   `NEEDS-STATE`, never an invented value.
7. **Prototype-only parts stay out** — role switchers, demo toggles, debug panels — unless the designer puts them back.
8. **Reproduce one flow before trusting the tokens.** Until the test flow is built, say the tokens are unchecked.

## Tools

All in `${CLAUDE_PLUGIN_ROOT}/scripts`, run with `node`. Once per machine: `node preflight.mjs` names what is missing
and the command that fixes it (usually `npm install --omit=dev --prefix "${CLAUDE_PLUGIN_ROOT}"`). `npm run selftest` in
`${CLAUDE_PLUGIN_ROOT}` proves the instruments still catch every planted shape — run it after any change to a script.

| Script | Does |
|---|---|
| `preflight.mjs` | Node, browser, git, disk — and the fix for each |
| `scaffold.mjs init <repo> --product "<Name>" --url <url>` | the product's repository, **before** any capture |
| `capture.mjs --url <url> --screen <name> --out <repo>/extraction/baseline [--storage <session>]` | one screen: every element's values, states, a screenshot |
| `flows.mjs <repo> [--storage <session>]` | every safe control pressed once: transitions, and screens not captured yet |
| `tokens.mjs <repo>` | captures → `extraction/tokens.json`, every token labelled |
| `inventory.mjs <repo>` | captures → `extraction/components.draft.json` |
| `checkpoint.mjs prepare\|serve <repo>` | the designer's decision page → `extraction/decisions.json` |
| `scaffold.mjs workbench <repo>` | the Workbench repository from the extraction and the decisions |

Both scripts block writes by default, so nothing either one does reaches the product's server as a write. `capture.mjs`
uses no real input by default (states come from forced pseudo-classes only); `flows.mjs` presses every safe control
with real clicks, and with writes blocked nothing it presses is sent as a write.
Never pass `--allow-writes` on a real product. Never pass `--interact` on a real product.

## Steps

### 0 · Prepare
1. `node preflight.mjs`; fix what it names, saying what you install.
2. Ask, in plain words: the link; does it need signing in, and whose account (a different role is a different
   system); is there a dark theme; where to keep the project (default `~/<product slug>-workbench`; the full path must be ASCII, no Cyrillic folder anywhere in it). If the app shows real
   people's data, say the screenshots will hold it and the repository stays private.
3. `node scaffold.mjs init <repo> --product "<Name>" --url <url>`.
4. Sign-in, when needed: [references/capture.md](references/capture.md) § Sign-in.

### 1 · Capture
Follow [references/capture.md](references/capture.md) (screen names: by heading or menu label). End with a short report: screens captured, which did not open
and why, what was refused and why.

### 2 · Tokens and components
`node tokens.mjs <repo>`, then `node inventory.mjs <repo>`; read [references/tokens.md](references/tokens.md). If
`tokens.mjs` says a dark theme exists and none was captured, capture it before going on.

### 3 · Checkpoint
[references/tokens.md](references/tokens.md) § The checkpoint. Never continue before the designer pressed the button.

### 4 · The Workbench
If git has no name/email, ask the designer for them — never invent one. Commit the extraction (on main):
`git add -A && git commit -m "Extraction: <N> screens, <M> tokens, the designer's decisions"`. Then
`node scaffold.mjs workbench <repo>`, and in the repo `npm install` and `npm run check:fast` (must pass on a fresh
Workbench). Commit "Workbench from the extraction" (on main), with package-lock.json. Tell the designer in two lines what is in
it — screens, how many tokens the app named itself and how many were proposed, what was left out as prototype-only —
and that the tokens stay unchecked until the flow is rebuilt. Details: [references/flow.md](references/flow.md) § The Workbench.
Then ask the designer to open Claude Code in `<repo>` (a new session there; trust the folder when asked) and say
«склади план» — the repo's own rules, checks and skills load only in a session started there.

### 5 · The test flow ✋
In the repo's session: follow PROMPT_plan.md: write plan/IMPLEMENTATION_PLAN.md, show it to the designer in plain words, wait
for their OK. Then, one task per session (AGENTS.md rule 10), PROMPT_build.md with the build-page skill, until `npm run check` passes —
including parity for every flow screen. Details: [references/flow.md](references/flow.md) § The loop and
[references/storybook.md](references/storybook.md).

### 6 · Acceptance ✋
`npm run compare` and show the designer extraction/compare.html: the app and the prototype side by side, what
matches, what differs and why, NEEDS-* (plan/progress.md), states not reached. The tokens are now checked (rule 8).
From here the repo is ordinary Workbench work: new screens by the same loop.

## Talking to the designer

- Plain words: "екран", "кнопка", "колір" — not "computed style", "CDP", "DOM".
- Say what you checked and how; say plainly what did not work.
- Ask only what the designer can answer; decide technical things yourself.
