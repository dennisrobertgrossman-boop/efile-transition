# GLITCH//GRID

A cyberpunk grid-runner stress test for the browser. Steer a runner with four
arrows, collect data shards, grow your trail — and every 30 to 45 seconds the
arrows are rewired to different directions.

## Play

Open `index.html` in any modern browser. There is no build step and there are
no dependencies.

| Input | Action |
| --- | --- |
| Arrow keys / W A S D | Steer (subject to the current wiring) |
| On-screen pad / swipe | Steer on touch devices |
| Space, P or Escape | Pause |
| M | Sound on / off |

## Rules

- **Cyan shard** – 10 points × multiplier; the trail grows by one.
- **Gold core** – 50 points × multiplier; disappears after a few seconds.
- **Green ring (stabiliser)** – restores normal controls until the next scramble.
- **Green cross** – restores one point of integrity.
- **Red ICE node, walls, own trail** – cost one point of integrity. Three hits end the run.
- Each scramble survived raises the score multiplier by one.
- The new wiring is shown for about 4.5 seconds after each scramble, then hidden.
  Turn **ASSIST** on in the main menu to keep it visible.

## Publish on GitHub Pages

1. Repository **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and the `/ (root)` folder, then **Save**.

The game is then served at `https://<user>.github.io/<repository>/`.

## Files

- `index.html` – markup
- `style.css` – layout and visual style
- `game.js` – game logic, rendering, input and audio
