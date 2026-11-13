export {
  acknowledgeWhatsappPairingCode,
  cancelWhatsappPairing,
  confirmWhatsappPairing,
  contextFromChannelLink,
  createWhatsappPairing,
  isWhatsappLinkStillActive,
  listWhatsappLinks,
  resolveActiveWhatsappLink,
  revokeWhatsappLink,
  WhatsappChannelError,
  type ActiveChannelLink,
  type ChannelLinkRow,
} from "./whatsapp-channel-link-repository.js";

export {
  claimWhatsappInboundEvent,
  claimWhatsappOutboundEvent,
  failWhatsappInboundEvent,
  finishWhatsappInboundEvent,
  redactExpiredWhatsappState,
  replaceResponseAfterRevocation,
  settleWhatsappOutboundEvent,
  withAuthorizedWhatsappOutbound,
  WhatsappChannelLimits,
} from "./whatsapp-channel-event-repository.js";

export {
  type ChannelEventClaim,
  type ChannelEventRow,
  type ChannelOutcome,
} from "./whatsapp-channel-types.js";
