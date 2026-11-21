# Zombie Ducks in the Dark

Listen for ducks approaching from the left, front, or right in a binaural nighttime swamp. Wear headphones and use the arrow keys or on-screen controls to throw in the direction you hear.

Serve the game over HTTP from the repository root with `python3 -m http.server 8000`, then open `http://localhost:8000`.

The game plays the recordings in stereo at a speed that varies with each duck. Each round starts partway into the recording so its loudest section lines up with the end of the approach. The game uses synthesized effects for the chase and retreat, and falls back to synthesized approaches if a recording fails to load.

The ball bounce is a trimmed, filtered mono excerpt of [rubber ball boucing on wall OWI.wav](https://freesound.org/people/1skyland/sounds/543176/) by 1skyland, released under CC0.

The binaural swamp bed was recorded in Fuki, Wakayama by [Robin Dupuy](https://robin-dupuy.com), via [Freesound](https://freesound.org/people/Robin_Dupuy/sounds/853181/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). An excerpt was filtered, level-adjusted, encoded for the web, and crossfaded in game.
