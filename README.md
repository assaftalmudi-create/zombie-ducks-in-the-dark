# Zombie Ducks in the Dark

v0.27 uses three directions (left, front, and right) and adds a nighttime soundscape of wind, rustling, and insects. Wear headphones and use the arrow keys or on-screen controls to throw in the direction you hear.

Serve the game over HTTP from the repository root with `python3 -m http.server 8000`, then open `http://localhost:8000`.

The game plays the recordings in stereo at their original speed. Each round starts partway into the recording so its loudest section lines up with the end of the approach. The game uses synthesized effects for the chase and retreat, and falls back to synthesized approaches if a recording fails to load.

The ball bounce is a trimmed, filtered mono excerpt of [rubber ball boucing on wall OWI.wav](https://freesound.org/people/1skyland/sounds/543176/) by 1skyland, released under CC0.
