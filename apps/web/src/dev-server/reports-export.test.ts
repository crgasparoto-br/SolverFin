import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderReportsRoutePage } from "./reports-route-page.js";

import {
  downloadReportExport,
  loadCanonicalReportExport,
  ReportExportError,
} from "./reports-export.js";
import {
  safeSpreadsheetText,
  serializeReportCsv,
  serializeReportPdf,
  serializeReportXlsx,
} from "./reports-export-serializers.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function series(amountMinor: number) {
  return {
    cells: [{ amountMinor, percentage: 50 }],
    totalMinor: amountMinor,
    totalPercentage: 50,
    averageMinor: amountMinor,
    averagePercentage: 50,
  };
}

function evolutionReport(brl = 12345, usd = 99887) {
  return {
    report: {
      interval: "monthly",
      start: "2026-07",
      periodCount: 1,
      periods: [
        {
          key: "2026-07",
          label: "Jul/26",
          accessibleLabel: "Julho de 2026",
          startsOn: "2026-07-01",
          endsOn: "2026-07-31",
        },
      ],
      currencyBlocks: [
        {
          currency: "BRL",
          income: series(brl),
          expense: series(2345),
          result: series(10000),
          incomeCategories: [{
            categoryId: "category-1",
            name: '=HYPERLINK("https://invalid.example","clique")',
            status: "active",
            series: series(brl),
            children: [],
          }],
          expenseCategories: [],
        },
        {
          currency: "USD",
          income: series(usd),
          expense: series(2222),
          result: series(97665),
          incomeCategories: [],
          expenseCategories: [],
        },
      ],
    },
  };
}

function installmentsFixture() {
  const item = (id: string, currency: string, amountMinor: number) => ({
    id,
    status: "planned",
    sequenceNumber: 1,
    totalInstallments: 2,
    dueOn: "2026-07-15",
    amountMinor,
    currency,
    card: { id: "card-1", name: "+CARTAO", status: "active" },
    category: { id: "category-2", name: "Servicos", kind: "expense", status: "active" },
    transaction: { id: "txn-1", description: "@formula", status: "planned" },
  });
  return { installments: [item("brl-1", "BRL", 33579), item("usd-1", "USD", 88743)] };
}

function cashFlowFixture() {
  const block = (currency: string, amount: number) => ({
    currency,
    openingBalanceMinor: amount,
    closingBalanceMinor: amount + 10,
    points: [
      {
        date: "2026-08-02",
        netMovementMinor: -50,
        closingBalanceMinor: amount + 10,
        movements: [
          {
            commitmentId: "c-1",
            effectId: "source",
            description: "-MOVIMENTO",
            source: { kind: "transaction", id: "t-1" },
            amountMinor: -50,
            currency,
          },
        ],
      },
    ],
  });
  return {
    referenceDate: "2026-08-01",
    horizonDays: 30,
    from: "2026-08-02",
    to: "2026-08-31",
    currencyBlocks: [block("BRL", 44661), block("USD", 55882)],
  };
}

function fakeReportApi(): string[] {
  const paths: string[] = [];
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    paths.push(url.pathname + url.search);
    if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
    if (url.pathname === "/api/credit-card-accounts") {
      return jsonResponse({ creditCardAccounts: [] });
    }
    if (url.pathname === "/api/cards") return jsonResponse({ cards: [] });
    if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
    if (url.pathname === "/api/reports/category-evolution") {
      return jsonResponse(evolutionReport());
    }
    if (url.pathname === "/api/installments") return jsonResponse(installmentsFixture());
    if (url.pathname === "/api/cash-flow-projection") return jsonResponse(cashFlowFixture());
    throw new Error("Unexpected upstream API: " + url.pathname);
  };
  return paths;
}

function extractZipEntries(zip: Buffer): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (let offset = 0; offset + 30 < zip.length;) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) break;
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    result.set(name, zip.subarray(start, start + size).toString("utf8"));
    offset = start + size;
  }
  return result;
}

function exportUrl(view: string, format = "csv", currency = "all"): URL {
  const params = new URLSearchParams({ view, format, currency, profileId: "profile-a" });
  if (view === "category-evolution") {
    params.set("interval", "monthly");
    params.set("start", "2026-07");
    params.set("periods", "1");
  } else if (view === "installments") {
    params.set("month", "2026-07");
    params.set("status", "all");
    params.set("cardId", "card-1");
  } else {
    params.set("referenceDate", "2026-08-01");
    params.set("horizonDays", "30");
  }
  return new URL("http://localhost/relatorios/export?" + params.toString());
}

