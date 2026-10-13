## Reboot safety
- [ ] Trace every enforcement path and OPPO/Android 10 incompatibility
- [ ] Replace parallel presentation paths with one fail-safe path
- [ ] Add persistent crash/relaunch auto-disable and user notice
- [ ] Verify Android compilation and inspect diagnostics

## Sleep to Rise block identity
- [ ] Show Sleep to Rise as the lock source in the ongoing notification
- [ ] Present the existing Java Sleep to Rise card for scheduled blocks, for 10 seconds
- [ ] Preserve the existing card design and verify the routing
- [x] Restore the three-file card structure: main selector, Sleep Guard card, Rise Guard card
- [x] Add two editable Java Rise scenes while preserving every existing scene
- [x] Let users select Sleep and Rise card artwork independently in Sleep to Rise

## Rise challenge flow
- [ ] Plan and implement the mission-page repair/redesign requested on October 13; verify setup, preview, and saved settings
- [ ] Fix clipped mission artwork and horizontal overflow; give each challenge its own composition
- [ ] Repair clock selection and editor return/save flow
- [ ] Redesign the ringing screen using the existing theme
- [x] Make every challenge setup page scroll on short phones
- [ ] Make back, controls, preview, and save work consistently
- [x] Use the real Math, Typing, Shake, Steps, QR/Barcode, and Photo challenge in preview
- [ ] Verify saved challenge settings reach the ringing alarm

## Rise redesign brief
- [x] Round clock-dial time picker with Life OS mark knob
- [x] Remove Difficulty/Tasks line from Wake-up Mission card
- [x] Rise home redesign (Promise card)
- [x] Mission screens: distinct animated visuals for all six (Preview opens the real challenge)
