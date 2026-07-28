export function resolveReportsCanonicalLocation(url: URL): string | undefined {
  if (!url.searchParams.has("accountId") || url.searchParams.get("accountId") !== "") {
    return undefined;
  }

  const canonical = new URL(url);
  canonical.searchParams.delete("accountId");
  return `${canonical.pathname}${canonical.search}${canonical.hash}`;
}
