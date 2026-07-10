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
  "date": "1997-05-21",
  "artist": "Artist or scene",
  "text": "The clue shown before a player places it.",
  "featured": true,
  "art": "A"
}
```

`date` controls order. `featured: true` gives an event twice the draw weight, which intentionally puts the requested artists and Britpop into more games while keeping every mix broad. The date stays hidden from the player until after placement.

The daily game is deterministic from the New York date. Add `?seed=anything-you-like` to share a specific mix, or choose **New mix** for a fresh one.

## Game rules

- A mix begins with one known timeline event and 25 hidden-date clues.
- Drag a clue to a labeled drop point (or click a drop point for keyboard/touch use), then confirm it.
- A correct first placement earns 5, 4, 3, or 2 points as the mix progresses. A missed clue earns no points and moves to the correct location.
