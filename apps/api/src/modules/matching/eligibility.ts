import type { Teacher, TuitionRequest, Child } from "@prisma/client";
import type { DB } from "../../shared";
import { eligible } from "../../policies";
import { weeklyFit } from "./weekly-fit";
import { available, capacity, calendarSnapshot } from "../scheduling/calendar";
import {
  preferenceSchema,
  normalizedPreferences,
} from "../requests/request-schedule";
export async function matched(
  db: DB,
  request: TuitionRequest,
  child: Child,
  teacher: Teacher,
) {
  if (request.rematchFromPlacementId) {
    const old = await db.placement.findUnique({
      where: { id: request.rematchFromPlacementId },
    });
    if (old?.teacherId === teacher.id) return null;
  }
  if (
    (request.preferredTeacherId && request.preferredTeacherId !== teacher.id) ||
    !eligible(request, child, teacher) ||
    (request.mode === "HOME" &&
      (teacher.region !== request.region || !teacher.travelAccepted))
  )
    return null;
  const account = await db.account.findUnique({
    where: { id: teacher.accountId },
  });
  if (!account || account.disabled || account.role !== "TEACHER") return null;
  if (!(await capacity(db, teacher, child.id))) return null;
  const parsed = preferenceSchema.safeParse(request.schedulePreferences);
  if (request.scheduleStatus !== "CONFIRMED" || !parsed.success) return null;
  const preferences = normalizedPreferences(parsed.data);
  if (!preferences) return null;
  const now = new Date();
  const windows =
    "weekly" in preferences
      ? weeklyFit(
          await calendarSnapshot(
            db,
            teacher.id,
            "RECURRING",
            new Date(now.getTime() + 3600000),
            new Date(now.getTime() + 60 * 86400000),
          ),
          preferences.weekly!,
          now,
        )
      : [];
  for (const slot of preferences.slots || []) {
    const pattern = await available(
      db,
      teacher.id,
      "RECURRING",
      new Date(slot.startsAt),
      new Date(slot.endsAt),
    );
    if (pattern)
      windows.push({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        patternId: pattern.id,
      });
  }
  return windows.length
    ? {
        teacherId: teacher.id,
        teacherVersion: teacher.version,
        monthlyPaise: teacher.monthlyPaise,
        windows,
        maxActiveStudents: teacher.maxActiveStudents,
      }
    : null;
}
export const ruleRanker = {
  rank(
    request: { budgetPaise: number },
    pool: { teacherId: string; monthlyPaise: number; windows: unknown[] }[],
    context: { mode: string },
  ) {
    return {
      rankerVersion: "rules-v2",
      featureVersion: "education-scopes-v2",
      items: pool
        .map((t) => ({
          teacherId: t.teacherId,
          score:
            100 +
            Math.floor((1 - t.monthlyPaise / request.budgetPaise) * 20) +
            Math.min(3, t.windows.length) * 5,
          reasonCodes: [
            "COVERAGE",
            "LANGUAGE",
            "BUDGET",
            "MODE",
            "CAPACITY",
            "CONFIRMED_SCHEDULE",
            ...(context.mode === "HOME"
              ? ["SERVICE_AREA_TRAVEL_ACCEPTED"]
              : []),
          ],
        }))
        .sort(
          (a, b) => b.score - a.score || a.teacherId.localeCompare(b.teacherId),
        ),
    };
  },
};
