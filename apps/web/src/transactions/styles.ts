export const solverFinTransactionsCss = `
.sf-transactions {
  display: grid;
  gap: var(--sf-space-6);
}

.sf-transactions-header {
  align-items: end;
  display: flex;
  gap: var(--sf-space-4);
  justify-content: space-between;
}

.sf-transactions-title {
  color: var(--sf-color-text);
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.2;
  margin: 0;
}

.sf-transactions-description {
  color: var(--sf-color-muted-text);
  font-size: 0.875rem;
  line-height: 1.5;
  margin: var(--sf-space-1) 0 0;
}

.sf-transactions-summary-grid,
.sf-transactions-filter-grid {
  display: grid;
  gap: var(--sf-space-4);
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.sf-transactions-card,
.sf-transactions-panel,
.sf-transactions-form {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-lg);
  display: grid;
  gap: var(--sf-space-3);
  min-width: 0;
  padding: var(--sf-space-4);
}

.sf-transactions-card strong {
  color: var(--sf-color-text);
  display: block;
  font-size: 1.5rem;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.sf-transactions-layout {
  display: grid;
  gap: var(--sf-space-4);
  grid-template-columns: minmax(0, 1fr) minmax(20rem, 0.42fr);
}

.sf-transactions-list {
  display: grid;
  gap: var(--sf-space-3);
  list-style: none;
  margin: 0;
  padding: 0;
}

.sf-transactions-item {
  align-items: center;
  border-top: 1px solid var(--sf-color-border);
  display: flex;
  gap: var(--sf-space-3);
  justify-content: space-between;
  min-width: 0;
  padding-top: var(--sf-space-3);
}

.sf-transactions-item:first-child {
  border-top: 0;
  padding-top: 0;
}

.sf-transactions-item-main {
  display: grid;
  gap: var(--sf-space-1);
  min-width: 0;
}

.sf-transactions-item-title {
  color: var(--sf-color-text);
  font-weight: 800;
  overflow-wrap: anywhere;
}

.sf-transactions-item-detail {
  color: var(--sf-color-muted-text);
  font-size: 0.875rem;
  line-height: 1.5;
}

.sf-transactions-amount {
  font-weight: 800;
  white-space: nowrap;
}

.sf-transactions-amount-income {
  color: var(--sf-color-secondary);
}

.sf-transactions-amount-expense {
  color: var(--sf-color-danger);
}

.sf-transactions-badge {
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-full);
  color: var(--sf-color-muted-text);
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.375rem 0.625rem;
  white-space: nowrap;
}

.sf-transactions-form-grid {
  display: grid;
  gap: var(--sf-space-3);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sf-transactions-feedback {
  background: var(--sf-color-success-surface);
  border: 1px solid var(--sf-color-secondary);
  border-radius: var(--sf-radius-md);
  color: var(--sf-color-primary);
  font-weight: 700;
  padding: var(--sf-space-3) var(--sf-space-4);
}

.sf-transactions-state {
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
  .sf-transactions-summary-grid,
  .sf-transactions-filter-grid,
  .sf-transactions-layout {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 48rem) {
  .sf-transactions-header,
  .sf-transactions-item {
    align-items: stretch;
    flex-direction: column;
  }

  .sf-transactions-summary-grid,
  .sf-transactions-filter-grid,
  .sf-transactions-layout,
  .sf-transactions-form-grid {
    grid-template-columns: 1fr;
  }

  .sf-transactions-amount {
    white-space: normal;
  }
}
`;
