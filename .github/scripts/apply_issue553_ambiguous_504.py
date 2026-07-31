from pathlib import Path

path = Path("scripts/statement-visual/issue-553-manual-installments.mjs")
source = path.read_text()
old_wait = 'const ambiguousFailure = await waitForFormStatus("Seus dados foram preservados");'
new_wait = 'const ambiguousFailure = await waitForFormStatus("operação pode ter sido concluída");'
old_failure = '''      if (requests.length === 1 && failFirst) {
        await browser.cdp.send("Fetch.failRequest", {
          requestId: paused.requestId,
          errorReason: "Failed",
        });
      } else {
        await browser.cdp.send("Fetch.continueRequest", { requestId: paused.requestId });
      }'''
new_failure = '''      if (requests.length === 1 && failFirst) {
        const body = Buffer.from(
          JSON.stringify({
            error: {
              code: "GATEWAY_TIMEOUT",
              message: "Tempo limite no gateway; a operação pode ter sido concluída.",
            },
          }),
        ).toString("base64");
        await browser.cdp.send("Fetch.fulfillRequest", {
          requestId: paused.requestId,
          responseCode: 504,
          responseHeaders: [
            { name: "content-type", value: "application/json; charset=utf-8" },
          ],
          body,
        });
      } else {
        await browser.cdp.send("Fetch.continueRequest", { requestId: paused.requestId });
      }'''
for label, before, after in [
    ("ambiguous wait", old_wait, new_wait),
    ("ambiguous response", old_failure, new_failure),
]:
    if before not in source:
        raise SystemExit(f"{label} not found")
    source = source.replace(before, after, 1)
path.write_text(source)
