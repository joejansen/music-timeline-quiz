export const ROUND_COUNT = 25;
export const MAX_MISSES = 3;

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

/* ---------- Placement ---------- */

// Events only carry a year, so an event may sit on either side of others from
// the same year. Every slot from `min` to `max` (inclusive) is a right answer.
export function validSlots(timeline, event) {
  let min = 0;
  let max = 0;
  for (const item of timeline) {
    if (item.year < event.year) min += 1;
    if (item.year <= event.year) max += 1;
  }
  return { min, max };
}

// A wrong pick is moved to the valid slot nearest to where the player put it.
export function resolvePlacement(timeline, event, slot) {
  const { min, max } = validSlots(timeline, event);
  const correct = slot >= min && slot <= max;
  return { correct, slot: correct ? slot : Math.min(Math.max(slot, min), max) };
}

/* ---------- Building a mix ---------- */

const weight = (event) => (event.featured ? 2 : 1);

export function createGame(events, seed, roundCount = ROUND_COUNT) {
  const random = seededRandom(seed);
  const pool = [...events];
  const picks = [];
  const count = Math.min(roundCount + 1, pool.length);

  while (picks.length < count) {
    const total = pool.reduce((sum, event) => sum + weight(event), 0);
    let cursor = random() * total;
    let index = pool.findIndex((event) => (cursor -= weight(event)) < 0);
    if (index === -1) index = pool.length - 1;
    picks.push(...pool.splice(index, 1));
  }

  const sorted = [...picks].sort((a, b) => a.year - b.year);
  const anchorMin = Math.max(1, Math.floor(sorted.length * 0.32));
  const anchorMax = Math.max(anchorMin + 1, Math.floor(sorted.length * 0.68));
  const anchor = sorted[Math.min(sorted.length - 1, anchorMin + Math.floor(random() * (anchorMax - anchorMin)))];
  const clues = shuffle(sorted.filter((event) => event.id !== anchor.id), random);

  return { anchor, clues };
}

/* ---------- Game state ---------- */

// state = { timeline: Event[] in year order, results: boolean[] one per clue played }

export function startState(game) {
  return { timeline: [game.anchor], results: [] };
}

export const score = (state) => state.results.filter(Boolean).length;
export const misses = (state) => state.results.length - score(state);

export function isOver(game, state) {
  return misses(state) >= MAX_MISSES || state.results.length >= game.clues.length;
}

export function place(game, state, slot) {
  const event = game.clues[state.results.length];
  const outcome = resolvePlacement(state.timeline, event, slot);
  const timeline = [...state.timeline];
  timeline.splice(outcome.slot, 0, event);
  return { ...outcome, event, state: { timeline, results: [...state.results, outcome.correct] } };
}

/* ---------- Save / restore ---------- */

// Anything read back from storage may be corrupt; treat non-objects as empty.
export function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function serialize(seed, state) {
  return { seed, timeline: state.timeline.map((event) => event.id), results: [...state.results] };
}

// Returns null when the save does not fit this game (edited data, corrupt storage).
export function restore(game, saved) {
  if (!saved || !Array.isArray(saved.timeline) || !Array.isArray(saved.results)) return null;
  if (saved.results.length > game.clues.length) return null;
  // A run stops at the third miss, so nothing can follow it.
  if (saved.results.slice(0, -1).filter((correct) => !correct).length >= MAX_MISSES) return null;
  const played = [game.anchor, ...game.clues.slice(0, saved.results.length)];
  const byId = new Map(played.map((event) => [event.id, event]));
  const ids = new Set(saved.timeline);
  if (ids.size !== played.length || saved.timeline.length !== played.length) return null;
  if (!saved.timeline.every((id) => byId.has(id))) return null;
  const timeline = saved.timeline.map((id) => byId.get(id));
  if (timeline.some((event, index) => index > 0 && timeline[index - 1].year > event.year)) return null;
  return { timeline, results: saved.results.map(Boolean) };
}

/* ---------- Stats ---------- */

export const EMPTY_STATS = { played: 0, best: 0, streak: 0, maxStreak: 0, lastDaily: null };

export function normalizeStats(raw) {
  const source = plainObject(raw);
  const stats = { ...EMPTY_STATS };
  for (const key of ["played", "best", "streak", "maxStreak"]) {
    if (Number.isInteger(source[key]) && source[key] >= 0) stats[key] = source[key];
  }
  if (typeof source.lastDaily === "string") stats.lastDaily = source.lastDaily;
  return stats;
}

export function previousDay(date) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

// `dailyDate` is the YYYY-MM-DD of a finished daily mix, or null for any other mix.
export function recordResult(stats, { score: points, dailyDate = null }) {
  const next = normalizeStats(stats);
  next.played += 1;
  next.best = Math.max(next.best, points);
  if (dailyDate && next.lastDaily !== dailyDate) {
    next.streak = next.lastDaily === previousDay(dailyDate) ? next.streak + 1 : 1;
    next.maxStreak = Math.max(next.maxStreak, next.streak);
    next.lastDaily = dailyDate;
  }
  return next;
}

// A streak is still alive if the last daily was finished today or yesterday.
export function activeStreak(stats, today) {
  return stats.lastDaily === today || stats.lastDaily === previousDay(today) ? stats.streak : 0;
}

export function shareText({ label, results, total, url }) {
  const marks = results.map((correct) => (correct ? "🟩" : "🟥"));
  const rows = [];
  for (let i = 0; i < marks.length; i += 10) rows.push(marks.slice(i, i + 10).join(""));
  return [`Trackback ${label} — ${results.filter(Boolean).length}/${total}`, ...rows, url].join("\n");
}
