import { apiGet } from "./api.js";
import { icon } from "./icons.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";

interface AssistantAnswer {
  status: "answered" | "needs_review" | "blocked";
  intent: string;
  confidence: "high" | "medium" | "low";
  answer: string;
  period?: { startOn: string; endOn: string };
  filters?: readonly string[];
  assumptions: readonly string[];
  sources: readonly string[];
  limitations: readonly string[];
}

interface AssistantTurn {
  sequence: number;
  status: string;
  question: string;
  intent: string;
  filters: Record<string, unknown>;
  response: AssistantAnswer | null;
  createdAt: string;
  answeredAt: string | null;
}

interface AssistantConversation {
  id: string;
  status: string;
  version: number;
  currency: string | null;
  expiresAt: string;
  turns: AssistantTurn[];
}

export async function renderFinancialAssistantPage(token: string, url?: URL): Promise<string> {
  const result = await apiGet<{ conversation: AssistantConversation | null }>(
    token,
    assistantApiPath(url),
  );
  const conversation = result.ok ? result.data.conversation : null;
  const initialError = result.ok ? undefined : result.error;

  return renderAuthenticatedShellDocument({
    activePathname: "/assistente",
    currentLabel: "Assistente financeiro",
    styles: `${sharedShellStyles()}\n${financialAssistantPageStyles()}`,
    content: `
      <section class="assistant-heading">
        <div>
          <p class="eyebrow">Assistente financeiro</p>
          <h1>Pergunte sobre seus dados financeiros</h1>
          <p class="muted">Consulte períodos, gastos, saldo, faturas, parcelas e recorrências sem alterar nenhum registro.</p>
        </div>
        <span class="assistant-readonly">Somente leitura</span>
      </section>

      <section class="assistant-layout" data-financial-assistant data-conversation-id="${escapeHtml(conversation?.id ?? "")}">
        <div class="assistant-thread-panel panel">
          <div class="assistant-thread-toolbar">
            <div>
              <h2>Conversa</h2>
              <p class="muted">As respostas mostram período, premissas, fontes internas e limitações.</p>
            </div>
            <div class="assistant-context-actions" aria-label="Ações da conversa">
              <button type="button" class="button-neutral" data-assistant-cancel${conversation ? "" : " disabled"} title="Cancelar o contexto atual">${icon("x", 14)} Cancelar</button>
              <button type="button" class="button-neutral" data-assistant-clear${conversation ? "" : " disabled"} title="Limpar o contexto atual">${icon("trash-2", 14)} Limpar</button>
              <button type="button" class="button-neutral" data-assistant-new title="Iniciar um novo contexto">${icon("refresh-cw", 14)} Novo contexto</button>
            </div>
          </div>

          <div class="assistant-live-status" role="status" aria-live="polite" data-assistant-status>${initialError ? escapeHtml(initialError) : renderConversationStatus(conversation)}</div>
          <div class="assistant-thread" role="log" aria-live="polite" aria-relevant="additions text" data-assistant-thread>
            ${renderConversation(conversation, initialError)}
          </div>
        </div>

        <aside class="assistant-help panel" aria-label="Sugestões de perguntas">
          <h2>Experimente perguntar</h2>
          <div class="assistant-prompts">
            ${renderPromptButton("Resumo deste mês")}
            ${renderPromptButton("Quanto gastei este mês?")}
            ${renderPromptButton("Qual meu saldo projetado este mês?")}
            ${renderPromptButton("Tenho assinaturas recorrentes?")}
            ${renderPromptButton("Quanto posso gastar hoje?")}
          </div>
          <p class="assistant-safety-note">O assistente consulta dados do perfil financeiro ativo. Para criar, editar, pagar, conciliar ou aprovar algo, use a área correspondente do SolverFin.</p>
        </aside>

        <form class="assistant-composer panel" data-assistant-form>
          <label for="assistant-question">Sua pergunta</label>
          <textarea id="assistant-question" name="question" maxlength="1000" rows="3" placeholder="Ex.: Quanto gastei em alimentação este mês?" required data-assistant-input></textarea>
          <div class="assistant-composer-footer">
            <span class="muted">Se faltar período, moeda ou outro filtro necessário, eu pedirei uma confirmação.</span>
            <button type="submit" data-assistant-submit>${icon("send", 15)} Perguntar</button>
          </div>
        </form>
      </section>
      <script>${financialAssistantControllerScript()}</script>
    `,
  });
}

