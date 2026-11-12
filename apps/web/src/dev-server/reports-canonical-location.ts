export function resolveReportsCanonicalLocation(url: URL): string | undefined {
  if (url.searchParams.has("accountId") && url.searchParams.has("cardId")) {
    return undefined;
  }

  const origin = url.searchParams.get("origin");
  if (origin !== null && !url.searchParams.has("accountId") && !url.searchParams.has("cardId")) {
    const canonical = new URL(url);
    canonical.searchParams.delete("origin");

    if (origin.startsWith("account:")) {
      canonical.searchParams.set("accountId", origin.slice("account:".length));
    } else if (origin.startsWith("card:")) {
      canonical.searchParams.set("cardId", origin.slice("card:".length));
    } else if (origin !== "") {
      return undefined;
    }

    return `${canonical.pathname}${canonical.search}${canonical.hash}`;
  }

  const canonical = new URL(url);
  let changed = false;
  for (const key of ["accountId", "cardId"] as const) {
    if (canonical.searchParams.has(key) && canonical.searchParams.get(key) === "") {
      canonical.searchParams.delete(key);
      changed = true;
    }
  }

  return changed ? `${canonical.pathname}${canonical.search}${canonical.hash}` : undefined;
}
