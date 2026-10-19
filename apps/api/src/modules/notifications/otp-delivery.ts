import { randomInt, randomUUID } from "node:crypto";
import * as email from "@bcs/email";
import { AppService, fail, hash } from "../../shared";
import { otpDigest } from "../identity/email-otp";
export async function requestOtp(
  service: AppService,
  address: string,
  locale: "en" | "hi",
  key: string,
) {
  const dedupeKey = hash("email-otp:" + address + ":" + key),
    requestHash = hash(JSON.stringify({ address, locale }));
  let row = await service.db.emailDelivery.findUnique({ where: { dedupeKey } });
  if (!row) {
    await service.limit("otp:" + address, 3);
    row = await service.db.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${address},0))`;
      const prior = await db.emailDelivery.findUnique({ where: { dedupeKey } });
      if (prior) return prior;
      const code = String(randomInt(1000000)).padStart(6, "0"),
        digest = otpDigest(address, code),
        expiresAt = new Date(Date.now() + 300000);
      const delivery = await email.enqueue(db, {
        to: address,
        locale,
        code,
        otpHash: digest,
        expiresAt,
        dedupeKey,
        requestHash,
        topic: "SIGN_IN",
      });
      if (delivery.status === "FAILED")
        fail(
          503,
          "EMAIL_UNAVAILABLE",
          "Email delivery is unavailable. Please retry later.",
        );
      await db.otp.upsert({
        where: { address },
        create: { address, hash: digest, expiresAt, locale },
        update: { hash: digest, expiresAt, attempts: 0, locale },
      });
      return delivery;
    });
  }
  if (!row)
    fail(
      503,
      "EMAIL_UNAVAILABLE",
      "Email delivery is unavailable. Please retry later.",
    );
  if (row.requestHash !== requestHash)
    fail(
      409,
      "IDEMPOTENCY_CONFLICT",
      "This retry key was used for a different request.",
    );
  if (row.expiresAt <= new Date())
    fail(
      409,
      "OTP_EXPIRED",
      "This sign-in request expired. Request a new code.",
    );
  await email.deliver(service.db, row.id);
  row = await service.db.emailDelivery.findUniqueOrThrow({
    where: { id: row.id },
  });
  if (
    ["FAILED", "UNKNOWN", "SUPPRESSED", "BOUNCED", "COMPLAINED"].includes(
      row.status,
    )
  )
    fail(
      503,
      "EMAIL_UNAVAILABLE",
      "Email delivery is unavailable. Please retry later.",
    );
  const otp = await service.db.otp.findUnique({ where: { address } });
  if (!otp || otp.hash !== row.otpHash)
    fail(
      409,
      "OTP_EXPIRED",
      "This sign-in request expired. Request a new code.",
    );
  const expiresIn = Math.max(
    1,
    Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000),
  );
  if (row.status === "SANDBOX")
    return {
      status: "SANDBOX" as const,
      developmentCode: email.open(row.encryptedContent!, row.id).code!,
      expiresIn,
      deliveryId: row.id,
    };
  return {
    status: ["ACCEPTED", "DELIVERED", "DELAYED"].includes(row.status)
      ? ("SENT" as const)
      : ("PENDING" as const),
    expiresIn,
    deliveryId: row.id,
  };
}
