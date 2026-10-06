# Sleep to Rise card structure and artwork selection

## Goal
Restore the native block-card system to exactly three main Java files, keep the current Sleep and Rise artwork, add two Rise choices, and let the user choose Sleep and Rise artwork independently from Sleep to Rise settings.

## Implementation

1. **Make `NightToRiseBlockCard.java` the selector only**
   - Keep the public `Handles` contract and clock formatting used by existing callers.
   - Define stable artwork keys and validate unknown values back to each guard's default.
   - Route Sleep Guard to `NightToRiseSleepScenes.build(...)` and Rise Guard to `NightToRiseRiseScenes.build(...)`.
   - Remove references to the missing `NightToRiseSleepCard` and `NightToRiseRiseCard` classes.

2. **Make each Scenes file own its complete card**
   - `NightToRiseSleepScenes.java`: retain all four existing Sleep scenes and add the complete Sleep Guard card layout/build logic.
   - `NightToRiseRiseScenes.java`: retain the existing sunrise scene, add two clearly separated/editable Rise scenes, and add the complete Rise Guard card layout/build logic.
   - Keep drawing, palette, labels, buttons, countdown, and artwork comments beside the guard they belong to.
   - Preserve the existing `NightToRiseBlockCard.Handles` API so enforcement behavior is unchanged.

3. **Persist independent artwork choices**
   - Add `sleepCardTheme` and `riseCardTheme` to the Sleep to Rise settings model with safe defaults.
   - Save both values into Android preferences through the existing configuration sync.
   - Make every native Sleep to Rise card entry point read the correct stored choice for its phase.

4. **Add selection controls in Sleep to Rise**
   - Add a Sleep artwork selector inside Sleep Guard settings and a separate Rise artwork selector inside Rise Guard settings.
   - Show concise names and visual previews, clearly mark the selected artwork, and respect Strict Mode's settings lock.
   - Do not change blocking decisions, timings, allowlists, fonts, or the wider app theme.

5. **Verify and document**
   - Update the matching roadmap items only after completion.
   - Record the three-file ownership rule in `AGENTS.md`.
   - Run the web checks and Android compilation; inspect the latest build diagnostics.
   - Verify all native callers use the stored phase-specific artwork and that unknown/old values safely render the default card.

## Technical structure

```text
NightToRiseBlockCard.java
  ├─ Sleep phase → NightToRiseSleepScenes.build(context, sleepTheme)
  └─ Rise phase  → NightToRiseRiseScenes.build(context, riseTheme)

Sleep to Rise settings
  ├─ sleepCardTheme → Android preferences → Sleep Guard card
  └─ riseCardTheme  → Android preferences → Rise Guard card
```
