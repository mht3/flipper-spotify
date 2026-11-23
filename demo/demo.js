import {drawSpotify, openSpotifyDemo, openSpotifyPlayer, spotifyHit, spotifyKey, spotifyStatus} from './spotify-preview.js';
import {spotifyTourSteps, startSpotifyTour} from './spotify-tour.js';

const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle('embedded', params.get('embedded') === '1');
const device = document.querySelector('#device');
const lcd = document.querySelector('#lcd');
const context = lcd.getContext('2d');
const keys = [...device.querySelectorAll('[data-key]')];
const tourStart = document.querySelector('#tour-start');
const lesson = document.querySelector('#lesson');
const hint = document.querySelector('#lesson-hint');
const retry = document.querySelector('#retry');
const status = document.querySelector('#player-status');
const freePlay = openSpotifyDemo();
let tour;
let redrawTimer;

function session() {
  return tour?.state ?? freePlay;
}

function draw() {
  clearTimeout(redrawTimer);
  if (document.hidden) return;
  context.clearRect(0, 0, 128, 64);
  context.fillStyle = context.strokeStyle = '#32291e';
  context.imageSmoothingEnabled = false;
  if (drawSpotify(context, session())) redrawTimer = setTimeout(draw, 70);
}

function update() {
  draw();
  status.textContent = spotifyStatus(session());
}

function renderLesson() {
  lesson.hidden = !tour;
  tourStart.hidden = Boolean(tour);
  const cue = tour?.step?.key.replace(/^hold/, '').toLowerCase();
  for (const button of keys) {
    const active = button.dataset.key === cue;
    button.classList.toggle('cue', active);
    if (active) button.setAttribute('aria-describedby', 'lesson-instruction');
    else button.removeAttribute('aria-describedby');
  }
  hint.textContent = '';
  if (!tour) return;
  const progress = document.querySelector('#progress');
  progress.max = spotifyTourSteps.length;
  progress.value = tour.index;
  document.querySelector('#lesson-step').textContent = tour.complete
    ? 'Tour complete' : 'Step ' + (tour.index + 1) + ' of ' + progress.max;
  document.querySelector('#lesson-title').textContent = tour.step?.title ?? 'On the Coast is playing.';
  document.querySelector('#lesson-instruction').textContent = tour.step?.instruction ?? 'Return to your sample library to explore freely.';
  retry.textContent = tour.complete ? 'Restart tour' : 'Repeat step';
}

function press(key) {
  if (tour) {
    const step = tour.step;
    if (!step || key !== step.key) {
      hint.textContent = tour.complete ? 'Tap Explore freely to keep playing.' :
        step.hold ? 'Hold the highlighted button for a moment.' : 'Tap the highlighted button.';
      return;
    }
    spotifyKey(session(), key);
    if (tour.observe(key)) renderLesson();
    else {
      tour.retry();
      hint.textContent = 'Tap Repeat step to practice that button again.';
    }
  } else spotifyKey(freePlay, key);
  update();
}

function beginTour() {
  tour = startSpotifyTour();
  renderLesson();
  update();
}
tourStart.addEventListener('click', beginTour);
retry.addEventListener('click', () => {
  if (tour.complete) tour.restart();
  else tour.retry();
  renderLesson();
  update();
});
document.querySelector('#exit').addEventListener('click', () => {
  tour.exit();
  tour = undefined;
  renderLesson();
  update();
  tourStart.focus({preventScroll: true});
});

for (const button of keys) {
  const key = button.dataset.key;
  let timer, held = false;
  function cancel() {
    clearTimeout(timer);
  }
  function start() {
    cancel();
    held = false;
    if (key === 'back') return;
    timer = setTimeout(() => {
      held = true;
      press('hold' + key[0].toUpperCase() + key.slice(1));
    }, 600);
  }
  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    button.setPointerCapture(event.pointerId);
    start();
  });
  button.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) start();
  });
  button.addEventListener('keyup', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    cancel();
    if (!held) press(key);
    held = false;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
    button.addEventListener(type, cancel);
  }
  button.addEventListener('contextmenu', event => event.preventDefault());
  button.addEventListener('click', () => {
    if (!held) press(key);
    held = false;
  });
}

function point(event) {
  const box = lcd.getBoundingClientRect();
  return [(event.clientX - box.left) * 128 / box.width, (event.clientY - box.top) * 64 / box.height];
}

lcd.addEventListener('click', event => {
  if (tour) {
    hint.textContent = tour.complete ? 'Tap Explore freely to keep playing.' : 'Use the highlighted button on the Flipper.';
  } else if (spotifyHit(freePlay, ...point(event))) update();
});

new ResizeObserver(draw).observe(lcd);
document.addEventListener('visibilitychange', draw);
if (params.get('view') === 'now-playing') openSpotifyPlayer(freePlay);
if (params.get('tour') === '1') beginTour();
else update();
