export const solverFinAppShellCss = `
.sf-shell {
  background: var(--sf-color-background);
  color: var(--sf-color-text);
  display: grid;
  min-height: 100svh;
}

.sf-shell-layout {
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr);
  min-height: 100svh;
}

.sf-shell-sidebar {
  background: var(--sf-color-dark-surface);
  color: white;
  display: flex;
  flex-direction: column;
  gap: var(--sf-space-6);
  padding: var(--sf-space-5);
}

.sf-shell-brand {
  align-items: center;
  display: flex;
  font-size: 1.125rem;
  font-weight: 800;
  gap: var(--sf-space-2);
  letter-spacing: 0;
}

.sf-shell-nav-section {
  display: grid;
  gap: var(--sf-space-2);
}

.sf-shell-nav-heading {
  color: rgba(255, 255, 255, 0.68);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.sf-shell-nav-link {
  border-radius: var(--sf-radius-md);
  color: rgba(255, 255, 255, 0.82);
  display: flex;
  font-weight: 700;
  justify-content: space-between;
  min-height: 2.5rem;
  padding: 0.625rem 0.75rem;
  text-decoration: none;
}

.sf-shell-nav-link[aria-current="page"] {
  background: rgba(34, 211, 238, 0.14);
  color: white;
}

.sf-shell-main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
}

.sf-shell-header {
  align-items: center;
  background: var(--sf-color-surface);
  border-bottom: 1px solid var(--sf-color-border);
  display: flex;
  gap: var(--sf-space-4);
  justify-content: space-between;
  min-height: 4rem;
  padding: 0 var(--sf-space-6);
}

.sf-shell-header-title {
  display: grid;
  gap: 0.125rem;
  min-width: 0;
}

.sf-shell-header-title strong {
  font-size: 1rem;
}

.sf-shell-header-title span {
  color: var(--sf-color-muted-text);
  font-size: 0.875rem;
}

.sf-shell-context {
  align-items: center;
  display: flex;
  gap: var(--sf-space-3);
  min-width: 0;
}

.sf-shell-content {
  display: grid;
  gap: var(--sf-space-6);
  padding: var(--sf-space-6);
}

.sf-shell-state {
  align-content: center;
  display: grid;
  gap: var(--sf-space-4);
  justify-items: center;
  min-height: min(32rem, 80svh);
  padding: var(--sf-space-6);
  text-align: center;
}

.sf-shell-state h1 {
  font-size: 1.5rem;
  margin: 0;
}

.sf-shell-state p {
  color: var(--sf-color-muted-text);
  margin: 0;
  max-width: 34rem;
}

.sf-shell-mobile-bar {
  align-items: center;
  background: var(--sf-color-surface);
  border-top: 1px solid var(--sf-color-border);
  bottom: 0;
  display: none;
  gap: var(--sf-space-1);
  grid-template-columns: repeat(3, minmax(0, 1fr));
  left: 0;
  padding: var(--sf-space-2);
  position: sticky;
  right: 0;
}

@media (max-width: 47.99rem) {
  .sf-shell-layout {
    grid-template-columns: 1fr;
  }

  .sf-shell-sidebar {
    display: none;
  }

  .sf-shell-header {
    min-height: 3.5rem;
    padding: 0 var(--sf-space-4);
  }

  .sf-shell-context {
    display: none;
  }

  .sf-shell-content {
    padding: var(--sf-space-4) var(--sf-space-4) var(--sf-space-12);
  }

  .sf-shell-mobile-bar {
    display: grid;
  }
}
`;
