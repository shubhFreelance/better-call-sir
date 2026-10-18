import {
  Module,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Body,
  Inject,
} from "@nestjs/common";
import type { Account } from "@prisma/client";
import { z } from "zod";
import {
  AppService,
  PersistenceModule,
  DB,
  HttpRequest,
  uuid,
  version,
  parse,
  fail,
} from "../../shared";

export const managementModes = z.enum([
  "GUARDIAN_ONLY",
  "SHARED",
  "STUDENT_LED",
]);
export const familyActor = (actor: Account) =>
  actor.role === "GUARDIAN" || actor.role === "STUDENT";

// Guardian consent and ownership remain separate from permission to choose tuition.
export async function learningAuthority(
  db: DB,
  service: AppService,
  actor: Account,
  id: string,
  write = false,
) {
  if (actor.role === "GUARDIAN") await service.guardian(db, actor.id);
  const initial = await db.child.findUnique({ where: { id } });
  if (
    !initial ||
    !familyActor(actor) ||
    (actor.role === "GUARDIAN"
      ? initial.guardianId !== actor.id
      : initial.studentAccountId !== actor.id)
  )
    fail(404, "NOT_FOUND", "Learner access is unavailable.");
  await service.guardian(db, initial.guardianId);
  const child = await service.child(db, actor, id);
  if (
    actor.role === "STUDENT" &&
    (child.studentAccessRevokedAt ||
      (write && child.learningManagementMode === "GUARDIAN_ONLY"))
  )
    fail(
      403,
      "GUARDIAN_MANAGED",
      "Your guardian currently manages learning decisions.",
    );
  return child;
}
export async function requestAuthority(
  db: DB,
  service: AppService,
  actor: Account,
  id: string,
  write = false,
  includeDelegated = false,
) {
  const request = await db.tuitionRequest.findUnique({ where: { id } });
  if (!request) fail(404, "NOT_FOUND", "Enquiry access is unavailable.");
  await learningAuthority(db, service, actor, request.childId, write);
  if (
    write &&
    actor.role === "STUDENT" &&
    request.guardianDecisionRequested &&
    !includeDelegated
  )
    fail(
      403,
      "GUARDIAN_DECISION_REQUESTED",
      "You asked your guardian to manage this enquiry.",
    );
  return request;
}
export function managementView(
  child: {
    id: string;
    learningManagementMode: string;
    learningManagementVersion: number;
  },
  actor: Account,
) {
  const guardian = actor.role === "GUARDIAN";
  return {
    childId: child.id,
    mode: child.learningManagementMode,
    version: child.learningManagementVersion,
    canManageLearning:
      guardian || child.learningManagementMode !== "GUARDIAN_ONLY",
    canChangeManagement: guardian,
    canManageConsent: guardian,
    canConfirmFinancialCommencement: guardian,
  };
}
@Controller("api/v1")
class LearningManagementController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  @Get("children/:id/learning-management") async read(
    @Req() req: HttpRequest,
    @Param("id") id: string,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN", "STUDENT"]);
    return this.service.db.$transaction(async (db) =>
      managementView(
        await learningAuthority(db, this.service, actor, id),
        actor,
      ),
    );
  }
  @Post("children/:id/learning-management") async update(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN"]),
      data = parse(
        z
          .object({
            mode: managementModes,
            expectedVersion: version,
            confirmed: z.literal(true),
          })
          .strict(),
        body,
      );
    const authorize = (db: DB) =>
      learningAuthority(db, this.service, actor, id);
    return this.service.once(
      req,
      actor,
      "learning.management",
      data,
      async (db) => {
        const child = await authorize(db);
        if (child.learningManagementVersion !== data.expectedVersion)
          fail(
            409,
            "CONFLICT",
            "Learning management changed. Reload and review the current choice.",
          );
        const updated = await db.child.update({
          where: { id },
          data: {
            learningManagementMode: data.mode,
            learningManagementVersion: { increment: 1 },
          },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "LEARNING_MANAGEMENT_CHANGED",
          id,
          "Guardian reviewed learning decision permissions",
          { mode: child.learningManagementMode },
          { mode: data.mode, version: updated.learningManagementVersion },
        );
        await this.service.event(
          db,
          "learning.management_changed",
          id,
          updated.learningManagementVersion,
        );
        return managementView(updated, actor);
      },
      authorize,
    );
  }
  @Post("requests/:id/decision-authority") async delegate(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN", "STUDENT"]),
      data = parse(
        z
          .object({
            guardianDecisionRequested: z.boolean(),
            expectedVersion: version,
            confirmed: z.literal(true),
          })
          .strict(),
        body,
      );
    const authorize = (db: DB) =>
      requestAuthority(db, this.service, actor, id, true, true);
    return this.service.once(
      req,
      actor,
      "learning.enquiry.authority",
      data,
      async (db) => {
        const r = await authorize(db);
        if (r.version !== data.expectedVersion || r.status !== "OPEN")
          fail(409, "CONFLICT", "This enquiry changed or is closed.");
        const updated = await db.tuitionRequest.update({
          where: { id },
          data: {
            guardianDecisionRequested: data.guardianDecisionRequested,
            version: { increment: 1 },
          },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "ENQUIRY_DECISION_AUTHORITY_CHANGED",
          id,
          "Family reviewed who decides for this enquiry",
          undefined,
          { guardianDecisionRequested: data.guardianDecisionRequested },
        );
        return updated;
      },
      authorize,
    );
  }
}
@Module({
  imports: [PersistenceModule],
  controllers: [LearningManagementController],
})
export class LearningManagementModule {}
