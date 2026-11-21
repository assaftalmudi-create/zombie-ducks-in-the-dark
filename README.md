# Zombie Ducks in the Dark

v0.26 ships with four original stereo duck approach recordings. Wear headphones and use the arrow keys or on-screen controls to throw in the direction you hear.

Serve the game over HTTP from the repository root with `python3 -m http.server 8000`, then open `http://localhost:8000`.

The game plays the recordings in stereo at their original speed. Each round starts partway into the recording so its loudest section lines up with the end of the approach. The game uses synthesized effects for the chase and retreat, and falls back to synthesized approaches if a recording fails to load.
