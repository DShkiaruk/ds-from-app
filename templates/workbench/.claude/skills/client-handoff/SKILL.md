---
name: client-handoff
description: Prepare the handoff for the client — HANDOFF.md in the client's language, README.md's run section, .env.example. Use when the designer says the work goes to the client («готуй передачу», "prepare the handoff"). Never publishes, pushes or merges on its own.
---

# Handoff to the client

1. `npm run check` passes on main: paste its last line. If it does not, stop and say what fails (the frontend-qa
   skill). Never hand over a red Workbench.
2. HANDOFF.md, in the client's language (PROJECT.md says it; otherwise ask the designer), plain words, its sections:
   - what is in this repository: the screens built (src/screens), the components (Storybook), the tokens (src/tokens);
   - how to run it: `npm install`, `npm run dev`, `npm run storybook`, `npm run check`;
   - what was taken from the app and how: PROJECT.md (the app, the date), DESIGN.md (the tokens), and that every token
     says how it was obtained (measured, derived, decided);
   - what a person decided: extraction/canon/decided.tokens.json (who, when, why);
   - what is not covered: every NEEDS-* and APP-A11Y line of plan/progress.md, the states the capture never reached,
     what no gate checks (FRONTEND.md "by hand"), the differences extraction/compare.html still shows. List each one;
     never leave one out to make the handoff look finished.
3. README.md: its run section names only scripts package.json has.
4. .env.example: every variable the code reads (`import.meta.env.*`, `process.env.*`), with an empty value and a one-line
   comment. None → no file, and say so. Never copy a value from a real .env.
5. Show the designer the diff of HANDOFF.md, README.md and .env.example, and ask. Commit only after their yes, on a
   branch (`git switch -c handoff/<YYYY-MM-DD>`), merged after their yes. Never push, publish, send or deploy: the
   designer does that.
