import {
  EMPTY_STATS,
  MAX_MISSES,
  ROUND_COUNT,
  activeStreak,
  createGame,
  isOver,
  misses,
  normalizeStats,
  place,
  plainObject,
  recordResult,
  restore,
  score,
  serialize,
  shareText,
  startState,
} from "./game-logic.js";

const $ = (selector) => document.querySelector(selector);

const ui = {
  clueArea: $("#clue-area"),
  clue: $("#clue-content"),
  status: $("#status"),
  timeline: $("#timeline"),
  mixLabel: $("#mix-label"),
  round: $("#round-stat"),
  score: $("#score-stat"),
  lives: $("#lives-stat"),
  dialog: $("#how-to-dialog"),
  help: $("#help-button"),
  closeHelp: $("#close-help"),
  start: $("#start-game"),
  newGame: $("#new-game-button"),
  template: $("#event-card-template"),
};

const SAVE_KEY = "trackback-save-v2";
const STATS_KEY = "trackback-stats-v1";
const INTRO_KEY = "trackback-intro-seen";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const stackedLayout = window.matchMedia("(max-width: 760px)");
const scrollBehavior = () => (reducedMotion.matches ? "auto" : "smooth");

let events = [];
// { seed, mode: "daily" | "practice", game, state, pendingSlot, recorded, lastId }
let session = null;
// Cleanup for the drag in progress, if any. A re-render replaces the card being dragged.
let cancelDrag = null;

/* ---------- Small helpers ---------- */

function readStore(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, quota). The game still plays; it just won't resume.
  }
}