function assistantApiPath(url?: URL): string {
  const profileId = url?.searchParams.get("profileId")?.trim();
  return profileId
    ? `/api/financial-assistant?profileId=${encodeURIComponent(profileId)}`
    : "/api/financial-assistant";
}

function renderPromptButton(question: string): string {
  return `<button type="button" class="assistant-prompt" data-assistant-prompt="${escapeHtml(question)}">${escapeHtml(question)}</button>`;
}

function renderConversation(
  conversation: AssistantConversation | null,
  initialError?: string,
): string {
  if (initialError) {
    return renderEmptyState(
      "Não foi possível carregar a conversa.",
      "Você pode tentar novamente enviando uma pergunta.",
      "error",
    );
  }
  if (!conversation || conversation.turns.length === 0) {
    return renderEmptyState(
      "Nenhuma pergunta neste contexto.",
      "Escolha uma sugestão ou escreva sua própria pergunta abaixo.",
    );
  }
  return conversation.turns.map(renderTurn).join("");
}

function renderTurn(turn: AssistantTurn): string {
  return `
    <article class="assistant-turn" data-turn-status="${escapeHtml(turn.status.toLowerCase())}">
      <div class="assistant-message assistant-message-user">
        <span class="assistant-speaker">Você</span>
        <p>${escapeHtml(turn.question)}</p>
      </div>
      ${renderAssistantResponse(turn)}
    </article>
  `;
}

