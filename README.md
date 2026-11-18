# Trackback

A static music-history timeline game. Place each clue before, between, or after the known moments. A wrong placement is moved to its true chronological position, so the timeline becomes more useful as you play.

## Run locally

```bash
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). The app has no runtime dependency or build step.

## Deploy free

- **Vercel:** import this repository, select the default static-site settings, and deploy. `vercel.json` is included.
- **Netlify:** import this repository and deploy with the included `netlify.toml`; there is no build command.
- **GitHub Pages:** publish the repository root with GitHub Pages.

## Event data

All clues live in [`data/events.json`](./data/events.json). Each record has:

```json
{
  "id": "unique-slug",
  "year": 1997,
  "artist": "Artist or scene",
  "text": "The clue shown before a player places it.",
  "featured": true,
  "art": "A"
}
```

`year` controls order and is the only date the game knows: events from the same year are accepted on either side of each other. `featured: true` gives an event twice the draw weight. The year stays hidden until the clue is placed.

The daily mix is deterministic from the New York date. **New mix** starts a random one and puts its seed in the URL (`?seed=…`), so the link replays the same mix.

## Game rules

- A mix begins with one known event and up to 25 hidden-year clues.
- Drag a clue to a gap in the timeline (mouse or touch), or tap/click the gap, then **Lock it in**.
- A right placement scores a point. A wrong one costs a life and the card moves to its true position.
- The third miss ends the run. The score is the number of clues placed correctly.

## Saved on the device

Progress and stats live in `localStorage`; there is no server.

- `trackback-save-v2` — the in-progress or finished daily mix and the latest other mix, so a reload resumes.
- `trackback-stats-v1` — runs played, best score, and the daily streak (consecutive New York days with a finished daily mix).

## Tests

```bash
npm test
```
