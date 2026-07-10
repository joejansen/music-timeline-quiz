import {
  ROUND_COUNT,
  createGame,
  dateLabel,
  pointsForRound,
  positionForEvent,
} from "./game-logic.js";

const elements = {
  clueArea: document.querySelector("#clue-area"),
  feedback: document.querySelector("#feedback"),
  timeline: document.querySelector("#timeline"),
  roundStat: document.querySelector("#round-stat"),
  scoreStat: document.querySelector("#score-stat"),
  mistakeStat: document.querySelector("#mistake-stat"),
  dialog: document.querySelector("#how-to-dialog"),
  help: document.querySelector("#help-button"),
  closeHelp: document.querySelector("#close-help"),
  start: document.querySelector("#start-game"),
  newGame: document.querySelector("#new-game-button"),
  template: document.querySelector("#event-card-template"),
};

let allEvents = [];
let state = null;

function todaySeed() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return new URLSearchParams(window.location.search).get("seed") || today;
}

function createSeed() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function artClass(event) {
  const palette = ["art-coral", "art-violet", "art-blue", "art-green", "art-gold", "art-berry"];
  const number = [...event.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return palette[number % palette.length];
}

function makeEventCard(event, { clue = false, preview = false } = {}) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  const art = card.querySelector(".event-art");
  art.classList.add(artClass(event));
  art.querySelector("span").textContent = event.art || event.artist.slice(0, 1);
  const hideDate = clue || preview;
  card.querySelector(".event-kicker").textContent = hideDate ? event.artist : `${dateLabel(event.date)} · ${event.artist}`;
  card.querySelector(".event-text").textContent = event.text;
  if (!hideDate) card.style.setProperty("--date-label", JSON.stringify(dateLabel(event.date)));
  if (preview) card.classList.add("preview-card");
  return card;
}

function updateStats() {
  const isFinished = state.index >= state.clues.length;
  elements.roundStat.textContent = isFinished ? "Mix complete" : `${state.index + 1} of ${state.clues.length}`;
  elements.scoreStat.textContent = `${state.score} pts`;
  elements.mistakeStat.textContent = `${state.mistakes} missed`;
}

function chooseSlot(slot) {
  if (state.locked || state.index >= state.clues.length) return;
  state.pendingSlot = slot;
  render();
  document.querySelector("#place-button")?.focus();
}

function makeDropZone(slot, label) {
  const zone = document.createElement("button");
  zone.type = "button";
  zone.className = "drop-zone";
  zone.dataset.slot = slot;
  zone.innerHTML = `<span>${label}</span><b>Place here</b>`;
  if (state.pendingSlot === slot) zone.classList.add("selected");
  zone.addEventListener("click", () => chooseSlot(slot));
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("drag-over");
    chooseSlot(slot);
  });
  return zone;
}

function renderTimeline() {
  elements.timeline.replaceChildren();
  const hasClue = state.index < state.clues.length;
  const current = state.clues[state.index];
  const visible = [...state.timeline];
  if (hasClue && state.pendingSlot !== null) visible.splice(state.pendingSlot, 0, { ...current, preview: true });

  for (let index = 0; index <= visible.length; index += 1) {
    const confirmedBefore = visible.slice(0, index).filter((event) => !event.preview).length;
    if (hasClue && state.pendingSlot !== confirmedBefore) {
      const label = index === 0 ? "Before" : index === visible.length ? "After" : "Between";
      elements.timeline.append(makeDropZone(confirmedBefore, label));
    }
    if (index === visible.length) break;
    const event = visible[index];
    const item = document.createElement("div");
    item.className = event.preview ? "timeline-item is-preview" : "timeline-item";
    item.append(makeEventCard(event, { preview: event.preview }));
    if (event.preview) {
      const badge = document.createElement("span");
      badge.className = "placing-badge";
      badge.textContent = "Ready to place";
      item.append(badge);
    }
    elements.timeline.append(item);
  }
}

