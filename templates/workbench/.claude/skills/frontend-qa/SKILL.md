---
name: frontend-qa
description: Run every gate and report to the designer in plain words, most important first, with the side-by-side pictures. Use before saying a task or the flow is done, or when the designer asks "is it ready?".
---

# Quality check for the designer

1. `npm run check` for the whole flow (`npm run check:task -- <the screens this task built>` for one task mid-flow: parity skips the screens not built yet, so it proves the task, not the flow). Keep its full output.
2. `npm run compare` → extraction/compare.html. Open the pairs yourself.
3. Report in the designer's language, plain words, most important first: what differs from the app (screen, element,
   what), what is missing (NEEDS-* in plan/progress.md), what is not checked by any gate (FRONTEND.md "by hand").
   Say what passed in one line. Paste the last line of `npm run check`.
4. Do not fix, commit, publish or merge anything during the check.
