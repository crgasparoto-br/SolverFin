# Visual gate evidence

- Commit: `local`
- Artifact: `statement-visual-evidence-local`
- Registered modules: 54
- Execution units: 60
- Coverage fingerprints: 60
- Failures: 0

| Scenario | Source scenario | Route | State | Layout | Interaction | Semantic proof | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core-pages::0-lancamentos-normal | core-pages | /lancamentos | normal | desktop-mobile | overflow-and-focus | passed | passed |
| core-pages::1-dashboard-normal | core-pages | /dashboard | normal | desktop-mobile | viewport-smoke | passed | passed |
| core-pages::2-cartoes-normal | core-pages | /cartoes | normal | desktop-mobile | viewport-smoke | passed | passed |
| core-pages::3-contas-normal | core-pages | /contas | normal | desktop-mobile | viewport-smoke | passed | passed |
| reports-category-evolution::0-relatorios-normal | reports-category-evolution | /relatorios | normal | desktop-mobile | keyboard-focus-overflow | passed | passed |
| reports-category-evolution::1-relatorios-empty | reports-category-evolution | /relatorios | empty | desktop | state-render | not-required | passed |
| reports-category-evolution::2-relatorios-error | reports-category-evolution | /relatorios | error | desktop | filter-error | not-required | passed |
| ui-primitives | ui-primitives | component://ui-primitives | long-content | desktop-mobile | keyboard-focus-dialog-overflow | not-required | passed |
| foundation-states | foundation-states | component://foundation-states | alternate | desktop-mobile | keyboard-focus-state-render | not-required | passed |
| cards-interface::0-cartoes-normal | cards-interface | /cartoes | normal | desktop-mobile | filters-modal | passed | passed |
| cards-interface::1-cartoes-empty | cards-interface | /cartoes | empty | desktop | filtered-empty | not-required | passed |
| transaction-group-layout | transaction-group-layout | /lancamentos | grouped | responsive | group-layout | not-required | passed |
| transaction-group-modal | transaction-group-modal | /lancamentos | normal | modal | dialog | not-required | passed |
| transaction-group-pending-fixes | transaction-group-pending-fixes | /lancamentos | pending | responsive | group-actions | not-required | passed |
| transaction-bulk-selection | transaction-bulk-selection | /lancamentos | selected | desktop | bulk-selection | not-required | passed |
| transaction-bulk-selection-keyboard | transaction-bulk-selection-keyboard | /lancamentos | selected | desktop | keyboard-focus | not-required | passed |
| transaction-bulk-selection-clearance | transaction-bulk-selection-clearance | /lancamentos | cleared | desktop | bulk-selection | not-required | passed |
| inbox-category-hierarchy | inbox-category-hierarchy | /inbox | normal | responsive | category-hierarchy | not-required | passed |
| inbox-ofx-review | inbox-ofx-review | /inbox | review | responsive | review-flow | not-required | passed |
| inbox-status-control | inbox-status-control | /inbox | status-change | responsive | status-control | not-required | passed |
| inbox-date-filter | inbox-date-filter | /inbox | filtered | responsive | filter | not-required | passed |
| accounts-cards-interface | accounts-cards-interface | /contas-cartoes | normal | desktop-mobile | keyboard-focus-modal | passed | passed |
| hover-states | hover-states | /lancamentos | interactive | desktop | hover-focus | not-required | passed |
| operational-installments | operational-installments | /lancamentos | installments | responsive | installment-flow | not-required | passed |
| operational-installments-keyboard | operational-installments-keyboard | /lancamentos | installments | desktop | keyboard-focus | not-required | passed |
| installment-grouping-guard | installment-grouping-guard | /lancamentos | grouped | responsive | grouping-guard | not-required | passed |
| manual-installments | manual-installments | /lancamentos | editing | dialog | submit-retry | not-required | passed |
| transfer-destination-visibility | transfer-destination-visibility | /lancamentos | transfer | responsive | cross-account-visibility | not-required | passed |
| ambiguous-recovery | ambiguous-recovery | /lancamentos | recoverable-error | dialog | recovery | not-required | passed |
| ambiguous-close | ambiguous-close | /lancamentos | recoverable-error | dialog | keyboard-focus | not-required | passed |
| non-idempotent-ambiguity | non-idempotent-ambiguity | /lancamentos | ambiguous | dialog | no-blind-retry | not-required | passed |
| reports-category-controls | reports-category-controls | /relatorios | filtered | responsive | filters | not-required | passed |
| reports-selected-view-navigation | reports-selected-view-navigation | /relatorios | normal | responsive | navigation | not-required | passed |
| reports-installments-regression | reports-installments-regression | /relatorios | normal | responsive | regression | not-required | passed |
| settings-interface | settings-interface | /configuracoes | normal | desktop-mobile | form-flow | passed | passed |
| settings-interface-reservations | settings-interface-reservations | /configuracoes | reserved | responsive | form-flow | not-required | passed |
| category-learning | category-learning | /inbox | learning | responsive | review-flow | not-required | passed |
| ai-review-queue | ai-review-queue | /inbox | review | responsive | review-flow | not-required | passed |
| ai-review-queue-states | ai-review-queue-states | /inbox | alternate | responsive | state-render | not-required | passed |
| financial-insights | financial-insights | /lancamentos | insights | responsive | drilldown | passed | passed |
| financial-assistant | financial-assistant | /assistente | normal | desktop-mobile | keyboard-focus | passed | passed |
| financial-assistant-cancel | financial-assistant-cancel | /assistente | processing | responsive | cancel | not-required | passed |
| financial-assistant-zoom | financial-assistant-zoom | /assistente | normal | zoom-200-reflow | reflow-overflow | not-required | passed |
| budgets-pilot-baseline | budgets-pilot-baseline | /orcamentos | normal | desktop-mobile | viewport-smoke | passed | passed |
| productive-auth-login | productive-auth-login | /login | normal | responsive | authentication | not-required | passed |
| account-remuneration | account-remuneration | /lancamentos | remuneration | desktop | disclosure | passed | passed |
| account-remuneration-mobile | account-remuneration-mobile | /lancamentos | remuneration | mobile | disclosure | passed | passed |
| account-edit | account-edit | /contas-cartoes | editing | responsive | form-modal | not-required | passed |
| sidebar-navigation | sidebar-navigation | shell://authenticated | normal | desktop-mobile | keyboard-navigation | passed | passed |
| inbox-csv-review | inbox-csv-review | /inbox | review | responsive | review-flow | not-required | passed |
| inbox-interface-refinement | inbox-interface-refinement | /inbox | normal | desktop-mobile | keyboard-focus-overflow | passed | passed |
| inbox-interface-accessibility | inbox-interface-accessibility | /inbox | normal | responsive | keyboard-focus-accessibility | passed | passed |
| bank-message-ai-inbox | bank-message-ai-inbox | /inbox | review | responsive | review-flow | passed | passed |
| inbox-content-contrast | inbox-content-contrast | /inbox | normal | responsive | content-contrast | not-required | passed |
| categories-interface | categories-interface | /categorias | normal | desktop-mobile | keyboard-tooltips | passed | passed |
| cards-interface-adversarial | cards-interface-adversarial | /cartoes | long-content | desktop-1366x768 | keyboard-focus-overflow | passed | passed |
| dashboard-empty-state | dashboard-empty-state | /dashboard | empty | desktop-mobile | state-render | passed | passed |
| accounts-cards-empty-state | accounts-cards-empty-state | /contas-cartoes | empty | desktop-mobile | state-render | passed | passed |
| budgets-empty-state | budgets-empty-state | /orcamentos | empty | desktop-mobile | state-render | passed | passed |
| statement-profile-keyboard | statement-profile-keyboard | /lancamentos | normal | desktop-mobile | keyboard-profile-context | passed | passed |
