import type { Teacher, AvailabilityPattern } from "@prisma/client";
import type { DB } from "../../shared";
const offset = 330 * 60000;
export function patternInterval(
  pattern: {
    weekday: number;
    startMinute: number;
    endMinute: number;
    validFrom: Date;
    validUntil: Date;
    active: boolean;
  },
  day: Date,
) {
  const local = new Date(day.getTime() + offset),
    midnight = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
    );
  if (
    !pattern.active ||
    local.getUTCDay() !== pattern.weekday ||
    midnight < pattern.validFrom.getTime() ||
    midnight > pattern.validUntil.getTime()
  )
    return null;
  return {
    startsAt: new Date(midnight + pattern.startMinute * 60000 - offset),
    endsAt: new Date(midnight + pattern.endMinute * 60000 - offset),
  };
}
export async function calendarSnapshot(
  db: DB,
  teacherId: string,
  kind: string,
  startsAt: Date,
  endsAt: Date,
  ignoreId?: string,
) {
  const patterns = await db.availabilityPattern.findMany({
    where: { teacherId, kind, active: true },
  });
  const leaves = await db.availabilityException.findMany({
    where: {
      teacherId,
      active: true,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { startsAt: true, endsAt: true },
  });
  const reservations = await db.reservation.findMany({
    where: {
      teacherId,
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
      OR: [
        { status: "CONFIRMED" },
        { status: "HOLD", expiresAt: { gt: new Date() } },
      ],
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { startsAt: true, endsAt: true },
  });
  return { patterns, blocks: [...leaves, ...reservations] };
}
export function availableIn(
  snapshot: {
    patterns: AvailabilityPattern[];
    blocks: { startsAt: Date; endsAt: Date }[];
  },
  startsAt: Date,
  endsAt: Date,
  now = new Date(),
  minimumLeadMs = 3600000,
) {
  if (
    endsAt <= startsAt ||
    startsAt.getTime() < now.getTime() + minimumLeadMs ||
    endsAt.getTime() > now.getTime() + 60 * 86400000 ||
    snapshot.blocks.some((b) => b.startsAt < endsAt && b.endsAt > startsAt)
  )
    return null;
  return (
    snapshot.patterns.find((p) => {
      const window = patternInterval(p, startsAt);
      return window && startsAt >= window.startsAt && endsAt <= window.endsAt;
    }) || null
  );
}
export async function available(
  db: DB,
  teacherId: string,
  kind: string,
  startsAt: Date,
  endsAt: Date,
  ignoreId?: string,
  minimumLeadMs = 3600000,
) {
  return availableIn(
    await calendarSnapshot(db, teacherId, kind, startsAt, endsAt, ignoreId),
    startsAt,
    endsAt,
    new Date(),
    minimumLeadMs,
  );
}
export function slotStarts(
  patterns: AvailabilityPattern[],
  from: Date,
  to: Date,
  duration: number,
) {
  const shifted = new Date(from.getTime() + offset),
    firstMidnight = Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ),
    times = new Set<number>();
  for (let day = firstMidnight; day < to.getTime() + offset; day += 86400000)
    for (const pattern of patterns) {
      const interval = patternInterval(pattern, new Date(day - offset));
      if (!interval) continue;
      const first =
        interval.startsAt.getTime() +
        Math.max(
          0,
          Math.ceil((from.getTime() - interval.startsAt.getTime()) / 1200000),
        ) *
          1200000;
      for (
        let at = first;
        at + duration * 60000 <=
        Math.min(interval.endsAt.getTime(), to.getTime());
        at += 1200000
      )
        times.add(at);
    }
  return [...times].sort((a, b) => a - b).map((ms) => new Date(ms));
}
export async function capacity(
  db: DB,
  teacher: Pick<Teacher, "id" | "maxActiveStudents">,
  childId?: string,
  studentAccountId?: string,
) {
  const placements = await db.placement.findMany({
    where: {
      teacherId: teacher.id,
      status: { in: ["ACTIVE", "TERMS_PENDING"] },
    },
    select: { childId: true },
  });
  const independent = await db.studentArrangement.findMany({where:{teacherId:teacher.id,status:{in:["TERMS_PENDING","CONFIRMED"]}},select:{studentAccountId:true}});
  const students = new Set([...placements.map(p=>p.childId),...independent.map(p=>p.studentAccountId)]);
  return (
    (!!childId && students.has(childId)) || (!!studentAccountId && students.has(studentAccountId)) ||
    students.size < teacher.maxActiveStudents
  );
}