function renderClue() {
  elements.clueArea.replaceChildren();
  if (state.index >= state.clues.length) {
    renderComplete();
    return;
  }
  const current = state.clues[state.index];
  const heading = document.createElement("p");
  heading.className = "clue-label";
  heading.textContent = state.pendingSlot === null ? "Drag this clue onto the timeline" : "Happy with this spot?";
  const card = makeEventCard(current, { clue: true });
  card.classList.add("clue-card");
  card.draggable = true;
  card.setAttribute("aria-label", `Clue: ${current.text}`);
  card.addEventListener("dragstart", (event) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", current.id);
    card.classList.add("is-dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
  elements.clueArea.append(heading, card);

  if (state.pendingSlot !== null) {
    const actions = document.createElement("div");
    actions.className = "placement-actions";
    const place = document.createElement("button");
    place.type = "button";
    place.id = "place-button";
    place.className = "primary-button";
    place.textContent = "Place on timeline";
    place.addEventListener("click", placeCurrentClue);
    const change = document.createElement("button");
    change.type = "button";
    change.className = "text-button";
    change.textContent = "Choose a different spot";
    change.addEventListener("click", () => {
      state.pendingSlot = null;
      render();
    });
    actions.append(place, change);
    elements.clueArea.append(actions);
  }
}

function renderComplete() {
  const complete = document.createElement("section");
  complete.className = "complete-card";
  const possible = state.clues.reduce((sum, _, index) => sum + pointsForRound(index + 1), 0);
  const perfect = state.mistakes === 0;
  complete.innerHTML = `
    <p class="eyebrow">${perfect ? "A flawless run" : "Your music map is complete"}</p>
    <h2>${state.score} <span>points</span></h2>
    <p>${perfect ? "You placed every clue without a miss. That’s headliner behavior." : `You placed ${state.clues.length - state.mistakes} of ${state.clues.length} clues on the first try.`}</p>
    <p class="possible-score">Perfect mix: ${possible} points</p>
  `;
  const actions = document.createElement("div");
  actions.className = "placement-actions";
  const playAgain = document.createElement("button");
  playAgain.type = "button";
  playAgain.className = "primary-button";
  playAgain.textContent = "Play a new mix";
  playAgain.addEventListener("click", () => startGame(createSeed()));
  const share = document.createElement("button");
  share.type = "button";
  share.className = "text-button";
  share.textContent = "Copy score";
  share.addEventListener("click", async () => {
    const text = `I scored ${state.score}/${possible} in Trackback — a music history timeline game.`;
    await navigator.clipboard?.writeText(text);
    share.textContent = "Copied!";
  });
  actions.append(playAgain, share);
  complete.append(actions);
  elements.clueArea.append(complete);
}

function showFeedback(correct, event, points) {
  elements.feedback.className = `feedback show ${correct ? "is-correct" : "is-missed"}`;
  elements.feedback.innerHTML = correct
    ? `<strong>Right on time — +${points} points</strong><span>${dateLabel(event.date)} is exactly where it belongs.</span>`
    : `<strong>Not quite — the timeline fixed it</strong><span>${event.artist}: ${dateLabel(event.date)}. Watch for the mint date badge.</span>`;
  const next = document.createElement("button");
  next.type = "button";
  next.className = "feedback-next";
  next.textContent = state.index + 1 === state.clues.length ? "See my score" : "Next clue";
  next.addEventListener("click", nextClue);
  elements.feedback.append(next);
}

function placeCurrentClue() {
  if (state.pendingSlot === null || state.locked) return;
  const event = state.clues[state.index];
  const correctSlot = positionForEvent(state.timeline, event);
  const correct = state.pendingSlot === correctSlot;
  const points = correct ? pointsForRound(state.index + 1) : 0;
  state.timeline.splice(correctSlot, 0, event);
  state.score += points;
  state.mistakes += correct ? 0 : 1;
  state.locked = true;
  state.pendingSlot = null;
  renderTimeline();
  renderClue();
  showFeedback(correct, event, points);
  updateStats();
  document.querySelector(".feedback")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function nextClue() {
  state.index += 1;
  state.locked = false;
  state.pendingSlot = null;
  elements.feedback.className = "feedback";
  elements.feedback.replaceChildren();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function render() {
  updateStats();
  renderClue();
  renderTimeline();
}

function startGame(seed) {
  const { anchor, clues } = createGame(allEvents, seed, ROUND_COUNT);
  state = { seed, timeline: [anchor], clues, index: 0, pendingSlot: null, score: 0, mistakes: 0, locked: false };
  elements.feedback.className = "feedback";
  elements.feedback.replaceChildren();
  render();
}

function wireControls() {
  const openHelp = () => elements.dialog.showModal();
  const closeHelp = () => elements.dialog.close();
  elements.help.addEventListener("click", openHelp);
  elements.closeHelp.addEventListener("click", closeHelp);
  elements.start.addEventListener("click", () => {
    localStorage.setItem("trackback-intro-seen", "true");
    closeHelp();
  });
  elements.newGame.addEventListener("click", () => startGame(createSeed()));
}

async function boot() {
  wireControls();
  try {
    const response = await fetch("./data/events.json");
    if (!response.ok) throw new Error(`Could not load clues (${response.status})`);
    const data = await response.json();
    allEvents = data.events;
    if (allEvents.length < ROUND_COUNT + 1) throw new Error("Not enough music events in the data file.");
    startGame(todaySeed());
    if (!localStorage.getItem("trackback-intro-seen")) elements.dialog.showModal();
  } catch (error) {
    elements.clueArea.innerHTML = `<section class="complete-card error-card"><h2>Couldn’t cue the music.</h2><p>${error.message}</p></section>`;
    console.error(error);
  }
}

boot();
