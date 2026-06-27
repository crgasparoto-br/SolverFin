import type { IncomingMessage, ServerResponse } from "node:http";

const solverFinLogoPath = "/brand/Solverfin_02.png";
const solverFinDescription =
  "Controle financeiro inteligente para pessoas, MEIs, autônomos e pequenos negócios.";

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  contentType = "application/json; charset=utf-8",
): void {
  response.writeHead(statusCode, { "content-type": contentType });
  response.end(JSON.stringify(body, null, 2));
}

export function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(enhanceSolverFinBranding(html));
}

export function apiError(code: string, message: string, correlationId: string) {
  return { error: { code, message, correlationId } };
}

export function resolveCorrelationId(request: IncomingMessage): string {
  const incoming = request.headers["x-correlation-id"];

  if (typeof incoming === "string" && /^[a-zA-Z0-9._:-]{8,120}$/.test(incoming)) {
    return incoming;
  }

  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function enhanceSolverFinBranding(html: string): string {
  let output = html;

  if (output.includes("</head>") && !output.includes("solverfin-brand-metadata")) {
    output = output.replace(
      "</head>",
      `    <meta name="description" content="${solverFinDescription}" data-solverfin-brand-metadata />
    <link rel="icon" type="image/png" href="${solverFinLogoPath}" />
    <link rel="shortcut icon" href="${solverFinLogoPath}" />
    <link rel="apple-touch-icon" href="${solverFinLogoPath}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="SolverFin" />
    <meta property="og:description" content="${solverFinDescription}" />
    <meta property="og:image" content="${solverFinLogoPath}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="SolverFin" />
    <meta name="twitter:description" content="${solverFinDescription}" />
    <meta name="twitter:image" content="${solverFinLogoPath}" />
    <style data-solverfin-brand-styles>
      .brand-with-logo { align-items: center; display: inline-flex; gap: 10px; }
      .brand-logo { border-radius: 12px; height: 36px; width: 36px; }
      .brand-login-logo { border-radius: 18px; box-shadow: 0 16px 40px rgba(15, 61, 76, .16); height: 72px; width: 72px; }
    </style>
  </head>`,
    );
  }

  output = output.replace(
    '<a class="brand" href="/dashboard" aria-label="Ir para o resumo do SolverFin">SolverFin</a>',
    `<a class="brand brand-with-logo" href="/dashboard" aria-label="Ir para o resumo do SolverFin"><img class="brand-logo" src="${solverFinLogoPath}" alt="" aria-hidden="true" /><span>SolverFin</span></a>`,
  );

  output = output.replace(
    '<section class="panel" aria-labelledby="login-title">',
    `<section class="panel" aria-labelledby="login-title"><img class="brand-login-logo" src="${solverFinLogoPath}" alt="Logo SolverFin" />`,
  );

  return output;
}