describe("report exports - canonical snapshot", () => {
  for (const view of ["category-evolution", "installments", "cash-flow"]) {
    it("serializes identical canonical cells and currency boundaries in all formats: " + view, async () => {
      const paths = fakeReportApi();
      const snapshot = await loadCanonicalReportExport("session", exportUrl(view));
      assert.equal(snapshot.view, view);
      assert.equal(snapshot.filters.currency, "all");
      assert.equal(snapshot.filters.profileId, "profile-a");
      assert.deepEqual(
        [...new Set(snapshot.tables.map((table) => table.currency).filter(Boolean))],
        ["BRL", "USD"],
      );

      const csv = serializeReportCsv(snapshot).toString("utf8");
      const workbook = serializeReportXlsx(snapshot);
      const sheets = extractZipEntries(workbook);
      const xml = [...sheets.values()].join("\n");
      const pdf = serializeReportPdf(snapshot).toString("latin1");
      assert.ok(csv.startsWith("\uFEFF"));
      assert.equal(workbook.subarray(0, 4).toString("binary"), "PK\u0003\u0004");
      assert.match(pdf, /^%PDF-1\.4/);
      assert.match(sheets.get("xl/workbook.xml") ?? "", /Contexto/);
      assert.match(csv, /"currency";"BRL"/);
      assert.match(csv, /"currency";"USD"/);
      assert.match(pdf, /Moeda: BRL/);
      assert.match(pdf, /Moeda: USD/);
      assert.match(csv, /"filter";"profileId";"profile-a"/);
      assert.match(xml, /profile-a/);
      assert.match(pdf, /profileId: profile-a/);
      for (const table of snapshot.tables) {
        for (const row of table.rows) {
          for (const cell of row) {
            if (typeof cell !== "number" || Math.abs(cell) < 1000) continue;
            const text = String(cell);
            assert.ok(csv.includes(text), "CSV missing canonical value " + text);
            assert.ok(xml.includes(text), "XLSX missing canonical value " + text);
            assert.ok(pdf.includes(text), "PDF missing canonical value " + text);
          }
        }
      }
      assert.equal(sheets.size, snapshot.tables.length + 5);
      assert.equal(paths.length, 1);
      assert.match(paths[0] ?? "", /profileId=profile-a/);
      assert.doesNotMatch(paths[0] ?? "", /currency=all/);
    });
  }

  it("exports just the requested currency without computing a mixed-currency total", async () => {
    fakeReportApi();
    for (const view of ["category-evolution", "installments", "cash-flow"]) {
      const snapshot = await loadCanonicalReportExport("session", exportUrl(view, "csv", "USD"));
      const currencies = [...new Set(snapshot.tables.map((table) => table.currency).filter(Boolean))];
      assert.deepEqual(currencies, ["USD"]);
      const csv = serializeReportCsv(snapshot).toString("utf8");
      assert.doesNotMatch(csv, /"currency";"BRL"/);
      assert.match(csv, /"currency";"USD"/);
    }
  });

  it("produces all three valid downloadable artifacts and metadata", async () => {
    fakeReportApi();
    for (const view of ["category-evolution", "installments", "cash-flow"]) {
      for (const format of ["csv", "xlsx", "pdf"]) {
        const result = await downloadReportExport("session", exportUrl(view, format));
        assert.ok(result.content.length > 100);
        assert.ok(result.fileName.endsWith("." + format));
        assert.ok(result.contentType.length > 3);
        if (format === "csv") assert.match(result.contentType, /^text\/csv/);
        if (format === "xlsx") assert.match(result.contentType, /spreadsheetml/);
        if (format === "pdf") assert.equal(result.contentType, "application/pdf");
      }
    }
  });
});

