# FRONTEND.md — the quality standard

Seven gates (`npm run check` prints ten steps). Each rule names the gate that checks it. "By hand" means no gate checks it yet — look before saying done.

## Semantic HTML
- One `<h1>` per screen; headings in order. — by hand
- `<button>` for actions, `<a href>` for navigation, `<label>` for every field. — `npm run lint` (jsx-a11y)
- Lists are `<ul>/<ol>`, tables are `<table>` with `<th scope>`. — by hand
- Icons: the app's own SVGs from the captures (`svgs` in extraction/baseline/*.json) are the source; one Icon component holds them; a library icon only when it is the identical drawing. — by hand

## Accessibility (WCAG 2.2 AA)
- Every story passes axe (contrast, names, roles). — `npm run test:stories`
- When a story fails the accessibility test because the APP itself does it (its colours fail contrast, which parity requires to match), exclude only the element the app fails on, so the rest of the story stays checked: `parameters: { a11y: { context: { exclude: [['<selector of that element>']] } } }`, with the comment `// the app itself: <what> — reported to the designer`; also write `APP-A11Y: <story>, <rule>, <what>` in plan/progress.md. Turn a rule off for the whole story (`parameters: { a11y: { config: { rules: [{ id: '<rule id>', enabled: false }] } } }`, same comment, same progress line) only when no element selector can single it out. Never turn the test off globally.
- Keyboard: every control reachable by Tab, focus visible (a States story shows focus). — by hand + States stories
- No information by colour alone. — by hand

## Tokens and styles
- Colours, sizes, radii, fonts, shadows, spacing come from src/tokens. — `npm run lint:css`, `npm run check:inline`; every `var(--name)` names a token or a custom property of the same file — `npm run check:vars`
- The token layer is exactly what the extraction produced. — `npm run check:tokens`

## Matching the app
- Screens of the test flow match the captures: text, controls, transitions, layout within tolerance. — `npm run parity`
- Side by side for the designer. — `npm run compare`

## States
- Every component shows the states the app has: default, hover, focus, pressed, disabled, plus empty / loading / error where the app has them; a state the app does not show is written as not-reached, never invented. — States stories, by hand

## Maintainable code
- Types pass. — `npm run typecheck`
- Every component and screen has a story. — `npm run check:stories`
- No component imports a screen; screens do not import each other. — by hand

## Clean build
- `npm run build` and `npm run build-storybook` pass with no error. — `npm run check`

## Responsive (not gated yet)
- The captures are desktop (1440×900). Narrow widths are designed only when the designer asks; then add captures at that width first.

The app's web fonts load from src/tokens/fonts.css (generated). Never add a font link or @font-face by hand; a missing font is NEEDS-FONT in plan/progress.md.
