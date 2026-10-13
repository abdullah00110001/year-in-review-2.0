# Architecture rules
- Rise mission setup and ringing must reuse the same challenge components and alarm-specific mission configuration, so previews cannot drift from saved alarms.
- Mission setup is a full-height portal inside the alarm dialog host with non-shrinking artwork, a scrollable content area and fixed actions, so small screens and dialog focus management remain usable.
