# Changes

## 0.2.1 — 2026-10-14

- The first step asks for the test flow from start to end and the states it must show, and says what the tools reach
  by themselves (every safe control, tabs, rows, one level into menus and dialogs, hover / focus / pressed) and what
  they cannot (typed text, saving or deleting, deeper levels, a state the account's data does not have). START.md says
  the same to the designer, with a line for the states in the first message.

## 0.2.0 — 2026-10-14

Ready for other designers.
- **The checkpoint asks about variables the app declares but nothing uses** — the gap the 2nd cold run showed (C5):
  the prototype bar's `--proto`, `--proto-text`, `--proto-line` reached the Workbench. They now appear under
  "Declared, not used", one group per name prefix, ticked = into the project; a prefix that names a prototype (proto,
  demo, mock, …) starts unticked. Checked on the run's own data: with the page's defaults and a real Done, `--proto*`
  stayed out, `npm run check` 10/10, and score.mjs met C1–C6 (the run's own pre-registered result stays as scored).
- The checkpoint proposes an older extraction's dotted token names with `_` (as the token layer writes them), also
  when it re-opens decisions saved before 0.1.4; token names may hold `_`.
- README for designers: what is needed, installing and updating, the first run, the phrases of the Workbench loop,
  safety and data, what does not work yet, how long the cold runs took, where to report.

## 0.1.6 — 2026-10-14

From the end of the 2nd cold run:
- `check:component`: a width the app's container sets is a note, not a difference — the app's element fills its
  parent, and in the story it fills its own parent too or stands alone (a button the app stretches across a panel; a
  page section in a narrower story). An inner element of a component that stops filling its container (the pilot's
  126 px menu buttons inside the 244 px menu) is still a difference; checked by planting it again. On the 2nd cold
  run's Workbench: 16 differences → 3.
- The Workbench keeps `.env.example` in git (`!.env.example` after `.env*`): the handoff's `.env.example` was ignored.
- **Known, fixed in 0.2.0:** variables the app declares but never uses (the prototype bar's `--proto`, `--proto-text`,
  `--proto-line`) reach the Workbench unless the excluded part lists them; nothing paints them, so the checkpoint cannot
  tell they belong to the bar. The 2nd cold run did not list them (the 1st did). Next: the checkpoint asks the
  designer about declared-but-unused variables instead of passing them through.

## 0.1.5 — 2026-10-14

- A Workbench made before 0.1.4 updates without a decision: its extraction still holds token names with a dot
  (`text-12.5px`); the token layer writes them with `_` (`--text-12_5px`) and says so in a note, instead of failing the
  token gate. Found when the 2nd cold run updated its Workbench with `scaffold.mjs update`.

## 0.1.4 — 2026-10-14

- **The Workbench's CI checked on GitHub Actions** (a private repository with a synthetic Workbench, no client data).
  The first run failed: the build gate's page check counted a web-font stylesheet on another origin, out of the
  runner's reach, as the Workbench's error. Now a resource from another origin that does not load is a warning (the
  network, not the Workbench); a file of the build that is missing still fails. Green on GitHub after the fix;
  `actions/checkout` and `actions/setup-node` moved to v5 (v4 ran on a deprecated Node).
- **A hosting platform's bot check stops the tools.** On the live pilot prototype Vercel's Security Checkpoint refused
  the browser ("Failed to verify your browser, Code 21"), a visible Playwright window too. `capture.mjs` and
  `flows.mjs` now recognise such a page, stop (exit 3) and say the ways on: the site's owner turns the protection off
  for the run or allows this machine, or the designer gives a copy of the app's files. They never disguise the browser
  and never retry in a loop.
- **Token names are valid CSS names.** The plugin proposed `text-12.5px`; a dot is not a CSS name character, so the
  browser drops `--text-12.5px` and every `var()` of it (the 2nd cold run's gate 2 caught a use). Proposed font sizes
  are now `text-12_5px`; the checkpoint page refuses a dotted name until it is renamed; the token layer reports one.
- **AGENTS.md rule 2:** before NEEDS-TOKEN, search src/tokens for the value itself — the 2nd cold run asked for a
  16.8px line height that `--lit-leading-16_8` held.
- **Parity and a panel fixed to the window's bottom:** with the top band left out, such a panel runs the full height in
  the prototype; parity no longer expects its bottom 52 px higher (a false failure in the 2nd cold run).
- **The checkpoint page's server exits by itself after Done**, and SKILL.md now says so: the second cold run had
  stopped it with `pkill -f`, against the rule never to kill a process by name.

## 0.1.3 — 2026-10-14

The Workbench's Storybook, looked at page by page in the pilot and rebuilt to read like a design system:
- **Foundations/Overview** first: what the Workbench is, the app and the capture date, how to read measured / derived /
  decided, the structure; generated with the tokens.
- **Colours grouped by what they paint** (text, backgrounds, borders, icons and fills, not used directly), from the
  extraction's usage counts, as swatch tiles that still say how each value was obtained.
- **Text styles**: the combinations of family, size, weight, line height and letter spacing the app really uses, read
  from the captures, each with the app's own text as the specimen and the tokens that build it; then the scales.
  No names are invented for them (a person names them).
- No Controls on the Foundations pages, no repeated "purpose derived"; spacing, radius, shadows and borders drawn.
- **A Docs page for every component** (autodocs from its JSDoc: what it is, where the app uses it, each prop);
  screens and Foundations have none.
- **States named**: `StateGrid` draws each state with its name; a state no capture reached is named "not reached
  (NEEDS-STATE)", never drawn.
- **Structure checked** (gate 5): a story's title starts where its file lives — `Components/`, `Screens/<screen>`, a
  screen's own component under `Screens/<screen>/`. It caught 3 screen-local components filed under Components in
  each pilot.

Both pilot Workbenches were updated with `scaffold.mjs update`, their titles fixed and Button's states named:
`npm run check` 10 of 10 on each.

## 0.1.2 — 2026-10-14

The Workbench's harness, checked item by item against the Eleken harness (eleken-git.github.io/design-process-help/
harness), and what was missing added:
- **the pages work** (the harness's gates 6–9): the build step also opens every screen of the production build — no
  console error, every internal link goes to a screen (a link to a flow screen not built yet, or to a page of the app
  outside the flow, is a note), no horizontal scroll at the widths the app was captured at (other widths 320–1920 are
  reported, not failed: the Workbench does not invent a responsive design the app never showed), CLS ≤ 0.1,
  LCP ≤ 2.5 s, images ≤ 1 MB, a title, one h1, `lang`. `npm run check:pages`; the counts stay seven gates, ten steps;
- **client-handoff**, the harness's third skill: HANDOFF.md in the client's language, README's run section,
  .env.example; never pushes or publishes;
- FRONTEND.md has the harness's nine areas (performance, browsers and SEO basics added; responsive now gated as above);
  `test:a11y` and `test:e2e` name the story tests and the flow's parity in the harness's words; `public/`;
- `scaffold.mjs update <repo>` brings a Workbench made with an older plugin up to the template: the plugin's files
  are overwritten, the designer's (AGENTS.md, FRONTEND.md, specs, plan, src) never — a newer AGENTS.md / FRONTEND.md
  is written next to them to merge by hand; one commit to review;
- `check:component` (0.1.1 announced it, but the merge had lost it; restored): a story in a state no capture holds
  (it looks like another element of the app: the second tab selected) is a `~` note, not a failure; a size
  difference still fails.

The two pilot Workbenches were updated with `scaffold.mjs update` and pass `npm run check` (10 of 10). Their own last
items are fixed: the pilot's contrast exclusion now leaves out only the search box (the rule still checks the rest of
the story, and fails when the exclusion is removed), and the cold build's user initials take the app's 14 px line
height (the similarity check reports no difference). `check:component` on every component of both: 0 differ, and the
pilot's planted width defect is reported.

## 0.1.1 — 2026-10-14

The known limits of 0.1.0 that sit in the plugin, fixed, each with a test, and checked on the pilot's data where it
applies:
- `flows.mjs` presses clickable rows that are not controls (a table row with a click handler), one per group of similar
  rows, under the same name checks. On a local copy of the pilot's prototype it now reaches the policy page the 0.1.0
  run never saw.
- `flows.mjs` follows a press that opens a menu, a dialog or a drawer one level down: the controls inside are judged
  like the page's, unsafe ones are listed and not pressed, safe ones are pressed once (at most 12 per layer).
- `flows.mjs` lists the tab panels no capture holds, with the capture command for each, including tabs drawn without
  ARIA roles (a `tabs` class). On the pilot's prototype: Rules, Exceptions, Repositories.
- `capture.mjs` records outline and border line styles (a dashed focus ring), and the drawings a page holds (inline
  SVGs larger than an icon: markup, box, stroke, dash pattern), so a dashed empty-state frame can be reproduced as is.
- `--socket-reads '<regex>'` lets a socket that only reads connect, after the designer confirms; the console counts
  the messages the page sent over it.
- A hosting platform's bot check (Vercel, Cloudflare) goes through the write block. Found when the pilot's Vercel
  prototype answered repeated runs with a challenge that the block refused, leaving every screen blank.
- Parity and compare know a prototype-only column at the left as well as a bar at the top; compare.html crops the band
  out of the app's picture.
- The checkpoint adds to an excluded part every colour only that part paints, at rest or in a state. On the cold run's
  data it adds the one colour that run missed (`lit-222222`, a bar button's hover).
- `npm run check:component -- <Name>` compares a built Storybook story with the capture before a screen exists. On the
  pilot's Workbench it reports 0 differences, and it reports the defect the pilot found by hand (bottom menu buttons
  126 px wide instead of 244) when that defect is planted back. It is a tool the build loop runs, not a gate.

Not changed: the two items of 0.1.0's list that live in the pilots' own Workbenches, not in the plugin (an a11y rule
turned off for a whole story; the cold build's avatar initials line-height).

## 0.1.0 — 2026-10-13

Extraction half (Plan 1): the platform instruments of ds-extract-method @ebaa66f moved in under new names
(walk_live → capture, captures_to_canon → tokens, inventory_seed → inventory, map_flows → flows) with their planted
self-test; a browser launcher that uses the designer's own Chrome; an environment check; the product repository
created before any capture; the checkpoint page, adapted from prototype-storybook 0.1.2 (Eleken).

Workbench (Plan 2): `scaffold.mjs workbench` builds the product's Workbench repository from the extraction and the
designer's decisions; `tools/tokens-css.mjs` generates the tokens as CSS variables (src/tokens, with a
"do not edit" first line); the seven gates (`npm run check`, `check:fast`), the Stop hook that runs them, CI;
`parity` (the app against the prototype, per flow screen) and `compare` (extraction/compare.html); the harness files
(PROJECT.md, DESIGN.md, PROMPT_plan.md, PROMPT_build.md, specs/pages). The skill's steps 4–6 cover the Workbench,
the test-flow loop and acceptance.

Packaging: no `commands/`. A command named like the skill shadowed it, so `/ds-from-app` loaded the command and
SKILL.md never reached the model (found by a headless probe before the cold run). The skill is invoked as
`/ds-from-app` and handles its own input (a link, `continue`, nothing); `tests/plugin-layout.test.mjs` guards the
layout.

Pilot (Plan 3): the plugin ran end to end on a real product, a client's two-screen prototype, twice. The pilot's
materials (the answer key, the scorer, the journal, the runs' outputs) are kept private: they hold a copy of the
client's prototype.
- **Scores** (criteria fixed in a pre-registration before the first capture; scored once by a scorer after the
  outputs were committed):
  - the pilot: C1 36/36 declared variables found, C2 30/30 used ones measured, C3 6/6 unused ones derived,
    C5 prototype chrome excluded, C6 all gates passed. Pass: true. C4 (values equal to the source, 36/36) is reported,
    not a pass condition;
  - the cold run, a fresh Sonnet with the skill alone: the same scores, 36/36, 30/30, 6/6, C5 and C6
    met. Pass: true, with one help from the designer (the second menu screen; see same-address screens below).
  - What the number does not say: it holds for the plugin as fixed during the pilot, not as it stood before the pilot
    (39 plugin commits in between), and for the app's two menu screens, with the controller (Opus) as the designer.
    C4 covers the 36 declared variables only; the 40 derived tokens have no answer key, and gate 6 is their check.
- **What the pilot fixed**, one line per area:
  - exclusions: the flow spec and parity no longer demand the texts of an excluded prototype switcher;
  - URL routing: parity no longer sends URL screens to the screen list;
  - the top band: parity knows the prototype's own 52 px bar and leaves it out;
  - web fonts: the app's web fonts now reach the Workbench;
  - the command that shadowed the skill: removed, the skill takes the input itself;
  - `check:task`: one task is checked with its own command before its commit, `check` stays the flow's gate;
  - the layout of text-bearing elements: parity compares a wider set and pairs only elements whose boxes agree (R31b);
  - undefined variables: gate 2 now fails a `var(--name)` that names no token (check-vars), found by the cold run;
  - same-address screens: flows.mjs reads the page heading as its default landmark and reports the screens a menu
    swaps in place; screens are named by heading or menu label; icons come from the captured SVGs.
- **Known not to work yet** (from the pilot, the cold run and the final review):
  - rows that open a record are reported, not pressed;
  - unsafe controls behind menus or dialogs are not exercised one level down;
  - the dashed empty-state frame is not captured as a drawing, and the focus ring's line style is not captured;
  - the tab panels' content is unmeasured (left empty with NEEDS-STATE);
  - the pilot's Workbench turns an a11y rule off for a whole story (built before the element-level form was
    documented; the cold run used the element-level form);
  - compare.html shows the app's picture with the prototype bar in it (a line under the picture says so);
  - the cold run listed 3 of the 4 `lit-*` colours that only the prototype bar paints, so one unused colour reached the
    Workbench CSS (the instruction already says to list every one);
  - one real difference remains in the cold build: the avatar initials' line-height (14px in the app, normal in the
    prototype);
  - the similarity check leaves out a prototype bar at the top only; a prototype-only band on the left is not handled
    yet;
  - nothing compares a component with the capture before a screen exists: gates check lint, types, story render and
    a11y, and parity checks whole screens;
  - a product that reads its data through a WebSocket shows it empty in the captures: sockets are refused, and
    `--reads` covers HTTP only (the console line says so).

Final review, before the merge (the whole branch reviewed against the spec; fixed, each with a test):
- writes over a WebSocket are refused too, not only HTTP methods other than GET/HEAD/OPTIONS; a planted socket write
  reaches the fixture server with `--allow-writes` and not without it;
- `capture.mjs` and `flows.mjs` end with `writes blocked: N — …` when the block stopped anything;
- gate 2: a custom property must be built from tokens (`--pad: 13px` and `'--tone': 'red'` fail), and a colour in any
  inline style string fails, not only in colour-named properties;
- a planted hidden state (a class only a script toggles): the capture holds no reading of it and names that blind spot;
- the icon-only check knows `trash`, `trash-2`, `log-out`, `logout`, `sign-out`;
- parity: a mistyped `--require` fails like a mistyped `--only`, and a run that compared nothing no longer says the
  screens match;
- the Tailwind v4 spacing steps (`--spacing-4` from the product's `--spacing`) are labelled derived with proposed
  names: the method made them, and only a person decides;
- the Stop hook's heavy test runs the gates on a clean uncommitted change, so it passes because the gates pass;
- sign-in mode no longer leaves an empty `runs/` folder.
