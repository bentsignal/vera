# Next release: extra steps

One-off steps the next release needs on top of the normal flow in
[releasing.md](releasing.md). The `vera-release` skill requires working
through this file. Do every step in order, and check each one's **Verify**
before moving on. A step that fails or can't be done blocks the release; tell
Shawn instead of skipping it.

`pnpm release plan` lists these steps, and production builds and updates
refuse to run until `--next-release-done` confirms the ones due by then are
done. After the release, open a PR that removes the finished steps (leave
the heading and intro so the file stays in place for the next release).

Adding steps: any PR whose release needs something beyond `pnpm release`
adds a section here in that PR (see AGENTS.md → Releases).

## Dictation and "Talk to Vera" (next iOS store build)

**What:** The iOS binary gains the `audio` background mode (dictation keeps
listening in another app), a speech recognition usage string, and the
"Talk to Vera" App Shortcut. Over-the-air updates need nothing: binaries
without the native module show no microphone.

**When:** Submitting the next iOS store build to App Review (TestFlight's
Friends group or the App Store).

**Steps:** In App Store Connect → the build's review notes (TestFlight
"What to Test" / App Review Information → Notes), add: "Vera keeps the
microphone on in the background only while the user is dictating a message
(tap the microphone in a conversation's message field), so they can switch
apps mid-sentence. iOS shows the microphone indicator the whole time;
dictation stops when they tap Done or Cancel."

**Verify:** On the TestFlight build, the Shortcuts app lists "Talk to Vera"
under Vera, and running it opens the conversation with Vera dictating.
