import { dmx, setDMX, subscribe } from '../dmx.js';
import { getTheme, onThemeChange } from '../theme.js';

const MIN_BPM = 60;
const MAX_BPM = 200;
const DEFAULT_BPM = 128;
const MAX_DIMMER = 255;
const MAX_FLASHES_PER_SECOND_BPM = 180;
const WARM_WHITE = [255, 206, 150];
const WHITE = [255, 255, 255];
const CHASE_COLORS = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
const REST_RAINBOW_HUE = 180;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function hueToRGB(hue) {
  const channel = (offset) => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)];
}

const EFFECTS = [
  {
    name: 'PULSE',
    render: ({ phase }) => ({ level: Math.exp(Math.log(0.1) * phase), color: WARM_WHITE }),
    still: { level: 1, color: WARM_WHITE },
  },
  {
    name: 'STROBE',
    render: ({ phase, beat, bpm }) => {
      const flashEvery = bpm > MAX_FLASHES_PER_SECOND_BPM ? 2 : 1;
      const on = beat % flashEvery === 0 && phase < 0.15;
      return { level: on ? 1 : 0, color: WHITE };
    },
    still: { level: 1, color: WHITE },
  },
  {
    name: 'CHASE',
    render: ({ beat }) => ({ level: 1, color: CHASE_COLORS[beat % CHASE_COLORS.length] }),
    still: { level: 1, color: CHASE_COLORS[0] },
  },
  {
    name: 'RAINBOW',
    render: ({ phase, beats }) => ({
      level: 0.55 + 0.45 * (1 - phase) ** 2,
      color: hueToRGB(((beats / 4) % 1) * 360),
    }),
    still: { level: 1, color: hueToRGB(REST_RAINBOW_HUE) },
  },
];

function pad(value) {
  return String(value).padStart(3, '0');
}

class VJSCard extends HTMLElement {
  connectedCallback() {
    this.bpm = DEFAULT_BPM;
    this.master = MAX_DIMMER;
    this.effect = 0;
    this.beats = 0;
    this.lastTime = 0;
    this.frame = 0;
    this.build();
    this.unsubscribeDMX = subscribe(() => this.renderReadout());
    this.unsubscribeTheme = onThemeChange(() => this.sync());
    this.onVisibility = () => this.sync();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.sync();
  }

  disconnectedCallback() {
    this.stop();
    this.unsubscribeDMX();
    this.unsubscribeTheme();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.panel.remove();
  }

  build() {
    this.panel = document.createElement('div');
    this.panel.className = 'vjs-panel';
    this.panel.innerHTML = `
      <label class="vjs-field">BPM <input type="number" min="${MIN_BPM}" max="${MAX_BPM}" step="1" value="${DEFAULT_BPM}" inputmode="numeric"></label>
      <label class="vjs-field">DIM <input type="range" min="0" max="${MAX_DIMMER}" step="1" value="${MAX_DIMMER}"></label>
      <button type="button"></button>
      <output class="vjs-readout" aria-live="off"></output>`;
    this.bpmInput = this.panel.querySelector('input[type="number"]');
    this.dimInput = this.panel.querySelector('input[type="range"]');
    this.fxButton = this.panel.querySelector('button');
    this.readout = this.panel.querySelector('output');
    this.querySelector('.vjs-screen').append(this.panel);

    this.bpmInput.addEventListener('input', () => {
      const value = this.bpmInput.valueAsNumber;
      if (value >= MIN_BPM && value <= MAX_BPM) this.bpm = Math.round(value);
    });
    const commitBPM = () => {
      const value = this.bpmInput.valueAsNumber;
      if (Number.isFinite(value)) this.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
      this.bpmInput.value = String(this.bpm);
    };
    this.bpmInput.addEventListener('change', commitBPM);
    this.bpmInput.addEventListener('blur', commitBPM);
    this.dimInput.addEventListener('input', () => {
      this.master = Number(this.dimInput.value);
    });
    this.fxButton.addEventListener('click', () => {
      this.effect = (this.effect + 1) % EFFECTS.length;
      this.renderEffect();
    });
    this.renderEffect();
    this.renderReadout();
  }

  renderEffect() {
    this.fxButton.textContent = `FX ${EFFECTS[this.effect].name}`;
  }

  renderReadout() {
    const text = [...dmx].map((value, channel) => `CH${channel + 1} ${pad(value)}`);
    this.readout.replaceChildren(...text.map((entry) => Object.assign(document.createElement('span'), { textContent: entry })));
  }

  sync() {
    if (getTheme() === 'dark' && !document.hidden) {
      this.start();
    } else {
      this.stop();
      if (getTheme() !== 'dark') setDMX([0, 0, 0, 0]);
    }
  }

  start() {
    if (this.frame) return;
    this.lastTime = performance.now();
    const tick = (now) => {
      this.frame = requestAnimationFrame(tick);
      this.advance(now);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  advance(now) {
    this.beats += ((now - this.lastTime) * this.bpm) / 60000;
    this.lastTime = now;
    const effect = EFFECTS[this.effect];
    const { level, color } = reducedMotion.matches
      ? effect.still
      : effect.render({ beats: this.beats, beat: Math.floor(this.beats), phase: this.beats % 1, bpm: this.bpm });
    const next = [Math.round(level * this.master), ...color];
    if (next.some((value, channel) => value !== dmx[channel])) setDMX(next);
  }
}

customElements.define('vjs-card', VJSCard);
