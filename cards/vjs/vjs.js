(() => {
  'use strict';

  const { CHANNELS_PER_FIXTURE, FIXTURE_COUNT, clearDMX, commit, dmx, subscribe } = window.site.dmx;
  const { getTheme, onThemeChange } = window.site.theme;

  const MIN_BPM = 30;
  const MAX_BPM = 180;
  const TEMPOS = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 124, 128, 130, 140, 150, 160, 170, 174, 180];
  const DEFAULT_BPM = 128;
  const MAX_DIMMER = 255;
  const DEFAULT_DIMMER = 65;
  const PATTERN_STEPS = 8;
  const STEPS_PER_BEAT = 2;
  const STROBE_WINDOW = 0.15;
  const WARM_WHITE = [255, 206, 150];
  const WHITE = [255, 255, 255];
  const CHASE_COLORS = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
  const HUE_STEP = 360 / FIXTURE_COUNT;
  const PULSE_FLOOR = 0.1;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function hueChannel(hue, offset) {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  }

  function setHue(set, fixture, level, hue) {
    set(fixture, level, hueChannel(hue, 0), hueChannel(hue, 8), hueChannel(hue, 4));
  }

  function setColor(set, fixture, level, color) {
    set(fixture, level, color[0], color[1], color[2]);
  }

  const EFFECTS = [
    {
      name: 'PULSE',
      run: ({ step, phase }, set) => {
        const accent = step % 4 === 0 ? 1 : 0.6;
        const level = accent * Math.exp(Math.log(PULSE_FLOOR) * phase);
        for (let fixture = 0; fixture < FIXTURE_COUNT; fixture++) setColor(set, fixture, level, WARM_WHITE);
      },
      rest: (set) => {
        for (let fixture = 0; fixture < FIXTURE_COUNT; fixture++) setColor(set, fixture, 1, WARM_WHITE);
      },
    },
    {
      name: 'STROBE',
      run: ({ step, phase }, set) => {
        const lit = phase < STROBE_WINDOW;
        const evenBeat = step % 2 === 1;
        for (let fixture = 0; fixture < FIXTURE_COUNT; fixture++) {
          const onGrid = evenBeat === (fixture % 2 === 1);
          setColor(set, fixture, lit && onGrid ? 1 : 0, WHITE);
        }
      },
      rest: (set) => {
        for (let fixture = 0; fixture < FIXTURE_COUNT; fixture++) setColor(set, fixture, 1, WHITE);
      },
    },
    {
      name: 'CHASE',
      run: ({ steps, step, phase }, set) => {
        const color = CHASE_COLORS[Math.floor(steps / PATTERN_STEPS) % CHASE_COLORS.length];
        const trailing = (step + PATTERN_STEPS - 1) % PATTERN_STEPS;
        for (let fixture = 0; fixture < FIXTURE_COUNT; fixture++) {
          let level = 0;
          if (fixture === step) level = 1;
          else if (fixture === trailing) level = 0.3 * (1 - phase);
          setColor(set, fixture, level, color);
        }
      },
      rest: (set) => {
        for (let fixture = 0; fixture < FIXTURE_COUNT; fixture++) setColor(set, fixture, 1, CHASE_COLORS[0]);
      },
    },
    {
      name: 'RAINBOW',
      run: ({ steps, step }, set) => {
        const rotation = ((steps / PATTERN_STEPS) % 1) * 360;
        for (let fixture = 0; fixture < FIXTURE_COUNT; fixture++) {
          setHue(set, fixture, fixture <= step ? 1 : 0, (fixture * HUE_STEP + rotation) % 360);
        }
      },
      rest: (set) => {
        for (let fixture = 0; fixture < FIXTURE_COUNT; fixture++) setHue(set, fixture, 1, fixture * HUE_STEP);
      },
    },
  ];

  function pad(value) {
    return String(value).padStart(3, '0');
  }

  class VJSCard extends HTMLElement {
    connectedCallback() {
      this.bpm = DEFAULT_BPM;
      this.master = DEFAULT_DIMMER;
      this.effect = 0;
      this.beats = 0;
      this.lastTime = 0;
      this.frame = 0;
      this.changed = false;
      this.readoutText = '';
      this.beatFrame = { steps: 0, step: 0, phase: 0 };
      this.setFixture = (fixture, level, red, green, blue) => this.writeFixture(fixture, level, red, green, blue);
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
        <div class="vjs-field">
          <label for="vjs-bpm">BPM</label>
          <span class="vjs-stepper">
            <button type="button" class="vjs-step" aria-label="Decrease BPM">\u2212</button>
            <input id="vjs-bpm" type="number" min="${MIN_BPM}" max="${MAX_BPM}" step="1" value="${DEFAULT_BPM}" inputmode="numeric">
            <button type="button" class="vjs-step" aria-label="Increase BPM">+</button>
          </span>
        </div>
        <label class="vjs-field">DIM <input type="range" min="0" max="${MAX_DIMMER}" step="1" value="${DEFAULT_DIMMER}"></label>
        <button type="button" class="vjs-fx"></button>
        <output class="vjs-readout" aria-live="off"></output>`;
      this.bpmInput = this.panel.querySelector('input[type="number"]');
      this.dimInput = this.panel.querySelector('input[type="range"]');
      this.fxButton = this.panel.querySelector('.vjs-fx');
      [this.bpmDown, this.bpmUp] = this.panel.querySelectorAll('.vjs-step');
      this.readout = this.panel.querySelector('output');
      this.querySelector('.vjs-screen').append(this.panel);

      this.bpmInput.addEventListener('input', () => {
        const value = this.bpmInput.valueAsNumber;
        if (value >= MIN_BPM && value <= MAX_BPM) {
          this.bpm = Math.round(value);
          this.renderStepButtons();
        }
      });
      const commitBPM = () => {
        const value = this.bpmInput.valueAsNumber;
        if (Number.isFinite(value)) this.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
        this.bpmInput.value = String(this.bpm);
        this.renderStepButtons();
      };
      this.bpmInput.addEventListener('change', commitBPM);
      this.bpmInput.addEventListener('blur', commitBPM);
      this.bpmDown.addEventListener('click', () => this.setBPM([...TEMPOS].reverse().find((tempo) => tempo < this.bpm) ?? MIN_BPM));
      this.bpmUp.addEventListener('click', () => this.setBPM(TEMPOS.find((tempo) => tempo > this.bpm) ?? MAX_BPM));
      this.dimInput.addEventListener('input', () => {
        this.master = Number(this.dimInput.value);
      });
      this.fxButton.addEventListener('click', () => {
        this.effect = (this.effect + 1) % EFFECTS.length;
        this.renderEffect();
      });
      this.renderEffect();
      this.renderReadout();
      this.renderStepButtons();
    }

    setBPM(bpm) {
      this.bpm = bpm;
      this.bpmInput.value = String(bpm);
      this.renderStepButtons();
    }

    renderStepButtons() {
      this.bpmDown.disabled = this.bpm <= MIN_BPM;
      this.bpmUp.disabled = this.bpm >= MAX_BPM;
    }

    renderEffect() {
      this.fxButton.textContent = `FX ${EFFECTS[this.effect].name}`;
    }

    renderReadout() {
      const entries = [];
      for (let channel = 0; channel < CHANNELS_PER_FIXTURE; channel++) {
        entries.push(`CH${channel + 1} ${pad(dmx[channel])}`);
      }
      const text = entries.join(' ');
      if (text === this.readoutText) return;
      this.readoutText = text;
      this.readout.replaceChildren(
        ...entries.map((entry) => Object.assign(document.createElement('span'), { textContent: entry })),
      );
    }

    sync() {
      if (getTheme() === 'dark' && !document.hidden) {
        this.start();
      } else {
        this.stop();
        if (getTheme() !== 'dark') clearDMX();
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

    writeFixture(fixture, level, red, green, blue) {
      const offset = fixture * CHANNELS_PER_FIXTURE;
      const dimmer = Math.round(level * this.master);
      if (dmx[offset] !== dimmer || dmx[offset + 1] !== red || dmx[offset + 2] !== green || dmx[offset + 3] !== blue) {
        dmx[offset] = dimmer;
        dmx[offset + 1] = red;
        dmx[offset + 2] = green;
        dmx[offset + 3] = blue;
        this.changed = true;
      }
    }

    advance(now) {
      this.beats += (Math.max(0, now - this.lastTime) * this.bpm) / 60000;
      this.lastTime = now;
      const frame = this.beatFrame;
      frame.steps = this.beats * STEPS_PER_BEAT;
      frame.step = Math.floor(frame.steps) % PATTERN_STEPS;
      frame.phase = frame.steps % 1;
      this.changed = false;
      const effect = EFFECTS[this.effect];
      if (reducedMotion.matches) effect.rest(this.setFixture);
      else effect.run(frame, this.setFixture);
      if (this.changed) commit();
    }
  }

  customElements.define('vjs-card', VJSCard);
})();
