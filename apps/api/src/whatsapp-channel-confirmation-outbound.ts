import { query } from "./db.js";
import {
  confirmationToken,
  hashToken,
  WHATSAPP_CONFIRMATION_TOKEN_PLACEHOLDER,
} from "./whatsapp-channel-confirmation.js";
import type { ChannelEventRow } from "./whatsapp-channel-types.js";

/**
 * The durable reply contains only a marker. Rehydrate the capability immediately
 * before outbound, after channel authorization, without persisting plaintext.
 * Re-key an unsent confirmation if the app secret rotated between preparation
 * and delivery. A sent confirmation retains its stored hash for later decisions.
 */
export async function renderWhatsappFinancialConfirmationReply(
  event: ChannelEventRow,
  secret = process.env.WHATSAPP_META_APP_SECRET ?? "",
  now = new Date(),
): Promise<string | null> {
  const template = event.replyText;
  if (
    event.outcome !== "confirmation_pending" ||
    !template ||
    template.split(WHATSAPP_CONFIRMATION_TOKEN_PLACEHOLDER).length !== 4 ||
    !event.suggestionId ||
    !event.linkId ||
    !event.userId ||
    !event.organizationId ||
    !event.financialProfileId
  ) {
    return null;
  }

  const token = confirmationToken(event.id, event.suggestionId, secret);
  const tokenHash = hashToken(token);
  // Only an unexpired, still-pending proposal may have its hash re-keyed.
  // response_ready means the provider has not accepted a previous outbound.
  // A sent/send_unknown event never reaches this method a second time.
  const updated = await query<{ id: string }>(
    'update "WhatsappChannelConfirmation" c set "tokenHash"=$1::varchar(64),' +
      ' "updatedAt"=$2' +
      ' where c."sourceEventId"=$3 and c."suggestionId"=$4 and c."linkId"=$5' +
      ' and c."userId"=$6 and c."organizationId"=$7 and c."financialProfileId"=$8' +
      ' and c."status"=\'pending_confirmation\' and c."expiresAt">$2' +
      ' and exists (select 1 from "WhatsappChannelLink" l where l."id"=c."linkId"' +
      ' and l."version"=c."linkVersion" and l."state"=\'active\')' +
      ' returning c."id"',
    [
      tokenHash,
      now,
      event.id,
      event.suggestionId,
      event.linkId,
      event.userId,
      event.organizationId,
      event.financialProfileId,
    ],
  );
  if (updated.length !== 1) return null;
  return template.replaceAll(WHATSAPP_CONFIRMATION_TOKEN_PLACEHOLDER, token);
}
