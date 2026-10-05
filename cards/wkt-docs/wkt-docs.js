const INK = '#9fb8e6';
const INK_WIDTH = 2;
const SETTLE_MS = 900;
const FADE_MS = 1600;
const RISE_PX = 16;
const MARGIN_PX = 8;
const FILING_MESSAGES = ['submitted to plan', 'created idea', 'filed a bug', 'wrote a handoff', 'archived plan'];

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

class WKTDocsCard extends HTMLElement {
  connectedCallback() {
    this.strokes = [];
    this.current = null;
    this.pointerID = null;
    this.settleTimer = 0;
    this.messageIndex = 0;
    this.build();
  }

  disconnectedCallback() {
    clearTimeout(this.settleTimer);
    this.resizeObserver.disconnect();
    this.canvas.remove();
    this.clearButton.remove();
  }

  build() {
    this.card = this.querySelector('.card');
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.clearButton = document.createElement('button');
    this.clearButton.type = 'button';
    this.clearButton.className = 'docs-clear';
    this.clearButton.setAttribute('aria-label', 'Clear drawing');
    this.clearButton.textContent = 'clear';
    this.card.append(this.canvas, this.clearButton);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.canvas.addEventListener('pointerdown', (event) => this.begin(event));
    this.canvas.addEventListener('pointermove', (event) => this.extend(event));
    this.canvas.addEventListener('pointerup', (event) => this.end(event));
    this.canvas.addEventListener('pointercancel', (event) => this.end(event));
    this.clearButton.addEventListener('click', () => this.clear());
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.redraw();
  }

  context() {
    const ctx = this.canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = INK_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }

  redraw() {
    const ctx = this.context();
    const rect = this.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const points of this.strokes) {
      if (points.length === 1) {
        this.dot(ctx, points[0]);
        continue;
      }
      ctx.beginPath();
      points.forEach(({ x, y }, index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }

  dot(ctx, { x, y }) {
    ctx.beginPath();
    ctx.arc(x, y, INK_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  clear() {
    clearTimeout(this.settleTimer);
    this.strokes = [];
    this.current = null;
    this.redraw();
  }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  begin(event) {
    if (this.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    clearTimeout(this.settleTimer);
    this.canvas.setPointerCapture(event.pointerId);
    this.pointerID = event.pointerId;
    this.current = [this.point(event)];
    this.strokes.push(this.current);
    this.dot(this.context(), this.current[0]);
  }

  extend(event) {
    if (!this.current || event.pointerId !== this.pointerID) return;
    const previous = this.current[this.current.length - 1];
    const next = this.point(event);
    this.current.push(next);
    const ctx = this.context();
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
  }

  end(event) {
    if (!this.current || event.pointerId !== this.pointerID) return;
    this.current = null;
    this.settleTimer = setTimeout(() => this.showReply(this.nextMessage()), SETTLE_MS);
  }

  nextMessage() {
    const message = FILING_MESSAGES[this.messageIndex];
    this.messageIndex = (this.messageIndex + 1) % FILING_MESSAGES.length;
    return message;
  }

  anchorX() {
    const xs = this.strokes.flat().map(({ x }) => x);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  }

  showReply(text) {
    const message = document.createElement('span');
    message.className = 'docs-message';
    message.textContent = text;
    this.card.append(message);

    const card = this.card.getBoundingClientRect();
    const heading = this.querySelector('.card-title').getBoundingClientRect();
    const description = this.querySelector('.card-line').getBoundingClientRect();
    const bandTop = heading.bottom - card.top - this.card.clientTop + MARGIN_PX / 2;
    const bandBottom = description.top - card.top - this.card.clientTop - MARGIN_PX / 2;
    const top = bandBottom - message.offsetHeight;
    const half = message.offsetWidth / 2;
    message.style.left = `${Math.max(half + MARGIN_PX, Math.min(this.anchorX(), this.card.clientWidth - half - MARGIN_PX))}px`;
    message.style.top = `${top}px`;

    const rise = reducedMotion.matches ? 0 : Math.max(0, Math.min(RISE_PX, top - bandTop));
    message
      .animate(
        [
          { opacity: 0, transform: 'translateY(0)' },
          { opacity: 1, transform: 'translateY(0)', offset: 0.25 },
          { opacity: 0, transform: `translateY(${-rise}px)` },
        ],
        { duration: FADE_MS, easing: 'ease-out' },
      )
      .finished.then(() => message.remove(), () => message.remove());
  }
}

customElements.define('wkt-docs-card', WKTDocsCard);
