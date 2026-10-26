import {
  Module,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Inject,
} from "@nestjs/common";
import { z } from "zod";
import {
  AppService,
  PersistenceModule,
  HttpRequest,
  parse,
  uuid,
  fail,
} from "../../shared";
@Controller("api/v1")
class InboxController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  @Get("inbox") async list(@Req() req: HttpRequest, @Query() query: unknown) {
    const a = await this.service.actor(req, undefined, false),
      q = parse(z.object({ cursor: uuid.optional() }).strict(), query),
      db = this.service.db;
    const anchor = q.cursor
      ? await db.inboxNotification.findFirst({
          where: { id: q.cursor, accountId: a.id },
        })
      : null;
    if (q.cursor && !anchor)
      fail(404, "NOT_FOUND", "Notification unavailable.");
    const items = await db.inboxNotification.findMany({
      select: {
        id: true,
        topic: true,
        actionPath: true,
        important: true,
        readAt: true,
        createdAt: true,
      },
      where: {
        accountId: a.id,
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
    });
    const tasks: { id: string; title: string; actionPath: string }[] = [];
    if (a.role === "GUARDIAN" && a.registrationIntent !== "STUDENT")
      for (const v of await db.guardianVerification.findMany({
        where: {
          guardianId: a.id,
          OR: [
            { status: { in: ["DRAFT", "CHANGES_REQUESTED", "PENDING"] } },
            { status: "APPROVED", learnerId: null },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }))
        tasks.push({
          id: v.id,
          title:
            v.status === "APPROVED"
              ? "Complete student setup"
              : "Guardian verification needs attention",
          actionPath: "/guardian-verification?verification=" + v.id,
        });
    if (
      a.role === "TEACHER" &&
      (!(await db.teacher.count({ where: { accountId: a.id } })) ||
        (await db.teacher.count({
          where: { accountId: a.id, status: "DRAFT" },
        })))
    )
      tasks.push({
        id: a.id,
        title: "Complete your teaching profile",
        actionPath: "/onboarding/teacher",
      });
    return {
      tasks,
      items: items.slice(0, 20),
      nextCursor: items.length > 20 ? items[19].id : null,
      unread: await db.inboxNotification.count({
        where: { accountId: a.id, readAt: null },
      }),
    };
  }
  @Post("inbox/:id/read") async read(
    @Req() req: HttpRequest,
    @Param("id") id: string,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req);
    const r = await this.service.db.inboxNotification.updateMany({
      where: { id, accountId: a.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (
      !r.count &&
      !(await this.service.db.inboxNotification.count({
        where: { id, accountId: a.id },
      }))
    )
      fail(404, "NOT_FOUND", "Notification unavailable.");
    return { read: true };
  }
}
@Module({ imports: [PersistenceModule], controllers: [InboxController] })
export class LiveInboxModule {}
