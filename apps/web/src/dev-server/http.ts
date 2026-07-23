import type { IncomingMessage, ServerResponse } from "node:http";

import { enhanceInboxInterfaceAccessibility } from "./inbox-interface-accessibility-enhancement.js";
import { enhanceInboxInterface } from "./inbox-interface-enhancement.js";
import { enhanceInboxStatusAndActions } from "./inbox-status-and-actions-enhancement.js";
import { enhanceInboxStatusControl } from "./inbox-status-control-enhancement.js";
import { enhanceInboxTableLayout } from "./inbox-table-layout-enhancement.js";

const solverFinLogoPath = "/icons/solverfin-512.png";
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
  const brandedHtml = enhanceSolverFinBranding(html);
  response.end(isInboxDocument(brandedHtml) ? enhanceInboxDocument(brandedHtml) : brandedHtml);
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

function isInboxDocument(html: string): boolean {
  return html.includes("<title>Inbox - SolverFin</title>");
}

function enhanceInboxDocument(html: string): string {
  return enhanceInboxStatusAndActions(
    enhanceInboxStatusControl(
      enhanceInboxTableLayout(enhanceInboxInterfaceAccessibility(enhanceInboxInterface(html))),
    ),
  );
}

function enhanceSolverFinBranding(html: string): string {
  let output = html;

  if (output.includes("</head>") && !output.includes("solverfin-brand-metadata")) {
    output = output.replace(
      "</head>",
      `    <meta name="description" content="${solverFinDescription}" data-solverfin-brand-metadata />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="SolverFin" />
    <meta property="og:description" content="${solverFinDescription}" />
    <meta property="og:image" content="${solverFinLogoPath}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="SolverFin" />
    <meta name="twitter:description" content="${solverFinDescription}" />
    <meta name="twitter:image" content="${solverFinLogoPath}" />
  </head>`,
    );
  }

  return output;
}
