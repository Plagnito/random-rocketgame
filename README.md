# Apogee

A little game for Random where a rocket has to climb as much as possible. One rocket, one sky, no ceiling: steer through birds, storm clouds, air traffic, meteors and dead satellites, catch fuel before the tanks run dry, ride the turbo rings, spell A·P·O·G·E·E, and spend your banked stars in the garage between flights.

## Play

- The rocket climbs on its own. Steer with **← / →** or **A / D** — on touch screens, drag anywhere on the sky.
- Hold **↑ / W / Space** to boost: around 60% more climb for nearly double the burn.
- **Fuel cells** refill 30%; **stars** bank upgrade money and a 3% sip; **repair kits** restore a hull plate.
- Storm clouds, birds, planes, meteors, asteroids and satellites each cost a plate. **White clouds are harmless.**
- **Turbo rings** give three seconds of free ×1.5 climb; **grazing** an obstacle (a *frisson*) grants 1.5% fuel.
- A dry tank is not the end: the rocket **glides**, and catching anything flammable **relights the engine**.
- Six golden letters — **A·P·O·G·E·E** — hide along the climb. The full word fills the tanks and shields the hull for four seconds.
- Between flights, the **garage** trades banked stars for a bigger tank, extra hull, better injectors and a pickup magnet; the **trophy shelf** tracks twelve achievements.
- **P** pauses. Altitude reached is the score.

The game works locally, and uses the Atlas Random v2 capabilities (progression, identity, leaderboard, achievements) when they are actually granted. Without them, everything — including trophies and garage purchases — falls back to `localStorage`.

The static game is ready to open from `index.html`; it has no server, API key, build step, or external asset dependency.

## Files

- `index.html` — page shell, HUD, home screen, modal and toast scaffolding
- `style.css` — the whole visual theme
- `app.js` — game loop, physics, spawner, wind, renderer, WebAudio sound, garage, trophies, Atlas bridge
- `random.json` — Random catalogue configuration (title, description, color, tags, declared capabilities and achievements)
