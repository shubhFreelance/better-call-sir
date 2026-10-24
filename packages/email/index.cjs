const {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  timingSafeEqual,
} = require("node:crypto");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const development = () =>
  process.env.APP_MODE === "development" &&
  process.env.NODE_ENV !== "production";
function mode() {
  const value =
    process.env.EMAIL_DELIVERY_MODE || (development() ? "sandbox" : "");
  if (value === "sandbox" && development()) return "SANDBOX";
  if (value === "resend") return "RESEND";
  if (value === "smtp") return "SMTP";
  throw Error("EMAIL_CONFIGURATION");
}
function sender(provider = mode()) {
  if (provider === "SMTP") return require("./smtp.cjs").sender();
  if (provider === "RESEND" && !process.env.EMAIL_FROM)
    throw Error("EMAIL_CONFIGURATION");
  return process.env.EMAIL_FROM || null;
}
function contentKey() {
  const value =
    process.env.EMAIL_CONTENT_KEY ||
    (development() ? process.env.OTP_HASH_KEY : "");
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value || ""))
    throw Error("EMAIL_CONFIGURATION");
  return createHash("sha256")
    .update("bcs.email-content.v1\0")
    .update(Buffer.from(value, "base64"))
    .digest();
}
function seal(value, id) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", contentKey(), nonce);
  cipher.setAAD(Buffer.from(id));
  return Buffer.concat([
    nonce,
    cipher.update(JSON.stringify(value)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
function open(value, id) {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 29) throw Error("EMAIL_CONTENT_INVALID");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    contentKey(),
    bytes.subarray(0, 12),
  );
  cipher.setAAD(Buffer.from(id));
  cipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(
    Buffer.concat([
      cipher.update(bytes.subarray(12, -16)),
      cipher.final(),
    ]).toString("utf8"),
  );
}
function origin() {
  const value = new URL(
    process.env.PUBLIC_APP_URL ||
      (development() && mode() === "SANDBOX" ? "http://localhost:3000" : ""),
  );
  if (
    value.username ||
    value.password ||
    value.search ||
    value.hash ||
    value.pathname !== "/" ||
    (value.protocol !== "https:" &&
      !(
        development() &&
        ["localhost", "127.0.0.1"].includes(value.hostname) &&
        value.protocol === "http:"
      ))
  )
    throw Error("EMAIL_CONFIGURATION");
  return value.origin;
}
function message(to, locale, path, code) {
  const hi = locale === "hi";
  return {
    to,
    code,
    ...(code
      ? {
          subject: hi
            ? "आपका Better Call Sir साइन-इन कोड"
            : "Your Better Call Sir sign-in code",
          text: hi
            ? `आपका साइन-इन कोड ${code} है। यह 5 मिनट में समाप्त हो जाएगा। यह कोड किसी से साझा न करें। यदि आपने कोड नहीं माँगा है, तो इस ईमेल को अनदेखा करें।`
            : `Your sign-in code is ${code}. It expires in 5 minutes. Do not share this code. If you did not request it, ignore this email.`,
        }
      : {
          subject: hi
            ? "Better Call Sir पर नई जानकारी है"
            : "An update on Better Call Sir",
          text: hi
            ? `आपके शिक्षक संबंध या सहायता अनुरोध की नई जानकारी उपलब्ध है। अपने खाते में साइन इन करके देखें। निजी जानकारी इस ईमेल में शामिल नहीं है।\n${origin() + path}`
            : `There is an update to your teacher connection or support request. Sign in to your account to review it. Private details are not included in this email.\n${origin() + path}`,
        }),
  };
}
async function enqueue(db, input) {
  const id = randomUUID(),
    provider = mode(),
    account = input.accountId
      ? await db.account.findUnique({ where: { id: input.accountId } })
      : null,
    to = input.to || account?.email?.toLowerCase();
  let status = "QUEUED",
    failureCode = null,
    encryptedContent = null;
  try {
    if (!to) {
      status = "FAILED";
      failureCode = "NO_EMAIL";
    } else {
      encryptedContent = seal(
        {
          ...message(to, input.locale || "en", input.actionPath, input.code),
          from: sender(provider),
        },
        id,
      );
    }
  } catch {
    status = "FAILED";
    failureCode = "CONFIGURATION";
  }
  return db.emailDelivery.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      id,
      accountId: input.accountId || null,
      region: input.region || account?.region || "Raipur",
      eventId: input.eventId || null,
      dedupeKey: input.dedupeKey,
      requestHash: input.requestHash || null,
      kind: input.code ? "OTP" : "NOTIFICATION",
      topic: input.topic,
      locale: input.locale || "en",
      actionPath: input.actionPath || null,
      recipientHash: to ? hash(to) : null,
      encryptedContent,
      otpHash: input.otpHash || null,
      provider,
      status,
      failureCode,
      expiresAt: input.expiresAt || new Date(Date.now() + 7 * 86400000),
    },
    update: {},
  });
}
const receiptRank = {
  ACCEPTED: 1,
  DELAYED: 2,
  DELIVERED: 3,
  BOUNCED: 4,
  COMPLAINED: 5,
};
async function applyReceipts(db, delivery) {
  if (!delivery.providerId || delivery.provider !== "RESEND") return delivery;
  const receipts = await db.emailReceipt.findMany({
    where: { providerId: delivery.providerId },
  });
  let status = delivery.status;
  for (const r of receipts)
    if ((receiptRank[r.kind] || 0) > (receiptRank[status] || 0))
      status = r.kind;
  await db.emailReceipt.updateMany({
    where: { providerId: delivery.providerId, deliveryId: null },
    data: { deliveryId: delivery.id },
  });
  return db.emailDelivery.update({
    where: { id: delivery.id },
    data: { status, version: { increment: 1 } },
  });
}
async function eligible(db, row, payload) {
  if (row.expiresAt <= new Date()) return "EXPIRED";
  if (row.kind === "OTP") {
    const otp = await db.otp.findUnique({ where: { address: payload.to } });
    return !otp || otp.hash !== row.otpHash || otp.expiresAt <= new Date()
      ? "OTP_SUPERSEDED"
      : null;
  }
  if (!row.accountId) {
    const job = row.eventId
      ? await db.outbox.findUnique({ where: { id: row.eventId } })
      : null;
    return job &&
      (await require("./events.cjs")(db, job)).some(
        (target) => target.to && hash(target.to) === row.recipientHash,
      )
      ? null
      : "ACCESS_CHANGED";
  }
  const owner = await db.account.findUnique({ where: { id: row.accountId } });
  if (
    !owner ||
    owner.disabled ||
    hash((owner.email || "").toLowerCase()) !== row.recipientHash
  )
    return "ACCOUNT_CHANGED";
  if (
    await db.privacyRequest.count({
      where: {
        accountId: owner.id,
        scope: "ACCOUNT",
        kind: "DELETION",
        status: "PENDING",
      },
    })
  )
    return "PRIVACY_PAUSED";
  if (row.eventId) {
    const job = await db.outbox.findUnique({ where: { id: row.eventId } });
    if (
      !job ||
      !(await require("./events.cjs")(db, job)).some(
        (target) => target.accountId === row.accountId,
      )
    )
      return "ACCESS_CHANGED";
  }

  return null;
}
async function send(payload, key) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    throw Object.assign(Error("EMAIL_CONFIGURATION"), { definite: true });
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "bcs-email-" + key,
      },
      body: JSON.stringify({
        from: payload.from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
      }),
    });
  } catch {
    throw Object.assign(Error("PROVIDER_UNCERTAIN"), { definite: false });
  }
  if (!response.ok)
    throw Object.assign(
      Error(
        response.status === 429
          ? "RATE_LIMITED"
          : response.status >= 500
            ? "PROVIDER_UNCERTAIN"
            : "PROVIDER_REJECTED",
      ),
      { definite: response.status < 500 && response.status !== 429 },
    );
  let result;
  try {
    result = await response.json();
  } catch {
    throw Object.assign(Error("PROVIDER_UNCERTAIN"), { definite: false });
  }
  if (
    typeof result.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      result.id,
    )
  )
    throw Object.assign(Error("PROVIDER_UNCERTAIN"), { definite: false });
  return result.id;
}
async function deliver(db, id) {
  const claim = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
    const row = await tx.emailDelivery.findUnique({ where: { id } }),
      now = new Date();
    if (
      !row ||
      !["QUEUED", "SENDING"].includes(row.status) ||
      (row.leaseUntil && row.leaseUntil > now) ||
      (row.nextAttemptAt && row.nextAttemptAt > now)
    )
      return null;
    if (
      row.provider === "SMTP" &&
      row.status === "SENDING" &&
      row.attempts > 0
    ) {
      await tx.emailAttempt.updateMany({
        where: { deliveryId: id, outcome: "STARTED" },
        data: {
          outcome: "UNCERTAIN",
          failureCode: "WORKER_INTERRUPTED",
          completedAt: now,
        },
      });
      await tx.emailDelivery.update({
        where: { id },
        data: {
          status: "UNKNOWN",
          failureCode: "PROVIDER_UNCERTAIN",
          leaseUntil: null,
          encryptedContent: null,
          version: { increment: 1 },
        },
      });
      return null;
    }
    if (row.firstAttemptAt && now - row.firstAttemptAt > 23 * 3600000) {
      await tx.emailDelivery.update({
        where: { id },
        data: {
          status: "UNKNOWN",
          failureCode: "IDEMPOTENCY_WINDOW_EXPIRED",
          encryptedContent: null,
          leaseUntil: null,
          version: { increment: 1 },
        },
      });
      return null;
    }
    if (row.expiresAt <= now) {
      await tx.emailDelivery.update({
        where: { id },
        data: {
          status: "SUPPRESSED",
          failureCode: "EXPIRED",
          encryptedContent: null,
          leaseUntil: null,
          version: { increment: 1 },
        },
      });
      return null;
    }
    let payload, failure;
    try {
      payload = open(row.encryptedContent, id);
      failure = await eligible(tx, row, payload);
    } catch {
      failure = "CONFIGURATION";
    }
    if (failure) {
      await tx.emailDelivery.update({
        where: { id },
        data: {
          status: failure === "CONFIGURATION" ? "FAILED" : "SUPPRESSED",
          failureCode: failure,
          encryptedContent:
            failure === "CONFIGURATION" ? row.encryptedContent : null,
          leaseUntil: null,
          version: { increment: 1 },
        },
      });
      return null;
    }
    if (row.attempts >= row.maxAttempts) {
      await tx.emailDelivery.update({
        where: { id },
        data: {
          status: "UNKNOWN",
          failureCode: "ATTEMPTS_EXHAUSTED",
          leaseUntil: null,
          version: { increment: 1 },
        },
      });
      return null;
    }
    await tx.emailAttempt.updateMany({
      where: { deliveryId: id, outcome: "STARTED" },
      data: {
        outcome: "UNCERTAIN",
        failureCode: "WORKER_INTERRUPTED",
        completedAt: now,
      },
    });
    const attempt = await tx.emailAttempt.create({
      data: { deliveryId: id, number: row.attempts + 1 },
    });
    await tx.emailDelivery.update({
      where: { id },
      data: {
        status: "SENDING",
        attempts: { increment: 1 },
        firstAttemptAt: row.firstAttemptAt || now,
        leaseUntil: new Date(now.getTime() + 60000),
        nextAttemptAt: null,
        version: { increment: 1 },
      },
    });
    return { row, attempt, payload };
  });
  if (!claim) return null;
  let providerId,
    status,
    failureCode = null,
    uncertain = false;
  try {
    if (claim.row.provider === "SANDBOX") {
      if (!development())
        throw Object.assign(Error("EMAIL_CONFIGURATION"), { definite: true });
      status = "SANDBOX";
    } else {
      providerId =
        claim.row.provider === "SMTP"
          ? await require("./smtp.cjs").send(claim.payload, id)
          : await send(claim.payload, id);
      status = "ACCEPTED";
    }
  } catch (error) {
    failureCode =
      error.message === "EMAIL_CONFIGURATION"
        ? "CONFIGURATION"
        : error.message === "PROVIDER_REJECTED"
          ? "PROVIDER_REJECTED"
          : error.message === "RATE_LIMITED"
            ? "RATE_LIMITED"
            : "PROVIDER_UNCERTAIN";
    uncertain = !error.definite;
    status =
      uncertain &&
      claim.row.provider !== "SMTP" &&
      claim.attempt.number < claim.row.maxAttempts
        ? "QUEUED"
        : uncertain
          ? "UNKNOWN"
          : "FAILED";
  }
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
    if (providerId)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${providerId},0))`;
    const current = await tx.emailDelivery.findUniqueOrThrow({ where: { id } }),
      attempt = await tx.emailAttempt.findUniqueOrThrow({
        where: { id: claim.attempt.id },
      });
    if (attempt.outcome !== "STARTED") return current;
    await tx.emailAttempt.update({
      where: { id: attempt.id },
      data: {
        outcome:
          status === "ACCEPTED"
            ? "ACCEPTED"
            : status === "SANDBOX"
              ? "SANDBOX"
              : uncertain
                ? "UNCERTAIN"
                : "REJECTED",
        failureCode,
        completedAt: new Date(),
      },
    });
    if (
      current.attempts !== attempt.number ||
      !["SENDING", "QUEUED", "UNKNOWN"].includes(current.status)
    )
      return current;
    const updated = await tx.emailDelivery.update({
      where: { id },
      data: {
        status,
        providerId: providerId || null,
        failureCode,
        leaseUntil: null,
        nextAttemptAt:
          status === "QUEUED"
            ? new Date(Date.now() + attempt.number * 60000)
            : null,
        encryptedContent:
          (["ACCEPTED", "SANDBOX"].includes(status) &&
            claim.row.kind !== "OTP") ||
          status === "ACCEPTED" ||
          (claim.row.provider === "SMTP" && status === "UNKNOWN")
            ? null
            : current.encryptedContent,
        version: { increment: 1 },
      },
    });
    return applyReceipts(tx, updated);
  });
}
async function tick(db) {
  await db.emailDelivery.updateMany({
    where: { expiresAt: { lte: new Date() }, encryptedContent: { not: null } },
    data: { encryptedContent: null },
  });
  const row = await db.emailDelivery.findFirst({
    where: {
      status: { in: ["QUEUED", "SENDING"] },
      AND: [
        {
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
        },
        { OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (row) return deliver(db, row.id);
}
function verifySignature(headers, body) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret || !/^whsec_[A-Za-z0-9+/]+=*$/.test(secret))
    throw Error("WEBHOOK_CONFIGURATION");
  const id = headers.id,
    time = headers.timestamp,
    signature = headers.signature;
  if (
    typeof id !== "string" ||
    id.length > 128 ||
    !/^\d{10}$/.test(time || "") ||
    Math.abs(Date.now() / 1000 - Number(time)) > 300 ||
    typeof signature !== "string" ||
    signature.length > 1024
  )
    throw Error("INVALID_EMAIL_SIGNATURE");
  const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(id + "." + time + ".")
    .update(body)
    .digest();
  if (
    !signature.split(" ").some((value) => {
      if (!value.startsWith("v1,")) return false;
      const bytes = Buffer.from(value.slice(3), "base64");
      return (
        bytes.length === expected.length && timingSafeEqual(bytes, expected)
      );
    })
  )
    throw Error("INVALID_EMAIL_SIGNATURE");
  return id;
}
async function enqueueEvent(db, job) {
  if (
    new Date(job.createdAt || Date.now()).getTime() + 7 * 86400000 <=
    Date.now()
  )
    return;
  for (const target of await require("./events.cjs")(db, job)) {
    const owner = target.accountId
      ? await db.account.findUnique({ where: { id: target.accountId } })
      : null;
    if (target.accountId && (!owner || owner.disabled)) continue;
    await enqueue(db, {
      ...target,
      eventId: job.id,
      topic: job.type,
      locale: owner?.emailLocale || target.locale,
      dedupeKey: hash(
        "event:" + job.id + ":" + (target.accountId || target.to),
      ),
      expiresAt: new Date(
        new Date(job.createdAt || Date.now()).getTime() + 7 * 86400000,
      ),
    });
  }
}
module.exports = {
  enqueueEvent,
  mode,
  sender,
  hash,
  seal,
  open,
  message,
  enqueue,
  deliver,
  tick,
  applyReceipts,
  verifySignature,
};
module.exports.notificationTargets = require('./events.cjs');
