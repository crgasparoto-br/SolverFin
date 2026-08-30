import { enhanceInboxListLayout } from "./inbox-list-layout-enhancement.js";
import { renderInboxPage } from "./inbox-page.js";
import { enhanceInboxWithStructuredPayloads } from "./inbox-structured-payload-enhancement.js";

/**
 * Keeps the current Inbox SSR contract at the renderer boundary while the
 * residual enhancements are migrated to structured view-models/components.
 * These adapters are no longer part of the legacy route pipeline inventory.
 */
export async function renderInboxCompatibilityPage(token: string, url: URL): Promise<string> {
  const html = await enhanceInboxWithStructuredPayloads(await renderInboxPage(token), token);
  return enhanceInboxListLayout(html, url);
}
