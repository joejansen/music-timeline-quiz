export const ROUND_COUNT = 25;

export function hashSeed(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dateLabel(date) {
  return date.slice(0, 4);
}

export function positionForEvent(timeline, event) {
  return timeline.findIndex((item) => item.date > event.date) === -1
    ? timeline.length
    : timeline.findIndex((item) => item.date > event.date);
}

export function pointsForRound(round) {
  if (round <= 5) return 5;
  if (round <= 12) return 4;
  if (round <= 20) return 3;
  return 2;
}

function weightedPick(events, selected, usedDates, random) {
  const options = events.filter((event) => !selected.has(event.id) && !usedDates.has(event.date));
  const totalWeight = options.reduce((total, event) => total + (event.featured ? 2 : 1), 0);
  let cursor = random() * totalWeight;
  for (const event of options) {
    cursor -= event.featured ? 2 : 1;
    if (cursor <= 0) return event;
  }
  return options.at(-1);
}

export function createGame(events, seed, roundCount = ROUND_COUNT) {
  const random = seededRandom(seed);
  const selected = new Set();
  const usedDates = new Set();
  const picks = [];
  const uniqueCount = Math.min(roundCount + 1, events.length);

  while (picks.length < uniqueCount) {
    const event = weightedPick(events, selected, usedDates, random);
    if (!event) break;
    selected.add(event.id);
    if (!usedDates.has(event.date)) {
      picks.push(event);
      usedDates.add(event.date);
    }
  }

  const sorted = [...picks].sort((a, b) => a.date.localeCompare(b.date));
  const anchorMin = Math.max(1, Math.floor(sorted.length * 0.32));
  const anchorMax = Math.max(anchorMin + 1, Math.floor(sorted.length * 0.68));
  const anchorIndex = anchorMin + Math.floor(random() * (anchorMax - anchorMin));
  const anchor = sorted[anchorIndex];
  const clues = shuffle(sorted.filter((event) => event.id !== anchor.id), random);

  return { anchor, clues };
}
