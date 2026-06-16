import type { SolverFinComponentRecipes } from "./components.js";

export interface ComponentExample {
  name: string;
  purpose: string;
  recipeKey: keyof SolverFinComponentRecipes;
  markup: string;
  notes: readonly string[];
}

export const solverFinDesignSystemExamples = [
  {
    name: "Primary action button",
    purpose:
      "Confirmar acoes financeiras revisaveis, como salvar uma conta ou registrar um lancamento.",
    recipeKey: "button",
    markup: `<button class="sf-button sf-button-primary sf-focus-ring" type="button">Salvar alteracoes</button>`,
    notes: [
      "Use texto direto sobre a acao.",
      "Durante envio, mantenha largura estavel e exponha estado ocupado.",
    ],
  },
  {
    name: "Input with validation",
    purpose: "Coletar dados de formulario com label visivel, ajuda e erro perto do campo.",
    recipeKey: "input",
    markup: `<label class="sf-field">
  <span class="sf-label">Nome da conta</span>
  <input class="sf-control sf-focus-ring" aria-describedby="account-name-help" name="accountName" />
  <span class="sf-help-text" id="account-name-help">Use um nome facil de reconhecer.</span>
</label>`,
    notes: ["Nao substitua label por placeholder.", "Mensagens de erro devem orientar a correcao."],
  },
  {
    name: "Empty table",
    purpose: "Orientar o primeiro uso sem mostrar dados ficticios como se fossem reais.",
    recipeKey: "emptyState",
    markup: `<section class="sf-empty-state" aria-live="polite">
  <strong>Nenhuma categoria cadastrada</strong>
  <span>Crie categorias para organizar receitas e despesas.</span>
</section>`,
    notes: [
      "Explique o que a pessoa pode fazer em seguida.",
      "Nao use exemplos com dados financeiros reais.",
    ],
  },
  {
    name: "Responsive data table",
    purpose: "Listar dados financeiros tabulares com leitura boa em telas pequenas.",
    recipeKey: "table",
    markup: `<div class="sf-table-wrap">
  <table class="sf-table">
    <thead><tr><th>Categoria</th><th>Status</th></tr></thead>
    <tbody><tr><td>Alimentacao</td><td>Ativa</td></tr></tbody>
  </table>
</div>`,
    notes: [
      "Use tabela apenas para dados tabulares.",
      "Mantenha scroll horizontal controlado em mobile.",
    ],
  },
  {
    name: "Toast feedback",
    purpose: "Confirmar resultado de uma acao sem interromper o fluxo principal.",
    recipeKey: "toast",
    markup: `<aside role="status" aria-live="polite">Categoria salva com sucesso.</aside>`,
    notes: [
      "Use linguagem curta.",
      "Erros bloqueantes devem ficar junto ao formulario quando possivel.",
    ],
  },
] as const satisfies readonly ComponentExample[];
