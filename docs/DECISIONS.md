# Design decisions — v0.4

- Browser-first, audio-only gameplay with stereo headphones.
- Use Web Audio PannerNode in HRTF mode from the outset.
- Arrow keys throw rubber balls; they do not move the listener.
- Correct throw within 8.5m startles duck; miss causes a chase and comic tickling game over.
- Conservative loudness and gentle, funny procedural sound palette.
- Deploy as static files on GitHub Pages, keeping the same URL for future versions.
