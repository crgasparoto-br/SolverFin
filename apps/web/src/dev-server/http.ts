import type { IncomingMessage, ServerResponse } from "node:http";

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
  response.end(html);
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
