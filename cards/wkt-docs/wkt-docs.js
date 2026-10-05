const INK = '#9fb8e6';
const INK_WIDTH = 2;
const SETTLE_MS = 900;
const FADE_MS = 1600;
const RISE_PX = 16;
const MARGIN_PX = 8;
const FILING_MESSAGES = ['submitted to plan', 'created idea', 'filed a bug', 'wrote a handoff', 'archived plan'];
const GREETING_REPLIES = new Map([
  ['hi', 'hello!'],
  ['hey', 'hello!'],
  ['hello', 'hi!'],
]);
const RECOGNIZER_CONSTRAINTS = { languages: ['en'] };

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let recognizerPromise = null;
let recognitionUnsupported = !('queryHandwritingRecognizer' in navigator);

async function createRecognizer() {
  try {
    if (!(await navigator.queryHandwritingRecognizer(RECOGNIZER_CONSTRAINTS))) return null;
    return await navigator.createHandwritingRecognizer(RECOGNIZER_CONSTRAINTS);
  } catch {
    return null;
  }
}

async function getRecognizer() {
  if (recognitionUnsupported) return null;
  recognizerPromise ??= createRecognizer();
  const recognizer = await recognizerPromise;
  if (!recognizer) recognitionUnsupported = true;
  return recognizer;
}

async function recognize(strokes) {
  const recognizer = await getRecognizer();
  if (!recognizer) return null;
  try {
    const drawing = recognizer.startDrawing();
    try {
      for (const points of strokes) {
        const stroke = new HandwritingStroke();
        points.forEach((point) => stroke.addPoint(point));
        drawing.addStroke(stroke);
      }
      const predictions = await drawing.getPrediction();
      return predictions[0]?.text ?? '';
    } finally {
      drawing.clear();
    }
  } catch {
    recognitionUnsupported = true;
    return null;
  }
}

function normalize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
}

class WKTDocsCard extends HTMLElement {
  connectedCallback() {
    this.strokes = [];
    this.current = null;
    this.origin = 0;
    this.settleTimer = 0;
    this.generation = 0;
    this.fade = null;
    this.messageIndex = 0;
    this.build();
    this.setMode('input');
    getRecognizer().then((recognizer) => {
      if (recognizer) this.setMode('canvas');
    });
  }

  disconnectedCallback() {
    clearTimeout(this.settleTimer);
    this.resizeObserver.disconnect();
    this.canvas.remove();
    this.form.remove();
  }

  setMode(mode) {
    this.dataset.mode = mode;
  }

  build() {
    this.card = this.querySelector('.card');
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.card.append(this.canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.canvas.addEventListener('pointerdown', (event) => this.begin(event));
    this.canvas.addEventListener('pointermove', (event) => this.extend(event));
    this.canvas.addEventListener('pointerup', (event) => this.end(event));
    this.canvas.addEventListener('pointercancel', (event) => this.end(event));

    this.form = document.createElement('form');
    this.form.className = 'docs-note';
    this.form.innerHTML = '<label><span class="docs-sr">Note</span><input type="text" autocomplete="off" maxlength="40" placeholder="jot a note\u2026"></label>';
    this.input = this.form.querySelector('input');
    this.card.querySelector('.card-title').after(this.form);
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitNote();
    });
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

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    const t = Math.round(event.timeStamp - this.origin);
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, t };
  }

  begin(event) {
    if (this.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    this.generation++;
    clearTimeout(this.settleTimer);
    if (this.fade) this.finishFade();
    if (!this.strokes.length) this.origin = event.timeStamp;
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
    this.settleTimer = setTimeout(() => this.respond(), SETTLE_MS);
  }

  async respond() {
    const generation = this.generation;
    const strokes = this.strokes.map((points) => points.map((point) => ({ ...point })));
    const text = await recognize(strokes);
    if (generation !== this.generation) return;
    if (text === null) this.setMode('input');
    const bounds = this.strokeBounds();
    this.showReply(this.replyFor(text ?? ''), (bounds.minX + bounds.maxX) / 2);
    this.fadeOut(this.canvas, () => {
      this.strokes = [];
      this.redraw();
    });
  }

  submitNote() {
    const text = this.input.value;
    if (!normalize(text)) return;
    const card = this.card.getBoundingClientRect();
    const field = this.input.getBoundingClientRect();
    const ghost = document.createElement('span');
    ghost.className = 'docs-ghost';
    ghost.textContent = text;
    ghost.style.left = `${field.left - card.left - this.card.clientLeft}px`;
    ghost.style.top = `${field.top - card.top - this.card.clientTop}px`;
    this.card.append(ghost);
    this.input.value = '';
    this.showReply(this.replyFor(text), (field.left + field.right) / 2 - card.left);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out' }).finished.then(
      () => ghost.remove(),
      () => ghost.remove(),
    );
  }

  replyFor(text) {
    return GREETING_REPLIES.get(normalize(text)) ?? this.nextFilingMessage();
  }

  nextFilingMessage() {
    const message = FILING_MESSAGES[this.messageIndex];
    this.messageIndex = (this.messageIndex + 1) % FILING_MESSAGES.length;
    return message;
  }

  showReply(text, anchorX) {
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
    message.style.left = `${Math.max(half + MARGIN_PX, Math.min(anchorX, this.card.clientWidth - half - MARGIN_PX))}px`;
    message.style.top = `${top}px`;

    const rise = reducedMotion.matches ? 0 : Math.max(0, Math.min(RISE_PX, top - bandTop));
    const options = { duration: FADE_MS, easing: 'ease-out' };
    message
      .animate(
        [
          { opacity: 0, transform: 'translateY(0)' },
          { opacity: 1, transform: 'translateY(0)', offset: 0.25 },
          { opacity: 0, transform: `translateY(${-rise}px)` },
        ],
        options,
      )
      .finished.then(() => message.remove(), () => message.remove());
  }

  fadeOut(element, onDone) {
    const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' });
    this.fade = { animation, onDone };
    animation.finished.then(() => this.finishFade(), () => {});
  }

  finishFade() {
    if (!this.fade) return;
    const { animation, onDone } = this.fade;
    this.fade = null;
    onDone();
    animation.cancel();
  }

  strokeBounds() {
    const points = this.strokes.flat();
    return {
      minX: Math.min(...points.map(({ x }) => x)),
      maxX: Math.max(...points.map(({ x }) => x)),
      minY: Math.min(...points.map(({ y }) => y)),
      maxY: Math.max(...points.map(({ y }) => y)),
    };
  }
}

customElements.define('wkt-docs-card', WKTDocsCard);
