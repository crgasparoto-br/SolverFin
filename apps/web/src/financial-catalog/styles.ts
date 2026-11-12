export const solverFinFinancialCatalogCss = `
.sf-catalog {
  display: grid;
  gap: var(--sf-space-6);
}

.sf-catalog-header {
  align-items: end;
  display: flex;
  gap: var(--sf-space-4);
  justify-content: space-between;
}

.sf-catalog-title {
  color: var(--sf-color-text);
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.2;
  margin: 0;
}

.sf-catalog-description {
  color: var(--sf-color-muted-text);
  font-size: 0.875rem;
  line-height: 1.5;
  margin: var(--sf-space-1) 0 0;
}

.sf-catalog-summary-grid {
  display: grid;
  gap: var(--sf-space-4);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.sf-catalog-summary,
.sf-catalog-panel,
.sf-catalog-form {
  background: var(--sf-color-surface);
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-lg);
  display: grid;
  gap: var(--sf-space-3);
  min-width: 0;
  padding: var(--sf-space-4);
}

.sf-catalog-summary strong {
  color: var(--sf-color-text);
  display: block;
  font-size: 1.75rem;
  line-height: 1.2;
}

.sf-catalog-layout {
  display: grid;
  gap: var(--sf-space-4);
  grid-template-columns: minmax(0, 1fr) minmax(20rem, 0.42fr);
}

.sf-catalog-list {
  display: grid;
  gap: var(--sf-space-3);
  list-style: none;
  margin: 0;
  padding: 0;
}

.sf-catalog-item {
  align-items: center;
  border-top: 1px solid var(--sf-color-border);
  display: flex;
  gap: var(--sf-space-3);
  justify-content: space-between;
  min-width: 0;
  padding-top: var(--sf-space-3);
}

.sf-catalog-item:first-child {
  border-top: 0;
  padding-top: 0;
}

.sf-catalog-item-main {
  display: grid;
  gap: var(--sf-space-1);
  min-width: 0;
}

.sf-catalog-item-title {
  color: var(--sf-color-text);
  font-weight: 800;
  overflow-wrap: anywhere;
}

.sf-catalog-item-detail {
  color: var(--sf-color-muted-text);
  font-size: 0.875rem;
  line-height: 1.5;
}

.sf-catalog-badge {
  border: 1px solid var(--sf-color-border);
  border-radius: var(--sf-radius-full);
  color: var(--sf-color-muted-text);
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.375rem 0.625rem;
  white-space: nowrap;
}

.sf-catalog-badge-active {
  background: var(--sf-color-success-surface);
  border-color: var(--sf-color-secondary);
  color: var(--sf-color-primary);
}

.sf-catalog-form-grid {
  display: grid;
  gap: var(--sf-space-3);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sf-catalog-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sf-space-3);
  justify-content: flex-end;
}

.sf-catalog-feedback {
  background: var(--sf-color-success-surface);
  border: 1px solid var(--sf-color-secondary);
  border-radius: var(--sf-radius-md);
  color: var(--sf-color-primary);
  font-weight: 700;
  padding: var(--sf-space-3) var(--sf-space-4);
}

.sf-catalog-state {
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
  .sf-catalog-layout,
  .sf-catalog-summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 48rem) {
  .sf-catalog-header,
  .sf-catalog-item {
    align-items: stretch;
    flex-direction: column;
  }

  .sf-catalog-form-grid {
    grid-template-columns: 1fr;
  }

  .sf-catalog-form-actions {
    justify-content: stretch;
  }

  .sf-catalog-form-actions .sf-button {
    width: 100%;
  }
}
`;
