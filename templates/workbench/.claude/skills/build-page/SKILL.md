---
name: build-page
description: Build one screen of the test flow (or one component) from specs/pages, on the extracted tokens only, with stories, and prove it with the gates and parity. Use for every build task in plan/IMPLEMENTATION_PLAN.md.
---

# Build one screen or component

1. Read AGENTS.md, DESIGN.md, the task in plan/IMPLEMENTATION_PLAN.md, its section in specs/pages/*.md, and look at the
   screen's screenshot in extraction/baseline/ (named in the spec).
2. Components first (folders and files ASCII, PascalCase: `Button/Button.tsx`): reuse src/components; a new one goes in src/screens/<screen>/ (or src/components/ when a second
   screen needs it) as <Name>.tsx + <Name>.module.css + <Name>.stories.tsx + index.ts.
   - Icons: the app's own SVGs from the captures (`svgs` in extraction/baseline/*.json) are the source; one Icon component holds them; a library icon only when it is the identical drawing. A drawing (an empty-state frame, an illustration, a divider: an SVG that is not an icon) comes from the captures' `drawings` and is reproduced as is (inline SVG in the component), never redrawn by eye.
   Docs page: every component gets one by itself (Storybook autodocs); it shows what you write in JSDoc, so write a one-line `/** … */`
   on the component (what it is, where the app uses it, which captured screen) and on each prop (what it does, the app's own name for it).
   A screen has no Docs page (.storybook/main.ts takes it off), so no JSDoc needed there.
   Stories: title `Components/<Name>` for a component in src/components; `Screens/<screen>/<Name>` for a component that lives in
   src/screens/<screen>/ (gate 5 checks the prefix); `Default` (args for every prop), one story per variant the app shows, and `States`
   drawn with `StateGrid` (src/foundations/StateGrid.tsx): each state with its name under it — default, hover, focus-visible,
   active (pressed), disabled, and the app's own (selected, open); a state with no `node` is shown as "not reached (NEEDS-STATE)"
   — use it for a state no capture reached, never an invented look, and write NEEDS-STATE in plan/progress.md if it matters.
   `parameters: { pseudo: pseudoStates() }` (from the same file) draws hover / focus-visible / active on the element inside the
   wrapper with that `id` (`{ name: 'hover', id: 'hover', node }`; ids `hover`, `focus-visible`, `active`) — only states its CSS styles.
   A composite component (a card holding a button, a select with a trigger) has its hover / focus / active style on an
   inner element, not on its root: with storybook-addon-pseudo-states 10.x each state takes a string or an array of CSS
   selectors, and only the elements they match get the state. Name that element: `pseudoStates('button')` (selects
   `#hover button`, `#focus-visible button`, `#active button`), or write the selector yourself for a wrapper of your own:
   `parameters: { pseudo: { hover: ['[data-pseudo="hover"] button'] } }` — or the component's own selector, never a
   prop added only for stories.
   A story that fails the accessibility test because the APP itself does it (its colours fail contrast, which parity requires to match), exclude only the element the app fails on, so the rest of the story stays checked: `parameters: { a11y: { context: { exclude: [['<selector of that element>']] } } }`, with the comment `// the app itself: <what> — reported to the designer`; also write `APP-A11Y: <story>, <rule>, <what>` in plan/progress.md. Turn a rule off for the whole story (`parameters: { a11y: { config: { rules: [{ id: '<rule id>', enabled: false }] } } }`, same comment, same progress line) only when no element selector can single it out. Never turn the test off globally.
3. Styles: CSS Modules, every colour/size/radius/font/shadow/spacing a `var(--…)` from src/tokens (Storybook → Foundations). Missing → NEEDS-TOKEN.
4. The screen: src/screens/<kebab-case-name>/<Screen>.tsx (ASCII folder and file names: Storybook's test runner skips
   stories in non-ASCII paths; `src/screens/overview/Overview.tsx`), registered in src/screens/index.ts under the
   captured name as the key (`'огляд': Overview`, the route #/огляд, which parity opens), with a story titled
   `Screens/<folder name>` (`Screens/overview`; gate 5 checks it) and no Docs page. Interface text exactly as the spec lists it.
   Build a navigation list inside `<nav>` as the app does.
   Transitions: a control that navigates goes to `#/<other screen>`; one that opens a menu or dialog opens it.
   Before a component's commit run `npm run build-storybook && npm run check:component -- <Name>` (`--story <id>` for one story): it compares every story's boxes, fonts, colours, padding and radius with the app's element of the same text (✗ lines, story→app, e.g. `width 126→244`). Fix real differences; a size the story's container causes (flagged) goes into plan/progress.md. It is not a gate, and it runs before a whole screen exists. A `~` line (a state no capture holds: the story looks like another element of the app) does not fail; write NEEDS-STATE when that state matters.
5. Run `npm run check:fast`, then `npm run parity`. Read every ✗ line; fix and re-run. `npm run compare` and look at the
   pair yourself before claiming a match. What the lines mean:
   - `missing interface text`: the app shows that text outside its data rows and the prototype does not. Add it.
     If it is a record (a program's name as a card heading, a person's name on a button), it is data: invent your own
     and list the original in `extraction/flows/data-text.json`, one entry per text with its reason:
     `{ "texts": [{ "text": "Acme Corp", "why": "a customer name" }], "patterns": [{ "pattern": "^\\d+ programs$", "why": "a count" }] }`.
     A prototype-only part's texts come from the checkpoint and are already left out; this file is for data only.
   - `DEAD`: the app's control opens, navigates or changes the page, and ours does nothing. Make it do the same kind of thing.
   - `off:`: position, size, colour or padding beyond the tolerance. Fix it with tokens, never with a literal.
   - `missing control`: parity cannot find the control. An icon-only control is found by `data-icon="<icon>"` (the
     name the spec's control line gives) on the icon inside it. A control with neither a name nor an icon is named in
     `extraction/flows/names.json`: per screen name and role, the names in the order the app's unnamed controls
     come, `{ "orders": { "combobox": ["Status"] } }`; parity then finds the control by that role and name.
6. For a screen task run `npm run check:task -- <the screens this task built>` (parity never skips them). `npm run check:task` passes (the flow is done only when `npm run check` passes) → update plan/progress.md BEFORE the commit (date, task, last line of the check, NEEDS-*; the line names the task, not a commit hash (git log has the hash)) → commit once, with plan/progress.md committed with it. One commit per task.

The app's web fonts load from src/tokens/fonts.css (generated). Never add a font link or @font-face by hand; a missing font is NEEDS-FONT in plan/progress.md.
