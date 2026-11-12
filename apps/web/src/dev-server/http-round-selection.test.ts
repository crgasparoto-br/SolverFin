import assert from "node:assert/strict";
import test from "node:test";
import type { ServerResponse } from "node:http";

import { sendHtml } from "./http.js";

test("sendHtml aplica o padrão circular ao Extrato", () => {
  let statusCode = 0;
  let contentType = "";
  let body = "";
  const response = {
    writeHead(status: number, headers: Record<string, string>) {
      statusCode = status;
      contentType = headers["content-type"] ?? "";
      return this;
    },
    end(chunk?: string) {
      body = chunk ?? "";
      return this;
    },
  } as unknown as ServerResponse;

  sendHtml(
    response,
    200,
    `<!doctype html>
      <html lang="pt-BR">
        <head><title>Extrato - SolverFin</title></head>
        <body>
          <h1>Extrato Bancário</h1>
          <label class="col-select">
            <input type="checkbox" data-select-transaction aria-label="Selecionar lançamento" />
          </label>
        </body>
      </html>`,
  );

  assert.equal(statusCode, 200);
  assert.equal(contentType, "text/html; charset=utf-8");
  assert.match(body, /data-round-selection-control="enhanced"/);
  assert.match(body, /system-round-selector/);
  assert.match(body, /data-solverfin-brand-metadata/);
});
