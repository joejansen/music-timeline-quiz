import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_MISSES,
  ROUND_COUNT,
  activeStreak,
  createGame,
  isOver,
  misses,
  normalizeStats,
  place,
  plainObject,
  previousDay,
  recordResult,
  resolvePlacement,
  restore,
  score,
  seededRandom,
  serialize,
  shareText,
  startState,
  validSlots,
} from "../js/game-logic.js";

const { events: realEvents } = JSON.parse(readFileSync(new URL("../data/events.json", import.meta.url), "utf8"));

const fakeEvents = Array.from({ length: 40 }, (_, index) => ({
  id: `event-${index}`,
  year: 1950 + index,
  artist: "Test",
  text: "Test event",
  featured: index % 2 === 0,
}));

const years = (...list) => list.map((year, index) => ({ id: `y${index}`, year }));

// Plays the next clue into a right (or deliberately wrong) slot.
function play(game, state, correct) {
  const { min, max } = validSlots(state.timeline, game.clues[state.results.length]);
  const wrong = min > 0 ? min - 1 : max + 1;
  return place(game, state, correct ? min : wrong);
}

test("validSlots finds before, between, and after slots", () => {
  const timeline = years(1969, 1982);
  assert.deepEqual(validSlots(timeline, { year: 1956 }), { min: 0, max: 0 });
  assert.deepEqual(validSlots(timeline, { year: 1977 }), { min: 1, max: 1 });
  assert.deepEqual(validSlots(timeline, { year: 1991 }), { min: 2, max: 2 });
});

test("an event may go on either side of others from the same year", () => {
  const timeline = years(1969, 1977, 1977, 1982);
  assert.deepEqual(validSlots(timeline, { year: 1977 }), { min: 1, max: 3 });
  for (const slot of [1, 2, 3]) assert.deepEqual(resolvePlacement(timeline, { year: 1977 }, slot), { correct: true, slot });
});

test("a wrong placement moves to the nearest valid slot", () => {
  const timeline = years(1969, 1977, 1977, 1982);
  assert.deepEqual(resolvePlacement(timeline, { year: 1977 }, 0), { correct: false, slot: 1 });
  assert.deepEqual(resolvePlacement(timeline, { year: 1977 }, 4), { correct: false, slot: 3 });
  assert.deepEqual(resolvePlacement(timeline, { year: 1990 }, 0), { correct: false, slot: 4 });
});

test("seeded games are repeatable and never repeat an event", () => {
  const first = createGame(fakeEvents, "a-shared-mix", 25);
  assert.deepEqual(first, createGame(fakeEvents, "a-shared-mix", 25));
  assert.notDeepEqual(first, createGame(fakeEvents, "another-mix", 25));
  assert.equal(first.clues.length, 25);
  assert.equal(new Set([first.anchor, ...first.clues].map((event) => event.id)).size, 26);
  assert.equal(seededRandom("same")(), seededRandom("same")());
});

test("createGame copes with fewer events than rounds", () => {
  const game = createGame(fakeEvents.slice(0, 4), "tiny", 25);
  assert.equal(game.clues.length, 3);
});

test("the timeline stays in year order whatever the player picks", () => {
  const game = createGame(realEvents, "ordering", ROUND_COUNT);
  let state = startState(game);
  const random = seededRandom("picks");
  while (state.results.length < game.clues.length) {
    state = place(game, state, Math.floor(random() * (state.timeline.length + 1))).state;
    assert.ok(state.timeline.every((event, index) => index === 0 || state.timeline[index - 1].year <= event.year));
  }
  assert.equal(state.timeline.length, game.clues.length + 1);
});

test("a run ends on the third miss", () => {
  const game = createGame(fakeEvents, "lives", 25);
  let state = startState(game);
  state = play(game, state, true).state;
  for (let miss = 1; miss <= MAX_MISSES; miss += 1) {
    assert.equal(isOver(game, state), false);
    const result = play(game, state, false);
    assert.equal(result.correct, false);
    state = result.state;
  }
  assert.equal(isOver(game, state), true);
  assert.equal(score(state), 1);
  assert.equal(misses(state), 3);
});

test("a run ends when every clue is placed", () => {
  const game = createGame(fakeEvents, "flawless", 25);
  let state = startState(game);
  while (!isOver(game, state)) state = play(game, state, true).state;
  assert.equal(score(state), 25);
  assert.equal(misses(state), 0);
});

