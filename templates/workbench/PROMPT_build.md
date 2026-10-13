# Build mode

Read plan/progress.md first, then plan/IMPLEMENTATION_PLAN.md. Pick the single most important open task.
Start its branch: `git switch -c task/<n>-<slug>` (n = the task's number in the plan, slug = a few words). A task branch starts from main.
While the previous task still waits for the designer's yes, start the next task from the previous task's branch instead, and say so in plan/progress.md.
Use the build-page skill (.claude/skills/build-page). Implement only that task.
Write the task's entry in plan/progress.md (date, task, the check you are about to run: `npm run check:task -- <the screens this task built>`); the line names the task, not a commit hash (git log has the hash).
Then run `npm run check:task -- <the screens this task built>` for a screen task (parity must not skip them; the flow is done only when `npm run check` passes, parity for every flow screen). Fix what fails. A value you need is not a token → NEEDS-TOKEN in plan/progress.md, ask.
Before the commit of every new or changed component, run `npm run build-storybook && npm run check:component -- <Name>`: it compares the component's stories with the app's capture, before a whole screen exists. Fix each real difference; one the story's own container causes (the line says why: "may be the story's container", "fills its container in both", "in the app it fills its container; the story shows it alone") goes into plan/progress.md. A `~` line is a story in a state no capture holds (it looks like another element of the app): not a failure; NEEDS-STATE in plan/progress.md when that state matters.
When every gate of check:task passes, mark the task done in the plan and add the last line of the check and the NEEDS-* found to the entry: plan/progress.md is updated BEFORE the commit.
Then commit once, with a message naming the task: plan/progress.md is committed with it. One commit per task.
Merge the branch into main only after the designer says yes (never push, deploy or publish without it).