function renderAssistantResponse(turn: AssistantTurn): string {
  if (turn.status === "PROCESSING") {
    return `<div class="assistant-message assistant-message-system"><span class="assistant-speaker">SolverFin</span><p>Consultando os dados autorizados…</p></div>`;
  }
  if (!turn.response) {
    return `<div class="assistant-message assistant-message-system"><span class="assistant-speaker">SolverFin</span><p>${escapeHtml(statusFallback(turn.status))}</p></div>`;
  }
  const answer = turn.response;
  const metadata = [
    answer.period ? `Período: ${answer.period.startOn} a ${answer.period.endOn}` : undefined,
    ...(answer.filters ?? []).map((filter) => filter),
    `Confiança: ${confidenceLabel(answer.confidence)}`,
  ].filter((item): item is string => item !== undefined);

  return `
    <div class="assistant-message assistant-message-system">
      <div class="assistant-answer-heading">
        <span class="assistant-speaker">SolverFin</span>
        <span class="assistant-confidence" data-confidence="${escapeHtml(answer.confidence)}">${escapeHtml(confidenceLabel(answer.confidence))}</span>
      </div>
      <p>${escapeHtml(answer.answer)}</p>
      ${metadata.length > 0 ? `<div class="assistant-meta">${metadata.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      ${renderExplainability(answer)}
    </div>
  `;
}

function renderExplainability(answer: AssistantAnswer): string {
  const hasDetails =
    answer.assumptions.length > 0 || answer.sources.length > 0 || answer.limitations.length > 0;
  if (!hasDetails) return "";
  return `
    <details class="assistant-details">
      <summary>Como esta resposta foi calculada</summary>
      ${renderDetailList("Premissas", answer.assumptions)}
      ${renderDetailList("Fontes internas", answer.sources)}
      ${renderDetailList("Limitações", answer.limitations)}
    </details>
  `;
}

function renderDetailList(label: string, values: readonly string[]): string {
  if (values.length === 0) return "";
  return `<div class="assistant-detail-group"><strong>${escapeHtml(label)}</strong><ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></div>`;
}

function renderConversationStatus(conversation: AssistantConversation | null): string {
  if (!conversation) return "Pronto para iniciar uma consulta somente leitura.";
  switch (conversation.status) {
    case "PROCESSING":
      return "Resposta em processamento. Você pode cancelar o contexto a qualquer momento.";
    case "AWAITING_CLARIFICATION":
      return "Preciso de uma informação adicional para continuar.";
    case "CANCELLED":
      return "Contexto cancelado. Inicie um novo contexto para continuar.";
    case "EXPIRED":
      return "Contexto expirado. Inicie um novo contexto para continuar.";
    case "FAILED":
      return "A última consulta falhou sem alterar seus dados financeiros.";
    default:
      return "Contexto ativo e restrito ao perfil financeiro atual.";
  }
}

function renderEmptyState(title: string, message: string, kind = "empty"): string {
  return `<div class="assistant-empty" data-state="${escapeHtml(kind)}"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
}

function statusFallback(status: string): string {
  if (status === "CANCELLED") return "Esta pergunta foi cancelada.";
  if (status === "EXPIRED") return "Esta pergunta expirou com o contexto anterior.";
  if (status === "FAILED") return "Não foi possível concluir esta consulta.";
  return "A resposta não está disponível.";
}

function confidenceLabel(confidence: AssistantAnswer["confidence"]): string {
  if (confidence === "high") return "Alta";
  if (confidence === "medium") return "Média";
  return "Baixa";
}

function financialAssistantPageStyles(): string {
  return `
    .assistant-heading { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; margin-bottom:18px; }
    .assistant-heading h1 { margin:4px 0 6px; font-size:clamp(1.45rem, 3vw, 2rem); }
    .assistant-readonly { display:inline-flex; align-items:center; min-height:30px; padding:4px 10px; border-radius:999px; border:1px solid #cbd5e1; background:#f8fafc; color:#0f3d4c; font-size:.82rem; font-weight:700; white-space:nowrap; }
    .assistant-layout { display:grid; grid-template-columns:minmax(0, 1fr) minmax(220px, 300px); gap:16px; align-items:start; }
    .assistant-thread-panel { min-width:0; padding:0; overflow:hidden; }
    .assistant-thread-toolbar { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:18px 18px 14px; border-bottom:1px solid #e2e8f0; }
    .assistant-thread-toolbar h2, .assistant-help h2 { margin:0 0 4px; font-size:1rem; }
    .assistant-context-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
    .assistant-context-actions button, .assistant-prompt { min-height:36px; }
    .button-neutral, .assistant-prompt { border:1px solid #cbd5e1; background:#fff; color:#0f3d4c; border-radius:9px; padding:7px 10px; cursor:pointer; }
    .button-neutral:hover, .button-neutral:focus-visible, .assistant-prompt:hover, .assistant-prompt:focus-visible { background:#f1f5f9; border-color:#94a3b8; outline:2px solid transparent; }
    .button-neutral:disabled { cursor:not-allowed; opacity:.5; }
    .assistant-live-status { min-height:20px; padding:10px 18px; color:#475569; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-size:.86rem; }
    .assistant-thread { max-height:min(58vh, 620px); overflow:auto; padding:18px; scroll-behavior:smooth; }
    .assistant-turn { display:grid; gap:10px; margin-bottom:18px; }
    .assistant-message { max-width:min(760px, 94%); border-radius:14px; padding:12px 14px; overflow-wrap:anywhere; }
    .assistant-message p { margin:6px 0 0; line-height:1.55; }
    .assistant-message-user { justify-self:end; background:#e8f3f6; border:1px solid #c7dfe6; color:#0f172a; }
    .assistant-message-system { justify-self:start; background:#fff; border:1px solid #d9e2ea; box-shadow:0 1px 2px rgba(15,23,42,.04); }
    .assistant-speaker { font-size:.75rem; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:#0f3d4c; }
    .assistant-answer-heading { display:flex; justify-content:space-between; gap:12px; align-items:center; }
    .assistant-confidence { font-size:.74rem; font-weight:700; border-radius:999px; padding:3px 8px; background:#f1f5f9; color:#334155; }
    .assistant-confidence[data-confidence="low"] { background:#fff7ed; color:#9a3412; }
    .assistant-meta { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
    .assistant-meta span { border:1px solid #dbe4ec; background:#f8fafc; border-radius:999px; padding:3px 8px; font-size:.76rem; color:#475569; }
    .assistant-details { margin-top:12px; border-top:1px solid #e2e8f0; padding-top:9px; }
    .assistant-details summary { cursor:pointer; color:#0f3d4c; font-weight:700; }
    .assistant-detail-group { margin-top:9px; font-size:.84rem; color:#334155; }
    .assistant-detail-group ul { margin:5px 0 0; padding-left:20px; }
    .assistant-detail-group li { margin:4px 0; }
    .assistant-empty { text-align:center; padding:44px 18px; color:#475569; }
    .assistant-empty strong { display:block; color:#0f172a; margin-bottom:5px; }
    .assistant-empty p { margin:0; }
    .assistant-empty[data-state="error"] { color:#991b1b; }
    .assistant-help { padding:16px; position:sticky; top:16px; }
    .assistant-prompts { display:grid; gap:8px; margin-top:12px; }
    .assistant-prompt { text-align:left; width:100%; }
    .assistant-safety-note { margin:14px 0 0; color:#64748b; font-size:.82rem; line-height:1.45; }
    .assistant-composer { grid-column:1 / -1; padding:16px; }
    .assistant-composer label { display:block; font-weight:700; margin-bottom:7px; }
    .assistant-composer textarea { width:100%; min-height:88px; resize:vertical; border:1px solid #cbd5e1; border-radius:10px; padding:11px 12px; font:inherit; color:#0f172a; background:#fff; box-sizing:border-box; }
    .assistant-composer textarea:focus-visible { outline:3px solid rgba(34,211,238,.35); border-color:#0f3d4c; }
    .assistant-composer-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:10px; }
    .assistant-composer-footer button { min-height:40px; display:inline-flex; gap:7px; align-items:center; justify-content:center; }
    .assistant-layout[aria-busy="true"] [data-assistant-submit] { cursor:progress; opacity:.7; }
    @media (max-width: 860px) { .assistant-layout { grid-template-columns:1fr; } .assistant-help { position:static; order:2; } .assistant-composer { grid-column:1; order:1; } .assistant-thread-panel { order:0; } }
    @media (max-width: 620px) { .assistant-heading, .assistant-thread-toolbar, .assistant-composer-footer { flex-direction:column; align-items:stretch; } .assistant-context-actions { justify-content:flex-start; } .assistant-context-actions button { flex:1 1 130px; } .assistant-thread { max-height:none; padding:12px; } .assistant-message { max-width:100%; } .assistant-composer-footer button { width:100%; } }
  `;
}

function financialAssistantControllerScript(): string {
  return `(() => {
    const root = document.querySelector('[data-financial-assistant]');
    if (!root) return;
    const form = root.querySelector('[data-assistant-form]');
    const input = root.querySelector('[data-assistant-input]');
    const submit = root.querySelector('[data-assistant-submit]');
    const thread = root.querySelector('[data-assistant-thread]');
    const status = root.querySelector('[data-assistant-status]');
    const cancel = root.querySelector('[data-assistant-cancel]');
    const clear = root.querySelector('[data-assistant-clear]');
    const startNew = root.querySelector('[data-assistant-new]');
    if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLTextAreaElement) || !thread || !status) return;

    let conversationId = root.getAttribute('data-conversation-id') || '';
    let busy = false;
    let pendingKey = '';
    let pendingQuestion = '';

    const profileId = new URLSearchParams(window.location.search).get('profileId');
    const apiPath = (path) => {
      const next = new URL(path, window.location.origin);
      if (profileId) next.searchParams.set('profileId', profileId);
      return next.pathname + next.search;
    };
    const setBusy = (value, message) => {
      busy = value;
      root.setAttribute('aria-busy', value ? 'true' : 'false');
      if (submit instanceof HTMLButtonElement) submit.disabled = value;
      if (message) status.textContent = message;
    };
    const errorMessage = async (response) => {
      try {
        const data = await response.json();
        return data?.error?.message || 'Não foi possível concluir a consulta.';
      } catch {
        return 'Não foi possível concluir a consulta.';
      }
    };
    const post = async (path, body) => {
      const response = await fetch(apiPath(path), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      return response.json();
    };
    const ensureConversation = async () => {
      if (conversationId) return conversationId;
      const data = await post('/api/financial-assistant/conversations');
      conversationId = data.conversation.id;
      root.setAttribute('data-conversation-id', conversationId);
      syncActions(data.conversation);
      return conversationId;
    };
    const syncActions = (conversation) => {
      const active = Boolean(conversation && !['CANCELLED', 'EXPIRED'].includes(conversation.status));
      if (cancel instanceof HTMLButtonElement) cancel.disabled = !active;
      if (clear instanceof HTMLButtonElement) clear.disabled = !conversation;
    };
    const node = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const detailGroup = (label, values) => {
      if (!values || values.length === 0) return null;
      const group = node('div', 'assistant-detail-group');
      group.append(node('strong', '', label));
      const list = node('ul');
      values.forEach((value) => list.append(node('li', '', String(value))));
      group.append(list);
      return group;
    };
    const confidence = (value) => value === 'high' ? 'Alta' : value === 'medium' ? 'Média' : 'Baixa';
    const renderResponse = (turn) => {
      const message = node('div', 'assistant-message assistant-message-system');
      const answer = turn.response;
      if (turn.status === 'PROCESSING') {
        message.append(node('span', 'assistant-speaker', 'SolverFin'), node('p', '', 'Consultando os dados autorizados…'));
        return message;
      }
      if (!answer) {
        const fallback = turn.status === 'CANCELLED' ? 'Esta pergunta foi cancelada.' : turn.status === 'EXPIRED' ? 'Esta pergunta expirou com o contexto anterior.' : 'Não foi possível concluir esta consulta.';
        message.append(node('span', 'assistant-speaker', 'SolverFin'), node('p', '', fallback));
        return message;
      }
      const heading = node('div', 'assistant-answer-heading');
      heading.append(node('span', 'assistant-speaker', 'SolverFin'));
      const badge = node('span', 'assistant-confidence', confidence(answer.confidence));
      badge.setAttribute('data-confidence', answer.confidence);
      heading.append(badge);
      message.append(heading, node('p', '', answer.answer));
      const metadata = [];
      if (answer.period) metadata.push('Período: ' + answer.period.startOn + ' a ' + answer.period.endOn);
      (answer.filters || []).forEach((filter) => metadata.push(String(filter)));
      metadata.push('Confiança: ' + confidence(answer.confidence));
      if (metadata.length) {
        const meta = node('div', 'assistant-meta');
        metadata.forEach((item) => meta.append(node('span', '', item)));
        message.append(meta);
      }
      const details = node('details', 'assistant-details');
      const groups = [detailGroup('Premissas', answer.assumptions), detailGroup('Fontes internas', answer.sources), detailGroup('Limitações', answer.limitations)].filter(Boolean);
      if (groups.length) {
        details.append(node('summary', '', 'Como esta resposta foi calculada'));
        groups.forEach((group) => details.append(group));
        message.append(details);
      }
      return message;
    };
    const renderConversation = (conversation) => {
      thread.replaceChildren();
      if (!conversation || !conversation.turns || conversation.turns.length === 0) {
        const empty = node('div', 'assistant-empty');
        empty.append(node('strong', '', 'Nenhuma pergunta neste contexto.'), node('p', '', 'Escolha uma sugestão ou escreva sua própria pergunta abaixo.'));
        thread.append(empty);
      } else {
        conversation.turns.forEach((turn) => {
          const article = node('article', 'assistant-turn');
          const user = node('div', 'assistant-message assistant-message-user');
          user.append(node('span', 'assistant-speaker', 'Você'), node('p', '', turn.question));
          article.append(user, renderResponse(turn));
          thread.append(article);
        });
      }
      const stateMessages = {
        PROCESSING: 'Resposta em processamento. Você pode cancelar o contexto a qualquer momento.',
        AWAITING_CLARIFICATION: 'Preciso de uma informação adicional para continuar.',
        CANCELLED: 'Contexto cancelado. Inicie um novo contexto para continuar.',
        EXPIRED: 'Contexto expirado. Inicie um novo contexto para continuar.',
        FAILED: 'A última consulta falhou sem alterar seus dados financeiros.',
      };
      status.textContent = conversation ? (stateMessages[conversation.status] || 'Contexto ativo e restrito ao perfil financeiro atual.') : 'Pronto para iniciar uma consulta somente leitura.';
      syncActions(conversation);
      thread.scrollTop = thread.scrollHeight;
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question || busy) return;
      if (!pendingKey || pendingQuestion !== question) {
        pendingKey = window.crypto?.randomUUID?.() || ('msg-' + Date.now() + '-' + Math.random().toString(16).slice(2));
        pendingQuestion = question;
      }
      setBusy(true, 'Consultando os dados autorizados…');
      try {
        const id = await ensureConversation();
        const data = await post('/api/financial-assistant/conversations/' + encodeURIComponent(id) + '/messages', { question, idempotencyKey: pendingKey });
        renderConversation(data.conversation);
        input.value = '';
        pendingKey = '';
        pendingQuestion = '';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Não foi possível concluir a consulta.';
      } finally {
        setBusy(false);
        input.focus();
      }
    });

    root.querySelectorAll('[data-assistant-prompt]').forEach((button) => {
      button.addEventListener('click', () => {
        input.value = button.getAttribute('data-assistant-prompt') || '';
        input.focus();
      });
    });

    cancel?.addEventListener('click', async () => {
      if (!conversationId || busy) return;
      setBusy(true, 'Cancelando o contexto…');
      try {
        const data = await post('/api/financial-assistant/conversations/' + encodeURIComponent(conversationId) + '/cancel');
        renderConversation(data.conversation);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Não foi possível cancelar o contexto.';
      } finally {
        setBusy(false);
      }
    });

    clear?.addEventListener('click', async () => {
      if (!conversationId || busy) return;
      setBusy(true, 'Limpando o contexto…');
      try {
        await post('/api/financial-assistant/conversations/' + encodeURIComponent(conversationId) + '/clear');
        conversationId = '';
        root.setAttribute('data-conversation-id', '');
        renderConversation(null);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Não foi possível limpar o contexto.';
      } finally {
        setBusy(false);
        input.focus();
      }
    });

    startNew?.addEventListener('click', async () => {
      if (busy) return;
      setBusy(true, 'Iniciando um novo contexto…');
      try {
        if (conversationId) await post('/api/financial-assistant/conversations/' + encodeURIComponent(conversationId) + '/clear');
        conversationId = '';
        const id = await ensureConversation();
        const response = await fetch(apiPath('/api/financial-assistant'));
        if (response.ok) {
          const data = await response.json();
          conversationId = id;
          renderConversation(data.conversation);
        } else {
          renderConversation({ id, status: 'ACTIVE', turns: [] });
        }
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Não foi possível iniciar um novo contexto.';
      } finally {
        setBusy(false);
        input.focus();
      }
    });
  })();`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