test("a saved game restores to the same state", () => {
  const game = createGame(realEvents, "save-me", ROUND_COUNT);
  let state = startState(game);
  state = play(game, state, true).state;
  state = play(game, state, false).state;
  state = play(game, state, true).state;
  const saved = JSON.parse(JSON.stringify(serialize("save-me", state)));
  assert.deepEqual(restore(game, saved), state);
});

test("restore rejects saves that do not fit the game", () => {
  const game = createGame(fakeEvents, "strict", 25);
  const state = play(game, startState(game), true).state;
  const saved = serialize("strict", state);
  assert.equal(restore(game, null), null);
  assert.equal(restore(game, { seed: "strict" }), null);
  assert.equal(restore(game, { ...saved, timeline: [saved.timeline[0], saved.timeline[0]] }), null);
  assert.equal(restore(game, { ...saved, timeline: [saved.timeline[0], "gone"] }), null);
  assert.equal(restore(game, { ...saved, timeline: [...saved.timeline].reverse() }), null);
  assert.equal(restore(game, { ...saved, results: [true, true] }), null);
  for (const junk of ["abc", 5, true, [], { timeline: "x", results: [] }]) assert.equal(restore(game, junk), null);
});

test("restore accepts a finished run but nothing played past the third miss", () => {
  const game = createGame(fakeEvents, "ended", 25);
  let state = startState(game);
  for (let miss = 0; miss < MAX_MISSES; miss += 1) state = play(game, state, false).state;
  assert.deepEqual(restore(game, serialize("ended", state)), state);
  const beyond = play(game, state, true).state;
  assert.equal(restore(game, serialize("ended", beyond)), null);
});

test("corrupt stored values are treated as empty", () => {
  for (const junk of [null, undefined, "abc", 5, true, [1]]) assert.deepEqual(plainObject(junk), {});
  const slots = { daily: { seed: "x" } };
  assert.equal(plainObject(slots), slots);
  assert.deepEqual(normalizeStats("abc"), { played: 0, best: 0, streak: 0, maxStreak: 0, lastDaily: null });
  assert.deepEqual(normalizeStats({ played: "x", best: 7, streak: -1, lastDaily: 4 }), {
    played: 0, best: 7, streak: 0, maxStreak: 0, lastDaily: null,
  });
  assert.equal(recordResult({ played: "x" }, { score: 3 }).played, 1);
});

test("daily streaks grow on consecutive days and reset after a gap", () => {
  assert.equal(previousDay("2026-03-01"), "2026-02-28");
  let stats = recordResult(undefined, { score: 10, dailyDate: "2026-11-17" });
  assert.equal(stats.streak, 1);
  stats = recordResult(stats, { score: 14, dailyDate: "2026-11-18" });
  assert.deepEqual(stats, { played: 2, best: 14, streak: 2, maxStreak: 2, lastDaily: "2026-11-18" });
  stats = recordResult(stats, { score: 9, dailyDate: "2026-11-18" });
  assert.equal(stats.streak, 2, "finishing the same daily twice does not extend the streak");
  stats = recordResult(stats, { score: 20 });
  assert.equal(stats.streak, 2, "a non-daily mix leaves the streak alone");
  assert.equal(stats.best, 20);
  assert.equal(activeStreak(stats, "2026-11-19"), 2);
  assert.equal(activeStreak(stats, "2026-11-20"), 0);
  stats = recordResult(stats, { score: 3, dailyDate: "2026-11-21" });
  assert.equal(stats.streak, 1);
  assert.equal(stats.maxStreak, 2);
});

test("shareText summarises a run", () => {
  const text = shareText({ label: "2026-11-18", results: [true, false, true], total: 25, url: "https://example.test/" });
  assert.equal(text, "Trackback 2026-11-18 — 2/25\n🟩🟥🟩\nhttps://example.test/");
});

test("event data is well formed", () => {
  assert.ok(realEvents.length > ROUND_COUNT);
  assert.equal(new Set(realEvents.map((event) => event.id)).size, realEvents.length);
  for (const event of realEvents) {
    assert.ok(Number.isInteger(event.year) && event.year > 1800 && event.year < 2100, event.id);
    assert.ok(event.artist && event.text, event.id);
    assert.equal("date" in event, false, event.id);
  }
});
