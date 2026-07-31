import { faviconLinks } from "./pages.js";

export function renderLoginPage(
  errorMessage?: string,
  passwordResetUrl?: string,
  options: { productiveOidc?: boolean } = {},
): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    ${faviconLinks()}
    <title>Entrar no SolverFin</title>
    <style>${loginCss()}</style>
  </head>
  <body>
    <main class="login-shell">
      <section class="panel" aria-labelledby="login-title">
        <img class="login-logo" src="/images/solverfin-logo.png" width="120" height="120" alt="SolverFin" />
        <p class="eyebrow">Acesso SolverFin</p>
        <h1 id="login-title">Entrar no SolverFin</h1>
        ${renderAuthenticationPanel(options.productiveOidc === true, errorMessage, passwordResetUrl)}
      </section>
    </main>
    <script>
      const tabs = document.querySelectorAll("[data-auth-tab]");
      const panels = document.querySelectorAll("[data-auth-panel]");

      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          const target = tab.dataset.authTab;
          tabs.forEach((item) => item.classList.toggle("active", item === tab));
          panels.forEach((panel) => {
            panel.hidden = panel.dataset.authPanel !== target;
          });
        });
      });

      const unavailablePasswordReset = document.querySelector("[data-password-reset-unavailable]");
      unavailablePasswordReset?.addEventListener("click", () => {
        const help = document.querySelector("#password-reset-help");
        if (help) help.hidden = false;
      });

      async function submitAuthForm(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = {};
        new FormData(form).forEach((value, key) => {
          payload[key] = value;
        });
        const response = await fetch(form.action, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          window.location.assign("/dashboard");
          return;
        }

        const body = await response.json().catch(() => ({}));
        const message = body.error && body.error.message ? encodeURIComponent(body.error.message) : "credenciais";
        window.location.assign("/login?erro=" + message);
      }

      document.querySelector("#login-form")?.addEventListener("submit", submitAuthForm);
      document.querySelector("#register-form")?.addEventListener("submit", submitAuthForm);
    </script>
  </body>
</html>`;
}

function renderAuthenticationPanel(
  productiveOidc: boolean,
  errorMessage?: string,
  passwordResetUrl?: string,
): string {
  const error = renderProductiveError(errorMessage);

  if (productiveOidc) {
    return `<p class="muted">Use sua conta segura para acessar seus dados financeiros.</p>
        ${error}
        <a class="primary-auth-action" href="/api/auth/oidc/start?returnTo=/dashboard">Continuar com acesso seguro</a>
        ${renderProductiveRecoveryAction(passwordResetUrl)}
        <p class="recovery-help">Credenciais, recuperação de conta e autenticação forte são gerenciadas pelo provedor de identidade.</p>`;
  }

  return `<p class="muted">Ambiente local: entre com uma conta de desenvolvimento ou crie um usuário de teste.</p>
        ${errorMessage ? `<p class="error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}
        <div class="auth-tabs" role="tablist" aria-label="Opção de acesso">
          <button type="button" class="tab active" data-auth-tab="login">Entrar</button>
          <button type="button" class="tab" data-auth-tab="register">Criar usuário</button>
        </div>
        <form id="login-form" data-auth-panel="login" method="post" action="/api/session">
          <label>Email<input name="email" type="email" autocomplete="username" placeholder="voce@email.com" required /></label>
          <label>Senha<input name="password" type="password" autocomplete="current-password" placeholder="Senha cadastrada" required /></label>
          ${renderPasswordResetAction(passwordResetUrl)}
          <button type="submit">Entrar</button>
        </form>
        <form id="register-form" data-auth-panel="register" method="post" action="/api/users" hidden>
          <label>Nome<input name="displayName" autocomplete="name" placeholder="Seu nome" required /></label>
          <label>Email<input name="email" type="email" autocomplete="email" placeholder="voce@email.com" required /></label>
          <label>Senha<input name="password" type="password" autocomplete="new-password" minlength="8" placeholder="No mínimo 8 caracteres" required /></label>
          <button type="submit">Criar usuário</button>
        </form>`;
}

