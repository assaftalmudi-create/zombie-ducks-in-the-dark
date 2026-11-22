# Zombie Ducks in the Dark

A nighttime headphone game in three acts: zombie ducks, flying junkie geese, and unemployed monkeys. Listen for an approach and throw toward it using the arrow keys or the three on-screen buttons. The first three ducks teach left, front, and right in a shuffled order. Pause with the on-screen button or the space bar.

[Play the game](https://assaftalmudi-create.github.io/zombie-ducks-in-the-dark/) · [Hear a one-minute stereo recording of gameplay](https://assaftalmudi-create.github.io/zombie-ducks-in-the-dark/docs/headphone-preview.mp3)

Serve the game over HTTP from the repository root with `python3 -m http.server 8000`, then open `http://localhost:8000`.

The game plays the recordings in stereo at a speed that varies with each duck. Each round starts partway into the recording so its loudest section lines up with the end of the approach. The game uses synthesized effects for the chase and retreat, and falls back to synthesized approaches if a recording fails to load.

The ball bounce is a trimmed, filtered mono excerpt of [rubber ball boucing on wall OWI.wav](https://freesound.org/people/1skyland/sounds/543176/) by 1skyland, released under CC0.

The binaural swamp bed was recorded in Fuki, Wakayama by [Robin Dupuy](https://robin-dupuy.com), via [Freesound](https://freesound.org/people/Robin_Dupuy/sounds/853181/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). An excerpt was filtered, level-adjusted, encoded for the web, and crossfaded in game.

Monkey calls are excerpts from [G12-21-Monkey Chattering.wav](https://freesound.org/people/craigsmith/sounds/437953/), digitized by Craig Smith and released under CC0.

The male narration was synthesized with Kokoro, edited phrase by phrase, and mastered in mono for placement in the game’s binaural scene. The preview is a stereo render of the game audio with a closing fade.
