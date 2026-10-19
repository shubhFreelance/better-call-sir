import {
  Module,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Inject,
} from "@nestjs/common";
import type { Account, EmailDelivery } from "@prisma/client";
import { z } from "zod";
import * as email from "@bcs/email";
import {
  AppService,
  PersistenceModule,
  DB,
  HttpRequest,
  uuid,
  version,
  text,
  parse,
  fail,
  hash,
} from "../../shared";
const statuses = z.enum([
  "QUEUED",
  "SENDING",
  "ACCEPTED",
  "DELIVERED",
  "DELAYED",
  "BOUNCED",
  "COMPLAINED",
  "FAILED",
  "UNKNOWN",
  "SUPPRESSED",
  "SANDBOX",
]);
const paging = z
  .object({
    cursor: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: statuses.optional(),
  })
  .strict();
export function projection(r: EmailDelivery) {
  return {
    retryAvailable: r.kind === 'NOTIFICATION' && ['FAILED','UNKNOWN'].includes(r.status) && r.expiresAt > new Date() && r.attempts < 50 && (!r.firstAttemptAt || Date.now()-r.firstAttemptAt.getTime()<23*3600000),
    id: r.id,
    topic: r.topic,
    kind: r.kind,
    locale: r.locale,
    actionPath: r.actionPath,
    provider: r.provider,
    status: r.status,
    failureCode: r.failureCode,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    version: r.version,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
@Controller("api/v1")
class NotificationsController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  scope(a: Account, staff = false) {
    return staff
      ? a.role === "ADMIN"
        ? {}
        : { region: a.region, kind: "NOTIFICATION" }
      : {
          kind: "NOTIFICATION",
          OR: [
            { accountId: a.id },
            ...(a.email
              ? [
                  {
                    accountId: null,
                    recipientHash: hash(a.email.toLowerCase()),
                  },
                ]
              : []),
          ],
        };
  }
  async owned(db: DB, a: Account, id: string, staff = false) {
    const row = await db.emailDelivery.findFirst({
      where: { id, ...this.scope(a, staff) },
    });
    if (!row) fail(404, "NOT_FOUND", "Email delivery not found.");
    return row;
  }
  async staff(req: HttpRequest, db: DB, a: Account) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('staff-administration',0))`;
    const current = await db.account.findUnique({ where: { id: a.id } }),
      session = await db.session.findUnique({
        where: { accessHash: hash(req.cookies.bcs_access || "") },
      });
    if (
      !current ||
      current.disabled ||
      current.role !== a.role ||
      current.region !== a.region ||
      current.authVersion !== a.authVersion ||
      !session ||
      session.revoked ||
      session.rotated ||
      session.authVersion !== current.authVersion ||
      session.accessExpiresAt <= new Date() ||
      session.expiresAt <= new Date()
    )
      fail(401, "SESSION_REVOKED", "Staff authority changed. Sign in again.");
    if (
      !session.mfaVerifiedAt ||
      session.mfaVerifiedAt.getTime() < Date.now() - 300000
    )
      fail(
        403,
        "MFA_REQUIRED",
        "Verify your authenticator again before email recovery.",
      );
  }
  async list(a: Account, q: z.infer<typeof paging>, staff = false) {
    const where = {
      ...this.scope(a, staff),
      ...(q.status ? { status: q.status } : {}),
    };
    if (
      q.cursor &&
      !(await this.service.db.emailDelivery.count({
        where: { ...where, id: q.cursor },
      }))
    )
      fail(404, "NOT_FOUND", "Delivery history cursor not found.");
    const rows = await this.service.db.emailDelivery.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    return {
      items: rows.slice(0, q.limit).map(projection),
      nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null,
    };
  }
  @Get("notifications") async mine(
    @Req() req: HttpRequest,
    @Query() query: unknown,
  ) {
    const a = await this.service.actor(req, [
      "GUARDIAN",
      "STUDENT",
      "INDEPENDENT_STUDENT",
      "TEACHER",
      "ADMIN",
      "OPERATOR",
      "REVIEWER",
      "FINANCE",
    ]);
    return this.list(a, parse(paging, query));
  }
  @Get("admin/email-deliveries") async queue(
    @Req() req: HttpRequest,
    @Query() query: unknown,
  ) {
    const a = await this.service.actor(req, ["ADMIN", "OPERATOR"]);
    return this.service.db.$transaction(async (db) => {
      await this.staff(req, db, a);
      const result = await this.list(a, parse(paging, query), true);
      await this.service.audit(
        db,
        a,
        req,
        "EMAIL_QUEUE_READ",
        "email",
        "Staff read sanitized email recovery metadata",
      );
      return result;
    });
  }
  @Get("notifications/:id/history") async history(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, [
        "GUARDIAN",
        "STUDENT",
        "INDEPENDENT_STUDENT",
        "TEACHER",
        "ADMIN",
        "OPERATOR",
        "REVIEWER",
        "FINANCE",
      ]),
      q = parse(
        z
          .object({
            staff: z.enum(["true"]).optional(),
            attemptsCursor: uuid.optional(),
            receiptsCursor: text(128).optional(),
            limit: z.coerce.number().int().min(1).max(50).default(20),
          })
          .strict(),
        query,
      ),
      staff = q.staff === "true";
    if (staff && !["ADMIN", "OPERATOR"].includes(a.role))
      fail(403, "FORBIDDEN", "Email recovery is restricted to staff.");
    return this.service.db.$transaction(async (db) => {
      if (staff) await this.staff(req, db, a);
      const row = await this.owned(db, a, id, staff);
      if (
        (q.attemptsCursor &&
          !(await db.emailAttempt.count({
            where: { id: q.attemptsCursor, deliveryId: id },
          }))) ||
        (q.receiptsCursor &&
          !(await db.emailReceipt.count({
            where: { id: q.receiptsCursor, deliveryId: id },
          })))
      )
        fail(404, "NOT_FOUND", "Delivery history cursor not found.");
      const attempts = await db.emailAttempt.findMany({
          where: { deliveryId: id },
          orderBy: { number: "desc" },
          take: q.limit + 1,
          ...(q.attemptsCursor
            ? { cursor: { id: q.attemptsCursor }, skip: 1 }
            : {}),
        }),
        receipts = await db.emailReceipt.findMany({
          where: { deliveryId: id },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: q.limit + 1,
          ...(q.receiptsCursor
            ? { cursor: { id: q.receiptsCursor }, skip: 1 }
            : {}),
        });
      if (staff)
        await this.service.audit(
          db,
          a,
          req,
          "EMAIL_DELIVERY_READ",
          id,
          "Staff read attempt/receipt history without email content",
        );
      return {
        delivery: projection(row),
        providerReference: staff ? row.providerId : null,
        attempts: attempts.slice(0, q.limit),
        attemptsNextCursor:
          attempts.length > q.limit ? attempts[q.limit - 1].id : null,
        receipts: receipts.slice(0, q.limit).map(({ payloadHash, ...r }) => r),
        receiptsNextCursor:
          receipts.length > q.limit ? receipts[q.limit - 1].id : null,
      };
    });
  }
  @Post("admin/email-deliveries/:id/retries") async retry(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, ["ADMIN", "OPERATOR"]),
      data = parse(
        z
          .object({
            expectedVersion: version,
            confirmed: z.literal(true),
            reason: text(500),
          })
          .strict(),
        body,
      );
    const authorize = async (db: DB) => {
      await this.staff(req, db, a);
      return this.owned(db, a, id, true);
    };
    return this.service.once(
      req,
      a,
      "email.retry",
      data,
      async (db) => {
        await authorize(db);
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
        const row = await this.owned(db, a, id, true);
        if (
          row.version !== data.expectedVersion ||
          row.kind === "OTP" ||
          !["FAILED", "UNKNOWN"].includes(row.status) ||
          row.expiresAt <= new Date() ||
          row.attempts >= 50 ||
          (row.firstAttemptAt &&
            Date.now() - row.firstAttemptAt.getTime() >= 23 * 3600000)
        )
          fail(
            409,
            "EMAIL_RETRY_UNAVAILABLE",
            "This delivery needs provider review or a new sign-in request; it cannot be resent safely.",
          );
        let content = row.encryptedContent,
          recipientHash = row.recipientHash;
        if (!content && row.attempts === 0) {
          const owner = row.accountId
            ? await db.account.findUnique({ where: { id: row.accountId } })
            : null;
          if (!owner?.email || owner.disabled)
            fail(
              409,
              "EMAIL_RETRY_UNAVAILABLE",
              "The account needs a current email address before recovery.",
            );
          try {
            content = email.seal(
              {
                ...email.message(
                  owner.email.toLowerCase(),
                  row.locale,
                  row.actionPath!,
                ),
                from: process.env.EMAIL_FROM || null,
              },
              id,
            );
            recipientHash = email.hash(owner.email.toLowerCase());
          } catch {
            fail(
              503,
              "EMAIL_UNAVAILABLE",
              "Email delivery is unavailable. Please retry later.",
            );
          }
        }
        if (!content)
          fail(
            409,
            "EMAIL_RETRY_UNAVAILABLE",
            "This delivery cannot be retried safely.",
          );
        const updated = await db.emailDelivery.update({
          where: { id },
          data: {
            status: "QUEUED",
            encryptedContent: content,
            recipientHash,
            failureCode: null,
            leaseUntil: null,
            nextAttemptAt: null,
            maxAttempts: Math.max(row.maxAttempts, row.attempts + 1),
            version: { increment: 1 },
          },
        });
        await this.service.audit(
          db,
          a,
          req,
          "EMAIL_RETRY_REQUESTED",
          id,
          data.reason,
          undefined,
          { attempts: row.attempts, sameProviderKey: true },
        );
        return projection(updated);
      },
      authorize,
    );
  }
  @Post("notifications/webhooks/resend") async receipt(
    @Req() req: HttpRequest,
    @Body() body: unknown,
  ) {
    let id: string;
    try {
      id = email.verifySignature(
        {
          id: req.get("svix-id"),
          timestamp: req.get("svix-timestamp"),
          signature: req.get("svix-signature"),
        },
        req.rawBody || Buffer.alloc(0),
      );
    } catch (e) {
      fail(
        (e as Error).message === "WEBHOOK_CONFIGURATION" ? 503 : 401,
        "EMAIL_SIGNATURE",
        "Email receipt signature could not be verified.",
      );
    }
    const data = parse(
        z.object({
          type: z.enum([
            "email.sent",
            "email.delivered",
            "email.delivery_delayed",
            "email.bounced",
            "email.complained",
          ]),
          created_at: z.iso.datetime(),
          data: z.object({ email_id: uuid }),
        }),
        body,
      ),
      kind = {
        "email.sent": "ACCEPTED",
        "email.delivered": "DELIVERED",
        "email.delivery_delayed": "DELAYED",
        "email.bounced": "BOUNCED",
        "email.complained": "COMPLAINED",
      }[data.type],
      digest = hash(req.rawBody!.toString("utf8"));
    return this.service.db.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.data.email_id},0))`;
      const prior = await db.emailReceipt.findUnique({ where: { id } });
      if (prior) {
        if (prior.payloadHash !== digest)
          fail(
            409,
            "RECEIPT_CONFLICT",
            "Receipt identity was reused with different content.",
          );
        return { id, status: "RECORDED" };
      }
      const delivery = await db.emailDelivery.findUnique({
        where: { providerId: data.data.email_id },
      });
      await db.emailReceipt.create({
        data: {
          id,
          providerId: data.data.email_id,
          deliveryId: delivery?.id,
          kind,
          payloadHash: digest,
          occurredAt: new Date(data.created_at),
        },
      });
      if (delivery) await email.applyReceipts(db, delivery);
      return { id, status: "RECORDED" };
    });
  }
}
@Module({
  imports: [PersistenceModule],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
