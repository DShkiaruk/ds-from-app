# Capturing screens

## Where captures go
Always into the product repository: `<repo>/extraction/baseline/` — create it first (`scaffold.mjs init`). One capture
is `<screen>--<WxH>--<scheme>.json` plus `.png`. Screen names: name every screen by its heading or menu label in
kebab-case (`policies-management`), never by the file or the URL (`option-1`); the designer's language is fine. Default viewport `1440x900`.

## Read-only, always
- Both `capture.mjs` and `flows.mjs` block writes by default: every request that is not GET/HEAD/OPTIONS is blocked.
  `capture.mjs` also uses no real input by default: states come from forced pseudo-classes (hover, focus,
  focus-visible, active). `flows.mjs` presses every safe control with real clicks; with writes blocked, nothing it
  presses reaches the server as a write. WebSocket connections are refused too (a socket carries writes), and
  `--reads` does not apply to them. Both scripts end with `writes blocked: N — POST /graphql ×k, WEBSOCKET wss://… ×j`:
  read it. If widgets come back empty, the product reads through POST: name those reads with
  `--reads '<regex over the path>'`. Data read through a socket stays empty: tell the designer. Never lift the block to
  make data appear. `--socket-reads '<regex over the socket URL>'` lets a matching socket connect and counts the messages
  the page sends over it (`socket messages let through: N on ws://…`): same rule as `--reads` (only after the designer
  confirms it only reads), never for a product whose socket carries edits (collaborative editors, chat).
- A hosting platform's bot check (Vercel, Cloudflare) is let through: it changes no product data; the console says
  `hosting checks let through: N`. A page that stays a challenge means the platform refused the browser: tell the
  designer, and do not re-run against the live product in a loop (repeated runs are what trigger the check).
- `--allow-writes` (lifts the write block): only on a fixture or a sandbox the designer confirmed in words has nothing
  to break. Never on a real product.
- `--interact` (real input: focus, hover, press — it can submit a form): only on a fixture or a sandbox, as above.
  Never on a real product.
- Never `--allow-unsafe-click` or `--allow-reveal` on a real product. A refused click is reported: tell the designer
  what was refused and why.

## Sign-in
1. Start sign-in mode **in the background** and wait for it to exit (it waits up to 10 minutes for the designer):
   `node capture.mjs --login-url <sign-in url> --save-storage ~/.ds-from-app/sessions/<slug>.auth.json --until-url '<regex
   of the first screen after sign-in>'` — a browser window opens; the designer signs in by hand. Never type a password
   or a code for them. `<slug>` is in `extraction/capture-manifest.json`. Anchor `--until-url` on origin and path, e.g.
   `--until-url '^https://app\.example\.com/dashboard'`: an identity provider's address often carries the target in
   its query (`redirect_uri=…`), and an unanchored pattern matches it too early.
2. Every capture and `flows.mjs` run then takes `--storage ~/.ds-from-app/sessions/<slug>.auth.json`. The session file
   stays outside the repository.
3. `warning: this looks like a sign-in page` — look at the screenshot first. If it is the sign-in page, the session is
   missing or expired: stop, sign in again, and re-capture that screen (every capture after an expired session is of
   the sign-in page). A screen that really holds a password field (change password, an API key) is fine.

## Which screens
1. Capture the entry screen.
2. `node flows.mjs <repo> [--storage …]` — run it **in the background** and wait for it to exit: it presses every safe
   control in a fresh page and can take many minutes (split it with `--only <screen>`). It lists screens it reached
   that no capture holds (`reachable but not captured`). It also presses clickable rows that are not controls (a table
   row that opens a record), one per group of similar rows, and the controls inside a menu or dialog a press opens
   (one level); refused ones are listed, not pressed. A record view it reaches at the same address is reported by its
   heading: capture it with `--click '<selector of the row>' --as-screen`.
3. Capture those and run `flows.mjs` again. Stop when it names nothing new, or the designer says the rest is out of
   scope; write what was left out into your report.

## One address, many screens
When a menu swaps the page in place and the address does not change: capture each screen with
`--click '<selector of the menu item>' --as-screen --screen <name>` (several `--click`, in order, for nested menus). Map
it with `flows.mjs <repo>`: it now reports such screens itself, by the page heading (`pages reached at the same URL that
no capture holds`) — capture each one `--as-screen`. `--landmark '<css>'` replaces the heading as the text that tells
screens apart (the selected menu item, say). A menu item named like an action on data ("Order
Management") is refused; `--allow '<its exact name>'` lets it through only after the designer confirmed it only
navigates. When the first screen is itself a menu item, capture it with that menu click too
(`--click … --as-screen --screen <name>`), so flows.mjs knows it by its landmark; a plain capture of the address is then
not needed.

When `flows.mjs` prints `tab panels no capture holds`, capture each tab panel the flow needs with the command it
suggests (`--click '<the tab>' --screen <screen>--<tab>`); the build uses those captures instead of leaving the panel
empty with NEEDS-STATE.

## Dark theme
`tokens.mjs` says when a dark theme is declared but not captured. Capture with `--scheme dark`; for a theme switched by
a class or attribute on `<html>`: `--scheme dark --root-class dark` or `--root-attr data-theme=dark`.

## The machine
One capture at a time: each runs a browser, and on an 8 GB machine two in parallel next to other browsers can run out
of memory.

## Exit codes
`capture.mjs`: 0 captured · 2 navigation failed, a click refused, or sign-in mode not signed in after 10 minutes /
run without `--save-storage` · 3 nothing visible (wrong address, a sign-in wall, a blocked render) · 4 redirected to
another screen (the file is not written).
`flows.mjs`: 2 no captured screens yet (capture first) · 3 the session expired (sign in again).
