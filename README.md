# Apogee

A little game for Random where a rocket has to climb as much as possible. One rocket, one sky, no ceiling: steer through birds, storm clouds, air traffic, meteors and dead satellites, catch fuel cells before the tanks run dry, and push through four layers of atmosphere into deep orbit.

## Play

- The rocket climbs on its own. Steer with **← / →** or **A / D** — on touch screens, drag anywhere on the sky.
- Hold **↑ / W / Space** to boost: 60% more climb speed for nearly double the fuel burn.
- **Fuel cells** refill 30% of the tank; **stars** bank glory and a small sip of fuel. An empty tank ends the flight.
- Storm clouds, birds, planes, meteors, asteroids and satellites each cost a hull plate. You have three. White clouds are harmless.
- **P** pauses. The run ends on impact or empty tanks — altitude reached is the score.

The game works locally, and uses the Atlas Random v2 capabilities (progression, identity, leaderboard) when they are actually granted. Without them, everything falls back to `localStorage`.

The static game is ready to open from `index.html`; it has no server, API key, build step, or external asset dependency.

## Files

- `index.html` — page shell, HUD, home screen, modal and toast scaffolding
- `style.css` — the whole visual theme
- `app.js` — game loop, physics, spawner, renderer, WebAudio sound, Atlas bridge
- `random.json` — Random catalogue configuration (title, description, color, tags, declared capabilities)
