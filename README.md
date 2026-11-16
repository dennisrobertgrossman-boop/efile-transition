# GLITCH//ARCADE

Six cyberpunk stress-test games for the browser. In each one, something you
rely on is changed under you every 25 to 45 seconds. There is no build step and
there are no dependencies: open `index.html` to choose a game.

Common controls: Space, P or Escape pauses (in SYNC//PULSE only P or Escape,
because Space is the game button); M switches sound on or off. Three hits end a run, and
each change survived raises the score multiplier by one.

## 1. GLITCH//GRID (`grid.html`) – the arrows get rewired

Steer a runner across a grid, collect shards and grow a trail.

- **Cyan shard** – 10 points × multiplier; the trail grows by one.
- **Gold core** – 50 points × multiplier; disappears after a few seconds.
- **Green ring (stabiliser)** – restores normal controls until the next scramble.
- **Green cross** – restores one point of integrity.
- **Red ICE node, walls, own trail** – cost one point of integrity.
- Every 30–45 seconds each arrow is wired to a different direction. The new
  wiring is shown for about 4.5 seconds, then hidden. **ASSIST** keeps it visible.

## 2. CHROMA//LIE (`chroma.html`) – the rule gets rewritten

A colour word appears in some ink colour. Press the correct coloured button
before the timer runs out.

- Rule **INK** – press the colour the word is painted in.
- Rule **WORD** – press the colour the word spells out.
- Rule **NEITHER** (from the second rewrite) – press a colour that is neither.
- Every 25–40 seconds the rule changes and the coloured buttons swap places.
- Faster answers score more; the timer shortens as the level rises.

## 3. VERTIGO//DRIFT (`vertigo.html`) – the world gets rotated

Hold the arrows to glide around an arena, collect shards and avoid drones.

- Every 30–45 seconds the arena is rotated or mirrored; the arrows keep moving
  the runner in the arena's original directions.
- The yellow edge of the arena always marks where the UP arrow leads.
- A green ring sets the view straight again until the next shift.

## 4. ECHO//LOCK (`echo.html`) – the answer gets twisted

A memory test. A sequence of arrows is shown one at a time; enter it on the pad
before the timer runs out.

- Rule **ECHO** – same order. Rule **REVERSE** – last to first.
- Rule **OPPOSITE** – same order, but the opposite of each arrow.
- Rule **INVERT** (from the second rewrite) – last to first and opposite.
- Every 30–45 seconds the rule changes; a round in progress is discarded
  without penalty. Sequences grow from three to eight arrows.

## 5. PURGE//PROTOCOL (`purge.html`) – the target gets redefined

An attention test on a board of 16 cells. Nodes of four shapes and four colours
appear and fade. Tap or click the ones that match the purge order.

- Tapping a non-matching node, or letting a matching one fade, costs integrity.
- Every 25–40 seconds the order switches between a colour and a shape; from the
  second rewrite it may also be negative ("NOT PINK").
- Keyboard: `1234` / `QWER` / `ASDF` / `ZXCV` map to the four rows of cells.

## 6. SYNC//PULSE (`sync.html`) – the rhythm gets disrupted

A one-button timing test. A marker orbits a ring; tap, click or press Space,
Enter or an arrow while it is inside the bright zone. The white centre of the
zone scores double.

- Pressing outside the zone, or letting the marker pass through it, costs integrity.
- Every 25–40 seconds the orbit is disrupted: **REVERSED**, **OVERCLOCK**
  (40% faster), **BLACKOUT** (the marker is hidden near the zone) or **DRIFT**
  (the zone slides toward the marker).

## Publish on GitHub Pages

1. Repository **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and the `/ (root)` folder, then **Save**.

The game is then served at `https://<user>.github.io/<repository>/`.

## Files

- `index.html` – start page
- `grid.html`, `game.js` – GLITCH//GRID
- `chroma.html`, `chroma.js` – CHROMA//LIE
- `vertigo.html`, `vertigo.js` – VERTIGO//DRIFT
- `echo.html`, `echo.js` – ECHO//LOCK
- `purge.html`, `purge.js` – PURGE//PROTOCOL
- `sync.html`, `sync.js` – SYNC//PULSE
- `common.js` – helpers shared by games two to six
- `style.css` – shared layout and visual style
