import { getTheme, onThemeChange } from '../theme.js';

const WORKTREES = [
  { branch: 'main', added: 0, removed: 0, issue: 'Clean tree, up to date with origin.' },
  { branch: 'feat/fuzzy-switch', added: 42, removed: 7, issue: 'Fuzzy finder ranks recent workspaces first.' },
  { branch: 'fix/stale-symlink', added: 9, removed: 3, issue: 'Repairs docs links that point at deleted workspaces.' },
  { branch: 'chore/clean-merged', added: 15, removed: 88, issue: 'Clean removes only merged, tidy workspaces.' },
];
const VIEWPORT_MARGIN_PX = 8;

class WKTCard extends HTMLElement {
  connectedCallback() {
    this.heading = this.querySelector('.card-title');
    this.description = this.querySelector('.card-line');
    this.original = { title: this.heading.textContent, line: this.description.textContent };
    this.index = 0;
    this.activeIndex = 0;
    this.build();
    this.unsubscribe = onThemeChange(() => this.render());
    this.onOutsidePointer = (event) => {
      if (!this.switcher.contains(event.target)) this.close();
    };
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe();
    document.removeEventListener('pointerdown', this.onOutsidePointer);
    this.diffstat.remove();
  }

  build() {
    this.switcher = document.createElement('span');
    this.switcher.className = 'wkt-switch';

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'wkt-switch-button';
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.button.setAttribute('aria-expanded', 'false');
    this.branchLabel = document.createElement('span');
    const caret = document.createElement('span');
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = ' ▾';
    this.button.append(this.branchLabel, caret);

    this.list = document.createElement('ul');
    this.list.className = 'wkt-switch-list';
    this.list.id = 'wkt-switch-list';
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'worktree');
    this.list.tabIndex = -1;
    this.list.hidden = true;
    this.options = WORKTREES.map(({ branch }, index) => {
      const option = document.createElement('li');
      option.id = `wkt-switch-option-${index}`;
      option.setAttribute('role', 'option');
      option.className = 'wkt-switch-option';
      const mark = document.createElement('span');
      mark.className = 'wkt-switch-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = '*';
      option.append(mark, branch);
      option.addEventListener('click', () => this.select(index));
      return option;
    });
    this.list.append(...this.options);
    this.switcher.append(this.button, this.list);
    this.button.setAttribute('aria-controls', this.list.id);

    this.diffstat = document.createElement('span');
    this.diffstat.className = 'wkt-diffstat wkt-playground';
    this.added = document.createElement('span');
    this.added.className = 'wkt-added';
    this.removed = document.createElement('span');
    this.removed.className = 'wkt-removed';
    this.diffstat.append(this.added, this.removed);
    this.heading.after(this.diffstat);

    this.button.addEventListener('click', () => (this.list.hidden ? this.open() : this.close()));
    this.button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.open();
      }
    });
    this.list.addEventListener('keydown', (event) => this.onListKey(event));
  }

  onListKey(event) {
    const last = WORKTREES.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.setActive(Math.min(this.activeIndex + 1, last));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.setActive(Math.max(this.activeIndex - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        this.setActive(0);
        break;
      case 'End':
        event.preventDefault();
        this.setActive(last);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.select(this.activeIndex);
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        this.button.focus();
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  open() {
    this.list.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.list.style.left = '0px';
    const overflow = this.list.getBoundingClientRect().right - (document.documentElement.clientWidth - VIEWPORT_MARGIN_PX);
    if (overflow > 0) this.list.style.left = `${-overflow}px`;
    this.setActive(this.index);
    this.list.focus();
    document.addEventListener('pointerdown', this.onOutsidePointer);
  }

  close() {
    if (this.list.hidden) return;
    this.list.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this.onOutsidePointer);
  }

  setActive(index) {
    this.activeIndex = index;
    this.options.forEach((option, optionIndex) => option.classList.toggle('wkt-switch-active', optionIndex === index));
    this.list.setAttribute('aria-activedescendant', this.options[index].id);
  }

  select(index) {
    this.index = index;
    this.close();
    this.button.focus();
    this.render();
  }

  render() {
    if (getTheme() !== 'dark') {
      this.close();
      this.heading.replaceChildren(this.original.title);
      this.description.textContent = this.original.line;
      return;
    }
    const worktree = WORKTREES[this.index];
    this.branchLabel.textContent = worktree.branch;
    this.button.setAttribute('aria-label', `worktree ${worktree.branch}`);
    this.options.forEach((option, index) => option.setAttribute('aria-selected', String(index === this.index)));
    if (this.switcher.parentNode !== this.heading) this.heading.replaceChildren('wkt switch ', this.switcher);
    this.description.textContent = worktree.issue;
    this.added.textContent = `+${worktree.added}`;
    this.removed.textContent = `−${worktree.removed}`;
  }
}

customElements.define('wkt-card', WKTCard);