function renderProductiveError(errorMessage?: string): string {
  if (!errorMessage) return "";

  const message =
    errorMessage === "cookie-unavailable"
      ? "O acesso foi concluído no provedor, mas o navegador não manteve a sessão. Habilite cookies para este site e reinicie o acesso seguro."
      : "Não foi possível concluir o acesso. Tente novamente.";

  return `<p class="error" role="alert">${message}</p>`;
}

function renderProductiveRecoveryAction(passwordResetUrl?: string): string {
  if (!passwordResetUrl) {
    return "";
  }

  return `<a class="forgot-password productive-recovery" href="${escapeHtml(passwordResetUrl)}" rel="noreferrer">Recuperar acesso</a>`;
}

function renderPasswordResetAction(passwordResetUrl?: string): string {
  if (passwordResetUrl) {
    return `<div class="password-recovery"><a class="forgot-password" href="${escapeHtml(passwordResetUrl)}" rel="noreferrer">Esqueci minha senha</a></div>`;
  }

  return `<div class="password-recovery">
    <button type="button" class="forgot-password" data-password-reset-unavailable aria-controls="password-reset-help">Esqueci minha senha</button>
    <p id="password-reset-help" class="recovery-help" role="status" hidden>A recuperação de senha não está disponível neste ambiente. Procure o responsável pelo seu acesso.</p>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loginCss(): string {
  return `
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --text: #0f172a; --muted: #64748b; --line: #dbe3ee; --primary: #0f3d4c; --cyan: #0891b2; --danger: #dc2626; }
    * { box-sizing: border-box; min-width: 0; }
    html, body { margin: 0; max-width: 100%; min-height: 100%; overflow-x: clip; }
    body { min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, p { margin: 0; overflow-wrap: anywhere; } h1 { font-size: 2rem; letter-spacing: 0; }
    .login-shell { align-items: center; display: grid; min-height: 100vh; padding: clamp(12px, 4vw, 24px); width: 100%; }
    .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 18px; margin: 0 auto; max-width: min(480px, 100%); padding: clamp(14px, 4vw, 20px); width: 100%; }
    .login-logo { display: block; height: auto; margin: 0 auto; max-width: min(120px, 100%); }
    .eyebrow { color: var(--cyan); font-size: .78rem; font-weight: 800; text-transform: uppercase; } .muted { color: var(--muted); line-height: 1.5; }
    .auth-tabs { background: #eef5f8; border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 4px; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 4px; }
    .tab { background: transparent; color: var(--text); min-height: 38px; }
    .tab.active { background: var(--surface); box-shadow: 0 1px 3px rgba(15, 23, 42, .12); }
    form, label { display: grid; gap: 10px; } label { font-weight: 700; }
    input { border: 1px solid var(--line); border-radius: 8px; font: inherit; min-height: 44px; padding: 0 12px; width: 100%; }
    button { align-items: center; background: var(--primary); border: 0; border-radius: 8px; color: white; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; white-space: normal; }
    .primary-auth-action { align-items: center; background: var(--primary); border-radius: 8px; color: white; display: flex; font-weight: 800; justify-content: center; min-height: 44px; overflow-wrap: anywhere; padding: 10px 16px; text-align: center; text-decoration: none; width: 100%; }
    .password-recovery { align-items: flex-end; display: flex; flex-direction: column; gap: 8px; margin-top: -2px; }
    .forgot-password { color: var(--cyan); font-size: .92rem; font-weight: 800; max-width: 100%; overflow-wrap: anywhere; text-decoration: none; }
    .forgot-password:hover, .forgot-password:focus-visible { text-decoration: underline; }
    .productive-recovery { justify-self: center; text-align: center; }
    button.forgot-password { background: transparent; border-radius: 4px; min-height: auto; padding: 2px 0; }
    .recovery-help { color: var(--muted); font-size: .88rem; line-height: 1.45; max-width: 34rem; overflow-wrap: anywhere; text-align: right; }
    .error { background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; }
    [hidden] { display: none !important; }
  `;
}
