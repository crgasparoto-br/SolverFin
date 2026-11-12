import type { AiConsentState, AiUsagePolicy } from "./index.js";

export type ActiveConsentCheck =
  | { status: "granted" }
  | {
      status: "blocked";
      code: "AI_CONSENT_REQUIRED" | "AI_CONSENT_CHECK_FAILED";
    };

export async function checkActiveConsent(input: {
  policy: AiUsagePolicy;
  resolveConsent?: () => AiConsentState | Promise<AiConsentState>;
}): Promise<ActiveConsentCheck> {
  if (input.policy.consent !== "granted" || !input.resolveConsent) {
    return { status: "blocked", code: "AI_CONSENT_REQUIRED" };
  }

  try {
    const currentConsent = await input.resolveConsent();
    return currentConsent === "granted"
      ? { status: "granted" }
      : { status: "blocked", code: "AI_CONSENT_REQUIRED" };
  } catch {
    return { status: "blocked", code: "AI_CONSENT_CHECK_FAILED" };
  }
}
