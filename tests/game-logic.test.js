import test from "node:test";
import assert from "node:assert/strict";
import { createGame, pointsForRound, positionForEvent, seededRandom } from "../js/game-logic.js";

test("positionForEvent finds before, between, and after slots", () => {
  const timeline = [{ date: "1969-01-01" }, { date: "1982-01-01" }];
  assert.equal(positionForEvent(timeline, { date: "1956-01-01" }), 0);
  assert.equal(positionForEvent(timeline, { date: "1977-01-01" }), 1);
  assert.equal(positionForEvent(timeline, { date: "1991-01-01" }), 2);
});

test("seeded games are repeatable and do not duplicate dates", () => {
  const events = Array.from({ length: 40 }, (_, index) => ({
    id: `event-${index}`,
    date: `${1950 + index}-01-01`,
    artist: "Test",
    text: "Test event",
    featured: index % 2 === 0,
  }));
  const first = createGame(events, "a-shared-mix", 25);
  const second = createGame(events, "a-shared-mix", 25);
  assert.deepEqual(first, second);
  assert.equal(new Set([first.anchor, ...first.clues].map((event) => event.date)).size, 26);
});

test("the points scale descends from five to two", () => {
  assert.equal(pointsForRound(1), 5);
  assert.equal(pointsForRound(7), 4);
  assert.equal(pointsForRound(19), 3);
  assert.equal(pointsForRound(25), 2);
  assert.equal(seededRandom("same")(), seededRandom("same")());
});
