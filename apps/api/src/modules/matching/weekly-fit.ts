import { availableIn, patternInterval } from "../scheduling/calendar";
import type { AvailabilityPattern } from "@prisma/client";
// A 20-minute free overlap is fit evidence only; it never creates a class or fixes its duration.
export function weeklyFit(
  snapshot: {
    patterns: AvailabilityPattern[];
    blocks: { startsAt: Date; endsAt: Date }[];
  },
  weekly: { weekday: number; startMinute: number; endMinute: number }[],
  now = new Date(),
) {
  const offset = 330 * 60000,
    local = new Date(now.getTime() + offset),
    first = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
    ),
    lead = Math.ceil((now.getTime() + 3600000) / 60000) * 60000,
    horizon = now.getTime() + 60 * 86400000,
    minimum = 20 * 60000;
  const blocks = [...snapshot.blocks].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    ),
    windows = [];
  for (const range of weekly) {
    let found = false;
    for (let day = first; day - offset < horizon && !found; day += 86400000) {
      if (new Date(day).getUTCDay() !== range.weekday) continue;
      for (const pattern of snapshot.patterns) {
        const interval = patternInterval(pattern, new Date(day - offset));
        if (!interval) continue;
        let cursor = Math.max(
          day + range.startMinute * 60000 - offset,
          interval.startsAt.getTime(),
          lead,
        );
        const end = Math.min(
          day + range.endMinute * 60000 - offset,
          interval.endsAt.getTime(),
          horizon,
        );
        if (cursor + minimum > end) continue;
        for (const block of blocks) {
          if (block.endsAt.getTime() <= cursor) continue;
          if (block.startsAt.getTime() >= cursor + minimum) break;
          cursor = Math.max(cursor, block.endsAt.getTime());
        }
        if (cursor + minimum > end) continue;
        const startsAt = new Date(cursor),
          endsAt = new Date(cursor + minimum),
          fit = availableIn(snapshot, startsAt, endsAt, now);
        if (fit) {
          windows.push({
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            patternId: fit.id,
          });
          found = true;
          break;
        }
      }
    }
  }
  return windows;
}
