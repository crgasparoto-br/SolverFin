export const solverFinDashboardCss = `
.sf-dashboard {
  display: grid;
  gap: var(--sf-space-6);
}

.sf-dashboard-header {
  align-items: end;
  display: flex;
  gap: var(--sf-space-4);
  justify-content: space-between;
}

.sf-dashboard-title {
  color: var(--sf-color-text);
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.2;
  margin: 0;
}

.sf-dashboard-period {
  color: var(--sf-color-muted-text);
  font-size: 0.875rem;
  margin: var(--sf-space-1) 0 0;
}

.sf-dashboard-summary-grid {
  display: grid;
  gap: var(--sf-space-4);
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.sf-dashboard-card {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-lg);
  display: grid;
  gap: var(--sf-space-2);
  min-width: 0;
  padding: var(--sf-space-4);
}

.sf-dashboard-card-label {
  color: var(--sf-color-muted-text);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.sf-dashboard-card-value {
  color: var(--sf-color-text);
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.sf-dashboard-card-detail {
  color: var(--sf-color-muted-text);
  font-size: 0.875rem;
  line-height: 1.5;
  margin: 0;
}

.sf-dashboard-availability {
  background: var(--sf-color-dark-surface);
  border-radius: var(--sf-radius-lg);
  color: white;
  display: grid;
  gap: var(--sf-space-4);
  grid-template-columns: minmax(0, 1fr) auto;
  padding: var(--sf-space-5);
}

.sf-dashboard-availability strong {
  display: block;
  font-size: 2rem;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.sf-dashboard-confidence {
  align-self: start;
  background: rgba(245, 158, 11, 0.18);
  border: 1px solid rgba(245, 158, 11, 0.48);
  border-radius: var(--sf-radius-full);
  color: #fde68a;
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.375rem 0.625rem;
  white-space: nowrap;
}

.sf-dashboard-panels {
  display: grid;
  gap: var(--sf-space-4);
  grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.6fr);
}

.sf-dashboard-list {
  display: grid;
  gap: var(--sf-space-3);
  list-style: none;
  margin: 0;
  padding: 0;
}

.sf-dashboard-list-item {
  align-items: center;
  border-top: 1px solid var(--sf-color-border);
  display: flex;
  gap: var(--sf-space-3);
  justify-content: space-between;
  min-width: 0;
  padding-top: var(--sf-space-3);
}

.sf-dashboard-list-item:first-child {
  border-top: 0;
  padding-top: 0;
}

.sf-dashboard-meter {
  background: var(--sf-color-background);
  border-radius: var(--sf-radius-full);
  height: 0.5rem;
  overflow: hidden;
}

.sf-dashboard-meter-fill {
  background: var(--sf-color-secondary);
  height: 100%;
  max-width: 100%;
}

.sf-dashboard-state {
  align-items: center;
  background: var(--sf-color-surface);
  border: 1px dashed var(--sf-color-border);
  border-radius: var(--sf-radius-lg);
  display: grid;
  gap: var(--sf-space-3);
  justify-items: center;
  min-height: 18rem;
  padding: var(--sf-space-8);
  text-align: center;
}

@media (max-width: 64rem) {
  .sf-dashboard-summary-grid,
  .sf-dashboard-panels {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 48rem) {
  .sf-dashboard-header,
  .sf-dashboard-availability,
  .sf-dashboard-summary-grid,
  .sf-dashboard-panels {
    grid-template-columns: 1fr;
  }

  .sf-dashboard-header,
  .sf-dashboard-list-item {
    align-items: stretch;
    flex-direction: column;
  }

  .sf-dashboard-availability strong,
  .sf-dashboard-card-value {
    font-size: 1.25rem;
  }

  .sf-dashboard-confidence {
    justify-self: start;
  }
}
`;
