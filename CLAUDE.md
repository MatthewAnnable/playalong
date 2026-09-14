# playalong-starter — notes for Claude

## Life Organiser

This project is tracked in Matthew's Life Organiser under the slug `tab-play-along-app`.
The organiser, not this file, is the source of truth for where the project is
up to and what happens next.

At the START of a session, run `organiser project show tab-play-along-app` and read
"Where I am" and the next steps before doing anything else.

At the END of every session, before your final message, run
`organiser project update tab-play-along-app` with:

- `--done` for each next step you completed (matched on title, so close is fine)
- `--next` for each concrete next step that now exists (one action each,
  imperative, under 12 words)
- `--where` a two-sentence "where I am" paragraph in Matthew's voice
- `--log` a short summary of what was done and any decisions made

Then tell Matthew in one line what you changed in the organiser.

Never edit goals or other projects. If the `organiser` command isn't available,
print the update you would have made so Matthew can apply it by hand.

Matthew reviews these updates rather than approving them, so they apply
immediately. Keep "where I am" honest about what is and isn't finished.