describe("report exports - Golden Screen SSR actions", () => {
  for (const view of ["category-evolution", "installments", "cash-flow"]) {
    it("renders accessible links with current view, profile and filters: " + view, async () => {
      fakeReportApi();
      const url = exportUrl(view);
      url.pathname = "/relatorios";
      url.searchParams.delete("format");
      const html = await renderReportsRoutePage(
        "session",
        url,
        new Date("2026-08-01T12:00:00.000Z"),
      );
      assert.match(html, /data-report-state="ready"/);
      assert.match(html, /aria-label="Exportar relatório"/);
      assert.match(html, /class="report-export-link sf-focus-ring"/);
      assert.match(html, /\.report-export-link:focus-visible/);
      const links = [...html.matchAll(/href="(\/relatorios\/export\?[^"]+)"/g)]
        .map((match) => new URL((match[1] ?? "").replaceAll("&amp;", "&"), url));
      assert.equal(links.length, 3);
      assert.deepEqual(
        links.map((link) => link.searchParams.get("format")),
        ["csv", "xlsx", "pdf"],
      );
      for (const link of links) {
        assert.equal(link.searchParams.get("view"), view);
        assert.equal(link.searchParams.get("profileId"), "profile-a");
        assert.equal(link.searchParams.get("currency"), "all");
        for (const [key, value] of url.searchParams) {
          if (key === "view" || key === "format") continue;
          assert.equal(link.searchParams.get(key), value, key);
        }
      }
    });
  }

  it("omits download actions in filter-error states", async () => {
    let requests = 0;
    globalThis.fetch = async (): Promise<Response> => {
      requests += 1;
      return jsonResponse({});
    };
    for (const query of [
      "view=category-evolution&periods=100",
      "view=cash-flow&horizonDays=42",
      "view=installments&currency=BAD1",
    ]) {
      const html = await renderReportsRoutePage(
        "session", new URL("http://localhost/relatorios?" + query),
      );
      assert.match(html, /data-report-state="filter-error"/);
      assert.doesNotMatch(html, /href="\/relatorios\/export\?/);
    }
    assert.equal(requests, 0);
  });
});

describe("report exports - isolation, validation and injection", () => {
  it("rejects unknown, duplicate and invalid filters before consulting financial data", async () => {
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls += 1;
      return jsonResponse({});
    };
    for (const query of [
      "view=category-evolution&format=csv&periods=25",
      "view=category-evolution&format=csv&accountId=invalid",
      "view=installments&format=pdf&month=2026-13",
      "view=installments&format=xlsx&status=unknown",
      "view=cash-flow&format=xlsx&horizonDays=45",
      "view=cash-flow&format=csv&currency=BR%3D",
      "view=installments&format=csv&profileId=a&profileId=b",
      "view=installments&format=csv&organizationId=foreign",
      "view=cash-flow&format=txt",
    ]) {
      await assert.rejects(
        downloadReportExport("session", new URL("http://localhost/relatorios/export?" + query)),
        (error: unknown) => error instanceof ReportExportError && error.statusCode === 400,
        query,
      );
    }
    assert.equal(calls, 0);
  });

  it("does not turn a foreign profile identifier into an authorized export", async () => {
    const requests: string[] = [];
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      requests.push(url.searchParams.get("profileId") ?? "");
      if (url.searchParams.get("profileId") === "profile-b") {
        return jsonResponse({
          error: { code: "TENANT_PROFILE_REQUIRED", message: "Perfil indisponível." },
        }, 404);
      }
      return jsonResponse(evolutionReport(12345, 99887));
    };
    const owned = await downloadReportExport("session", exportUrl("category-evolution"));
    assert.ok(owned.content.length > 0);
    await assert.rejects(
      downloadReportExport(
        "session",
        new URL(exportUrl("category-evolution").toString().replace("profile-a", "profile-b")),
      ),
      (error: unknown) => error instanceof ReportExportError && error.statusCode === 404,
    );
    assert.deepEqual(requests, ["profile-a", "profile-b"]);
  });

  it("neutralizes formula-leading values while keeping money as typed numbers", async () => {
    fakeReportApi();
    const snapshot = await loadCanonicalReportExport("session", exportUrl("category-evolution"));
    const csv = serializeReportCsv(snapshot).toString("utf8");
    const xlsx = extractZipEntries(serializeReportXlsx(snapshot));
    const xml = [...xlsx.values()].join("\n");
    assert.match(csv, /'=HYPERLINK/);
    assert.match(xml, /'=HYPERLINK/);
    assert.doesNotMatch(xml, /<f(?:\s|>)/);
    assert.match(xml, /<c r="[A-Z]+[0-9]+" t="inlineStr">/);
    assert.match(xml, /<c r="[A-Z]+[0-9]+"><v>12345<\/v><\/c>/);
    for (const value of ["=SUM(1)", " +123", "\t@HYPERLINK", "\n=1+2", "-1+3"]) {
      assert.ok(safeSpreadsheetText(value).includes("'"), value);
    }
    assert.equal(safeSpreadsheetText("Normal"), "Normal");
  });

  it("generates valid empty data for every view and format", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/reports/category-evolution") {
        return jsonResponse({ report: { ...evolutionReport().report, currencyBlocks: [] } });
      }
      if (url.pathname === "/api/installments") return jsonResponse({ installments: [] });
      return jsonResponse({ ...cashFlowFixture(), currencyBlocks: [] });
    };
    for (const view of ["category-evolution", "installments", "cash-flow"]) {
      const snapshot = await loadCanonicalReportExport("session", exportUrl(view));
      assert.equal(snapshot.tables.at(-1)?.name, "sem-dados");
      assert.equal(snapshot.tables.at(-1)?.rows.length, 0);
      const csv = serializeReportCsv(snapshot).toString("utf8");
      const workbook = extractZipEntries(serializeReportXlsx(snapshot));
      const pdf = serializeReportPdf(snapshot).toString("latin1");
      assert.match(csv, /"sem-dados"/);
      assert.ok(workbook.has("xl/workbook.xml"));
      assert.match(pdf, /Secao: sem-dados/);
    }
  });

  it("preserves separate authorized profile snapshots with no cross-tenant leak", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/api/reports/category-evolution");
      return jsonResponse(
        url.searchParams.get("profileId") === "profile-a"
          ? evolutionReport(12345, 99887)
          : evolutionReport(55667, 88999),
      );
    };
    const first = serializeReportCsv(
      await loadCanonicalReportExport("session", exportUrl("category-evolution")),
    ).toString();
    const other = serializeReportCsv(
      await loadCanonicalReportExport(
        "session",
        new URL(exportUrl("category-evolution").toString().replace("profile-a", "profile-c")),
      ),
    ).toString();
    assert.match(first, /12345/);
    assert.doesNotMatch(first, /55667/);
    assert.match(other, /55667/);
    assert.doesNotMatch(other, /12345/);
  });
});