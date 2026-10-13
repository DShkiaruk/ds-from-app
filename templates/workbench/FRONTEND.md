# FRONTEND.md — the quality standard

Seven gates (`npm run check` prints ten steps; the build step is "build, and the pages work"). Each rule names the gate that checks it. "By hand" means no gate checks it yet — look before saying done.

## Semantic HTML
- One `<h1>` per screen; headings in order. — by hand
- `<button>` for actions, `<a href>` for navigation, `<label>` for every field. — `npm run lint` (jsx-a11y)
- Lists are `<ul>/<ol>`, tables are `<table>` with `<th scope>`. — by hand
- Icons: the app's own SVGs from the captures (`svgs` in extraction/baseline/*.json) are the source; one Icon component holds them; a library icon only when it is the identical drawing. A drawing (an empty-state frame, an illustration, a divider: an SVG that is not an icon) comes from the captures' `drawings` and is reproduced as is (inline SVG in the component), never redrawn by eye. — by hand

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
- Every component shows the states the app has: default, hover, focus, pressed, disabled, plus empty / loading / error where the app has them; a state the app does not show is written as not-reached, never invented; the States story names each state (StateGrid). — States stories, by hand

## Maintainable code
- Types pass. — `npm run typecheck`
- Every component and screen has a story, titled by where it lives: `Components/<Name>`, `Screens/<screen>`, `Screens/<screen>/<Name>` for a component one screen uses. — `npm run check:stories`
- No component imports a screen; screens do not import each other. — by hand

## Clean build
- `npm run build` and `npm run build-storybook` pass with no error. — `npm run check`
- Every screen of the production build opens with no console error and no page error (warnings are listed, not failed). Why: an error in the console is a bug the designer cannot see. — `npm run check:pages`
- Every internal link (`<a href="#/…">`) goes to a screen that exists, never to the screen list or a 404. Why: a dead link in a prototype breaks the click-through. External links are listed, never fetched. — `npm run check:pages`

## Responsive
- No horizontal scroll at the widths the app was captured at (the viewports in extraction/baseline/*.json). Why: the Workbench must reproduce what the app showed. — `npm run check:pages`
- At the other widths of the harness (320, 375, 768, 1024, 1440, 1920 px) overflow is reported as "not captured in the app: its behaviour at N px is unknown", not failed. Why: the Workbench rebuilds the app first and must not invent a responsive design the app never showed; narrow widths are designed only when the designer asks, and then the captures at that width come first.
- Text that runs past the edge, or overlaps, at a width the app was captured at. — by hand, in the built prototype

## Performance
- Cumulative layout shift (CLS) at most 0.1 on every screen at 1440 px. Why: content that jumps while loading is unusable. — `npm run check:pages`
- Largest contentful paint (LCP) at most 2.5 s on every screen at 1440 px. — `npm run check:pages`
- Images of a screen weigh at most 1 MB in total (what the screen loads as `<img>` or CSS image). Why: the prototype opens from a link over any connection. — `npm run check:pages`
- Images the app draws as SVG come from the captures, inline; a photo or raster is compressed before it enters `public/` or `src/`. — by hand

## Browsers
- Gated: Chromium (the story tests, parity and check:pages all run in it). — `npm run check`
- Not gated: Safari and Firefox. Before handoff open the built prototype in Safari (`npm run build`, then `npm run preview`, open the address in Safari) and look at every screen of the flow. Why: `npx playwright install webkit` is not available offline, and Safari draws fonts, scrollbars and some CSS differently. — by hand

## SEO basics
- Every screen has a non-empty `<title>`, exactly one `<h1>`, and the page has `<html lang>`. — `npm run check:pages`
- A meta description in index.html, one sentence about the product. — by hand
- Links have text that says where they go (not "click here"); images that carry meaning have `alt`. — `npm run lint` (jsx-a11y) and by hand
- The prototype is not for search engines: do not add a sitemap or robots rules unless the designer asks. — by hand

The app's web fonts load from src/tokens/fonts.css (generated). Never add a font link or @font-face by hand; a missing font is NEEDS-FONT in plan/progress.md.
