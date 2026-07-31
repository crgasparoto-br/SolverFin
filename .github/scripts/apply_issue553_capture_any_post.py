from pathlib import Path

path = Path("scripts/statement-visual/issue-553-manual-installments.mjs")
source = path.read_text()
old_filter = '''      if (record.method !== "POST" || record.pathname !== "/api/installments") {
        await browser.cdp.send("Fetch.continueRequest", { requestId: paused.requestId });
        return;
      }
      requests.push(record);'''
new_filter = '''      if (record.method !== "POST" || !record.pathname.startsWith("/api/")) {
        await browser.cdp.send("Fetch.continueRequest", { requestId: paused.requestId });
        return;
      }
      requests.push(record);'''
old_pattern = 'patterns: [{ urlPattern: "*api/installments*", requestStage: "Request" }],'
new_pattern = 'patterns: [{ urlPattern: "*api/*", requestStage: "Request" }],'
old_timeout = '"Timed out waiting for POST /api/installments at the Chrome transport boundary",'
new_timeout = '"Timed out waiting for a form POST at the Chrome transport boundary",'
for label, before, after in [
    ("request filter", old_filter, new_filter),
    ("Fetch pattern", old_pattern, new_pattern),
    ("timeout message", old_timeout, new_timeout),
]:
    if before not in source:
        raise SystemExit(f"{label} not found")
    source = source.replace(before, after, 1)
path.write_text(source)
