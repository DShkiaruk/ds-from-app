# Stories

- Folder and file names are ASCII: a screen folder in kebab-case (`src/screens/overview/`), a component in
  PascalCase. Storybook's test runner finds no tests in a story under a non-ASCII path (gate 5 fails on one). The key in
  `src/screens/index.ts` stays the captured screen name (`'огляд': Overview`), so the route `#/огляд` and parity still
  match; the story title may keep it (`Screens/огляд`).
- Title: `Components/<Name>` for components, `Screens/<screen name>` for screens; Foundations are generated.
- A component's stories: `Default` (args for every prop, so Controls work), one per variant the app shows, and
  `States` — the component drawn at rest and with `data-pseudo="hover" | "focus" | "active"`, with
  `parameters: { pseudo: { hover: ['[data-pseudo="hover"]'], focusVisible: ['[data-pseudo="focus"]'], active: ['[data-pseudo="active"]'] } }`.
  Only states the component's CSS styles and the app shows; a state the app does not show is written in the
  component's comment as not reached — never drawn.
- Layout around examples in a story may use inline styles; the component itself may not.
- Every story must pass the accessibility test (`npm run test:stories`): a control without a name fails it.
- When a story fails the accessibility test because the APP itself does it (its colours fail contrast, which parity requires to match), exclude only the element the app fails on, so the rest of the story stays checked: `parameters: { a11y: { context: { exclude: [['<selector of that element>']] } } }`, with the comment `// the app itself: <what> — reported to the designer`; also write `APP-A11Y: <story>, <rule>, <what>` in plan/progress.md. Turn a rule off for the whole story (`parameters: { a11y: { config: { rules: [{ id: '<rule id>', enabled: false }] } } }`, same comment, same progress line) only when no element selector can single it out. Never turn the test off globally.
- A screen's story renders the screen component; its data is the screen's own invented data.
