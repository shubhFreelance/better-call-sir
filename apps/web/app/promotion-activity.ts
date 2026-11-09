import { sessionApi, type Session } from "@bcs/api-client";

export function recordPromotionActivity(
  session: Session | null | undefined,
  teacherId: string,
  kind: "CARD_CLICK" | "PROFILE_VISIT",
  promotionId?: string,
) {
  if (
    !session ||
    !["GUARDIAN", "STUDENT", "INDEPENDENT_STUDENT"].includes(
      session.account.role,
    ) ||
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  )
    return;
  // Analytics failure must never block profile navigation or an enquiry.
  void sessionApi(session, "/promotion-activity", {
    method: "POST",
    csrf: session.csrfToken,
    body: { teacherId, kind, ...(promotionId ? { promotionId } : {}) },
  }).catch(() => {});
}