function el(tag, { class: className, text, ...attributes } = {}, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function button(label, className, onClick) {
  const node = el("button", { class: className, type: "button", text: label });
  node.addEventListener("click", onClick);
  return node;
}

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function randomSeed() {
  const bytes = window.crypto.getRandomValues(new Uint8Array(5));
  return [...bytes].map((byte) => (byte % 36).toString(36)).join("");
}

function pageTop(node) {
  return node.getBoundingClientRect().top + window.scrollY;
}

function setStatus(text, tone = "") {
  ui.status.textContent = text;
  ui.status.className = `status ${tone}`.trim();
}

/* ---------- Session ---------- */

function startSession(seed, { fresh = false } = {}) {
  const mode = seed === todayDate() ? "daily" : "practice";
  const game = createGame(events, seed, ROUND_COUNT);
  const saved = plainObject(readStore(SAVE_KEY, {}))[mode];
  const restored = !fresh && saved?.seed === seed ? restore(game, saved) : null;
  session = {
    seed,
    mode,
    game,
    state: restored ?? startState(game),
    pendingSlot: null,
    recorded: Boolean(restored && saved.recorded),
    lastId: null,
  };
  const url = new URL(window.location.href);
  if (mode === "daily") url.searchParams.delete("seed");
  else url.searchParams.set("seed", seed);
  window.history.replaceState(null, "", url);
  setStatus("");
  render();
}

function save() {
  const saves = plainObject(readStore(SAVE_KEY, {}));
  saves[session.mode] = { ...serialize(session.seed, session.state), recorded: session.recorded };
  writeStore(SAVE_KEY, saves);
}

function recordFinish() {
  if (session.recorded) return;
  const dailyDate = session.mode === "daily" ? session.seed : null;
  writeStore(STATS_KEY, recordResult(readStore(STATS_KEY, null), { score: score(session.state), dailyDate }));
  session.recorded = true;
}

const currentClue = () => session.game.clues[session.state.results.length];

/* ---------- Cards ---------- */

function artClass(event) {
  const palette = ["art-coral", "art-violet", "art-blue", "art-green", "art-gold", "art-berry"];
  const number = [...event.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return palette[number % palette.length];
}

function eventCard(event) {
  const card = ui.template.content.firstElementChild.cloneNode(true);
  const art = card.querySelector(".event-art");
  art.classList.add(artClass(event));
  art.querySelector("span").textContent = event.art || event.artist.slice(0, 1);
  card.querySelector(".event-kicker").textContent = event.artist;
  card.querySelector(".event-text").textContent = event.text;
  return card;
}

/* ---------- Timeline ---------- */

function slotLabel(timeline, slot) {
  const before = timeline[slot - 1]?.year;
  const after = timeline[slot]?.year;
  if (before === undefined) return `Before ${after}`;
  if (after === undefined) return `After ${before}`;
  return before === after ? `Also ${before}` : `${before} – ${after}`;
}

function dropZone(slot, timeline) {
  const label = slotLabel(timeline, slot);
  const zone = el(
    "button",
    { class: "drop-zone", type: "button", "data-slot": slot, "aria-label": `Place here: ${label}` },
    el("span", { text: label }),
    el("b", { text: "Place here" }),
  );
  zone.addEventListener("click", () => chooseSlot(slot));
  return zone;
}

function previewItem() {
  const place = button("Lock it in", "primary-button", confirmPlacement);
  place.id = "place-button";
  return el(
    "div",
    { class: "timeline-item is-preview" },
    el("span", { class: "year-badge", text: "Your pick" }),
    eventCard(currentClue()),
    el("div", { class: "preview-actions" }, place, button("Cancel", "text-button", cancelPending)),
  );
}

function timelineItem(event, correct) {
  const item = el("div", { class: "timeline-item", "data-id": event.id });
  if (correct === false) item.classList.add("is-missed");
  item.append(el("span", { class: "year-badge", text: String(event.year) }), eventCard(event));
  return item;
}

function renderTimeline(over) {
  const { timeline, results } = session.state;
  const outcomes = new Map(results.map((correct, index) => [session.game.clues[index].id, correct]));
  const nodes = [];
  for (let slot = 0; slot <= timeline.length; slot += 1) {
    if (!over) nodes.push(slot === session.pendingSlot ? previewItem() : dropZone(slot, timeline));
    if (slot < timeline.length) nodes.push(timelineItem(timeline[slot], outcomes.get(timeline[slot].id)));
  }
  ui.timeline.replaceChildren(...nodes);
}

/* ---------- Clue panel ---------- */

function renderClue(over) {
  if (over) {
    ui.clue.replaceChildren(completeCard());
    return;
  }
  const event = currentClue();
  const pending = session.pendingSlot !== null;
  const label = el("p", {
    class: "clue-label",
    text: pending ? "Lock it in on the timeline" : "Drag it, or tap a gap in the timeline",
  });
  const card = eventCard(event);
  card.classList.add("clue-card");
  card.classList.toggle("is-pending", pending);
  card.tabIndex = -1;
  card.setAttribute("aria-label", `Clue: ${event.artist}. ${event.text}`);
  enableDrag(card);
  ui.clue.replaceChildren(label, card);
}

function completeCard() {
  const { game, state, mode, seed } = session;
  const total = game.clues.length;
  const points = score(state);
  const flawless = points === total;
  const knockedOut = misses(state) >= MAX_MISSES;
  const stats = normalizeStats(readStore(STATS_KEY, EMPTY_STATS));

  const unplayed = total - state.results.length;
  const spare = MAX_MISSES - misses(state);
  const summary = flawless
    ? "Every clue, first time. That’s headliner behavior."
    : !knockedOut
      ? `You reached the end of the mix with ${spare} ${spare === 1 ? "life" : "lives"} to spare.`
      : unplayed === 0
        ? "Third miss, on the very last clue."
        : `Third miss — the run ends with ${unplayed} ${unplayed === 1 ? "clue" : "clues"} unplayed.`;

  const dots = el("div", { class: "result-dots", role: "img", "aria-label": `${points} right, ${misses(state)} missed` });
  for (let index = 0; index < total; index += 1) {
    const result = state.results[index];
    dots.append(el("span", { class: result === undefined ? "dot" : result ? "dot is-correct" : "dot is-missed" }));
  }

  const stat = (value, label) => el("div", {}, el("strong", { text: String(value) }), el("span", { text: label }));
  const statRow = el(
    "div",
    { class: "stat-row" },
    stat(stats.played, "Played"),
    stat(stats.best, "Best"),
    stat(activeStreak(stats, todayDate()), "Daily streak"),
  );

  const share = button("Copy result", "text-button", async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", seed);
    const text = shareText({ label: mode === "daily" ? seed : "mix", results: state.results, total, url: url.href });
    try {
      await navigator.clipboard.writeText(text);
      share.textContent = "Copied!";
    } catch {
      // Clipboard access can be denied; show the text so it can be copied by hand.
      const box = el("textarea", { class: "share-box", readonly: "", rows: "4", "aria-label": "Your result" });
      box.value = text;
      share.replaceWith(box);
      box.select();
    }
  });

  const actions = el("div", { class: "placement-actions" }, button("Play a new mix", "primary-button", newMix), share);
  if (mode === "practice") actions.append(button("Today’s mix", "text-button", () => startSession(todayDate())));

  const card = el(
    "section",
    { class: "complete-card" },
    el("p", { class: "eyebrow", text: flawless ? "A flawless run" : knockedOut ? "Run over" : "Mix complete" }),
    el("h2", { text: String(points) }, el("span", { text: ` of ${total}` })),
    el("p", { class: "summary", text: summary }),
    dots,
    statRow,
    actions,
  );
  if (mode === "daily") card.append(el("p", { class: "small-print", text: "A new daily mix arrives at midnight, New York time." }));
  return card;
}

/* ---------- Playing ---------- */

function chooseSlot(slot) {
  if (isOver(session.game, session.state)) return;
  session.pendingSlot = slot;
  render();
  const preview = ui.timeline.querySelector(".is-preview");
  preview.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  $("#place-button").focus({ preventScroll: true });
}

function cancelPending() {
  if (session.pendingSlot === null) return;
  const slot = session.pendingSlot;
  session.pendingSlot = null;
  render();
  ui.timeline.querySelector(`.drop-zone[data-slot="${slot}"]`)?.focus({ preventScroll: true });
}

function confirmPlacement() {
  if (session.pendingSlot === null) return;
  const from = pageTop(ui.timeline.querySelector(".is-preview"));
  const result = place(session.game, session.state, session.pendingSlot);
  session.state = result.state;
  session.pendingSlot = null;
  session.lastId = result.event.id;
  const over = isOver(session.game, session.state);
  if (over) recordFinish();
  save();

  const left = MAX_MISSES - misses(session.state);
  if (result.correct) setStatus(`✓ ${result.event.year} — right where it belongs.`, "is-correct");
  else if (left === 0) setStatus(`✗ It was ${result.event.year}. That was your last life.`, "is-missed");
  else setStatus(`✗ It was ${result.event.year} — moved to its true spot. ${left} ${left === 1 ? "life" : "lives"} left.`, "is-missed");

  render();
  const item = ui.timeline.querySelector(`[data-id="${CSS.escape(result.event.id)}"]`);
  animateLanding(item, from, result.correct);
  if (over) {
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  } else {
    item.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    ui.clue.querySelector(".clue-card").focus({ preventScroll: true });
  }
}

function animateLanding(item, from, correct) {
  item.classList.add(correct ? "landed-correct" : "landed-missed");
  if (reducedMotion.matches) return;
  const travel = from - pageTop(item);
  const frames =
    correct || Math.abs(travel) < 1
      ? [{ transform: "scale(.94)" }, { transform: "scale(1.04)" }, { transform: "none" }]
      : [{ transform: `translateY(${travel}px)` }, { transform: "none" }];
  item.animate(frames, { duration: correct ? 320 : 520, easing: "cubic-bezier(.2,.8,.2,1)" });
}

function newMix() {
  startSession(randomSeed(), { fresh: true });
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

/* ---------- Drag (pointer events, so it works for mouse, pen, and touch) ---------- */

function zoneAt(x, y) {
  const bounds = ui.timeline.getBoundingClientRect();
  if (x < bounds.left - 40 || x > bounds.right + 40) return null;
  // On narrow screens the clue panel is pinned over the top of the timeline.
  if (stackedLayout.matches && y < ui.clueArea.getBoundingClientRect().bottom) return null;
  let best = null;
  let bestDistance = 70;
  for (const zone of ui.timeline.querySelectorAll(".drop-zone")) {
    const rect = zone.getBoundingClientRect();
    const distance = Math.abs((rect.top + rect.bottom) / 2 - y);
    if (distance < bestDistance) {
      best = zone;
      bestDistance = distance;
    }
  }
  return best;
}

function enableDrag(card) {
  card.addEventListener("pointerdown", (down) => {
    if (down.button !== 0 || cancelDrag) return;
    let ghost = null;
    let target = null;
    let frame = 0;
    let pointer = { x: down.clientX, y: down.clientY };

    const retarget = () => {
      const next = zoneAt(pointer.x, pointer.y);
      if (next === target) return;
      target?.classList.remove("drag-over");
      next?.classList.add("drag-over");
      target = next;
    };

    // Scroll the page while the card is held near the top or bottom edge.
    const autoScroll = () => {
      const topEdge = stackedLayout.matches ? 28 : 60;
      if (pointer.y < topEdge) window.scrollBy(0, -14);
      else if (pointer.y > window.innerHeight - 70) window.scrollBy(0, 14);
      retarget();
      frame = requestAnimationFrame(autoScroll);
    };

    const move = (event) => {
      if (event.pointerId !== down.pointerId) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!ghost) {
        if (Math.hypot(pointer.x - down.clientX, pointer.y - down.clientY) < 8) return;
        ghost = card.cloneNode(true);
        ghost.classList.add("drag-ghost");
        ghost.classList.remove("is-pending");
        ghost.removeAttribute("aria-label");
        ghost.style.width = `${card.offsetWidth}px`;
        document.body.append(ghost);
        document.body.classList.add("is-dragging");
        card.classList.add("is-dragging");
        frame = requestAnimationFrame(autoScroll);
      }
      ghost.style.transform = `translate(${pointer.x - ghost.offsetWidth / 2}px, ${pointer.y - 34}px) rotate(-1.5deg)`;
    };

    const stop = () => {
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerup", end);
      card.removeEventListener("pointercancel", end);
      cancelAnimationFrame(frame);
      ghost?.remove();
      document.body.classList.remove("is-dragging");
      card.classList.remove("is-dragging");
      target?.classList.remove("drag-over");
      cancelDrag = null;
    };

    function end(event) {
      if (event.pointerId !== down.pointerId) return;
      const dropped = ghost && event.type === "pointerup" ? target : null;
      stop();
      if (dropped) chooseSlot(Number(dropped.dataset.slot));
    }

    // Capture first: it throws if the pointer is already gone, and then no drag starts.
    card.setPointerCapture(down.pointerId);
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
    cancelDrag = stop;
  });
}

/* ---------- Render ---------- */

function render() {
  cancelDrag?.();
  const { game, state, mode, seed } = session;
  const over = isOver(game, state);
  const left = MAX_MISSES - misses(state);
  ui.mixLabel.textContent = mode === "daily" ? `Daily mix · ${seed}` : `Mix · ${seed}`;
  ui.round.textContent = over ? "Mix over" : `Clue ${state.results.length + 1} of ${game.clues.length}`;
  ui.score.textContent = `${score(state)} correct`;
  ui.lives.textContent = "♥".repeat(left) + "♡".repeat(MAX_MISSES - left);
  ui.lives.setAttribute("aria-label", `${left} of ${MAX_MISSES} lives left`);
  ui.clueArea.classList.toggle("is-playing", !over);
  renderClue(over);
  renderTimeline(over);
}

function wireControls() {
  ui.help.addEventListener("click", () => ui.dialog.showModal());
  ui.closeHelp.addEventListener("click", () => ui.dialog.close());
  ui.start.addEventListener("click", () => ui.dialog.close());
  ui.dialog.addEventListener("close", () => writeStore(INTRO_KEY, true));
  ui.newGame.addEventListener("click", newMix);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || ui.dialog.open) return;
    // Escape abandons a drag in progress; otherwise it withdraws the pending pick.
    if (cancelDrag) cancelDrag();
    else cancelPending();
  });
}

async function boot() {
  wireControls();
  try {
    const response = await fetch("./data/events.json");
    if (!response.ok) throw new Error(`Could not load clues (${response.status})`);
    events = (await response.json()).events;
    if (events.length < ROUND_COUNT + 1) throw new Error("Not enough music events in the data file.");
    startSession(new URLSearchParams(window.location.search).get("seed") || todayDate());
    if (!readStore(INTRO_KEY, false)) ui.dialog.showModal();
  } catch (error) {
    ui.clue.replaceChildren(
      el("section", { class: "complete-card error-card" }, el("h2", { text: "Couldn’t cue the music." }), el("p", { text: error.message })),
    );
    console.error(error);
  }
}

boot();
