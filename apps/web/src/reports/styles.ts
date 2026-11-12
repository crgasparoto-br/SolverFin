export const solverFinReportsCss = `
.solverfin-reports {
  display: grid;
  gap: 24px;
  color: #172033;
}

.solverfin-reports__header {
  display: grid;
  gap: 8px;
}

.solverfin-reports__title {
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.2;
}

.solverfin-reports__description,
.solverfin-reports__period {
  margin: 0;
  color: #5a6475;
}

.solverfin-reports__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.solverfin-reports__metric {
  border: 1px solid #d8dde7;
  border-radius: 8px;
  padding: 16px;
  background: #ffffff;
}

.solverfin-reports__metric-label {
  display: block;
  color: #5a6475;
  font-size: 0.875rem;
}

.solverfin-reports__metric-value {
  display: block;
  margin-top: 8px;
  font-size: 1.25rem;
  font-weight: 700;
}

.solverfin-reports__section {
  display: grid;
  gap: 12px;
}

.solverfin-reports__section-title {
  margin: 0;
  font-size: 1rem;
}

.solverfin-reports__category-list,
.solverfin-reports__timeline {
  display: grid;
  gap: 10px;
}

.solverfin-reports__category-row,
.solverfin-reports__month-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid #d8dde7;
  border-radius: 8px;
  padding: 12px;
  background: #ffffff;
}

.solverfin-reports__row-title {
  margin: 0;
  font-weight: 700;
}

.solverfin-reports__row-detail {
  margin: 4px 0 0;
  color: #5a6475;
  font-size: 0.875rem;
}

.solverfin-reports__progress {
  overflow: hidden;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #e7ebf2;
}

.solverfin-reports__progress-value {
  height: 100%;
  border-radius: inherit;
  background: #1d7f5f;
}

.solverfin-reports__progress-value--warning {
  background: #b42318;
}

.solverfin-reports__state {
  border: 1px dashed #b8c0cc;
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  background: #f8fafc;
}

@media (max-width: 640px) {
  .solverfin-reports__category-row,
  .solverfin-reports__month-row {
    grid-template-columns: 1fr;
  }
}
`;
