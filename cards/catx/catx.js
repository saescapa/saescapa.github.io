import { CHANNELS_PER_FIXTURE, FIXTURE_COUNT, dmx, subscribe } from '../dmx.js';

const RING_SPACING = 20;
const MAX_GLOW = 18;

class CatxCard extends HTMLElement {
  connectedCallback() {
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.querySelector('.card').append(this.canvas);
    this.frame = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.unsubscribe = subscribe(() => this.schedule());
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    this.unsubscribe();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.canvas.remove();
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.schedule();
  }

  schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  draw() {
    const ratio = window.devicePixelRatio || 1;
    const width = this.canvas.width / ratio;
    const height = this.canvas.height / ratio;
    if (!width || !height) return;
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const cx = width * 0.85;
    const cy = height * 0.15;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.lineWidth = 1;
    for (let fixture = 0; fixture < FIXTURE_COUNT; fixture++) {
      ctx.beginPath();
      ctx.arc(cx, cy, this.radius(fixture), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(width / 2, height * 0.45);
    ctx.scale(width * 1.2, height * 1.2);
    const vignette = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    vignette.addColorStop(0.4, 'rgba(5, 5, 5, 0)');
    vignette.addColorStop(1, '#050505');
    ctx.fillStyle = vignette;
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 2;
    for (let fixture = 0; fixture < FIXTURE_COUNT; fixture++) {
      const offset = fixture * CHANNELS_PER_FIXTURE;
      const level = dmx[offset] / 255;
      if (!level) continue;
      const color = `rgb(${Math.round(dmx[offset + 1] * level)}, ${Math.round(dmx[offset + 2] * level)}, ${Math.round(dmx[offset + 3] * level)})`;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = MAX_GLOW * level;
      ctx.beginPath();
      ctx.arc(cx, cy, this.radius(fixture), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  }

  radius(fixture) {
    return (fixture + 1) * RING_SPACING - 0.5;
  }
}

customElements.define('catx-card', CatxCard);
