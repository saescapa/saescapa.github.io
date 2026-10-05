import { getTheme, onThemeChange } from '../theme.js';

const WORKTREES = [
  { branch: 'main', added: 0, removed: 0, issue: 'Clean tree, up to date with origin.' },
  { branch: 'feat/fuzzy-switch', added: 42, removed: 7, issue: 'Fuzzy finder ranks recent workspaces first.' },
  { branch: 'fix/stale-symlink', added: 9, removed: 3, issue: 'Repairs docs links that point at deleted workspaces.' },
  { branch: 'chore/clean-merged', added: 15, removed: 88, issue: 'Clean removes only merged, tidy workspaces.' },
];

class WKTCard extends HTMLElement {
  connectedCallback() {
    this.heading = this.querySelector('.card-title');
    this.description = this.querySelector('.card-line');
    this.original = { title: this.heading.textContent, line: this.description.textContent };
    this.build();
    this.unsubscribe = onThemeChange(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe();
    this.picker.remove();
    this.diffstat.remove();
  }

  build() {
    this.picker = document.createElement('label');
    this.picker.className = 'wkt-picker wkt-playground';
    this.picker.append('worktree');
    this.select = document.createElement('select');
    this.select.append(...WORKTREES.map(({ branch }) => new Option(branch, branch)));
    this.picker.append(this.select);

    this.diffstat = document.createElement('span');
    this.diffstat.className = 'wkt-diffstat wkt-playground';
    this.added = document.createElement('span');
    this.added.className = 'wkt-added';
    this.removed = document.createElement('span');
    this.removed.className = 'wkt-removed';
    this.diffstat.append(this.added, this.removed);

    this.querySelector('.card').prepend(this.picker);
    this.heading.after(this.diffstat);
    this.select.addEventListener('change', () => this.render());
  }

  render() {
    if (getTheme() !== 'dark') {
      this.heading.textContent = this.original.title;
      this.description.textContent = this.original.line;
      return;
    }
    const worktree = WORKTREES.find(({ branch }) => branch === this.select.value);
    this.heading.textContent = worktree.branch === 'main' ? 'wkt' : `wkt switch ${worktree.branch}`;
    this.description.textContent = worktree.issue;
    this.added.textContent = `+${worktree.added}`;
    this.removed.textContent = `−${worktree.removed}`;
  }
}

customElements.define('wkt-card', WKTCard);
