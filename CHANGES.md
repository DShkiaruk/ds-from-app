# Changes

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
