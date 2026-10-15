import { z } from "zod";
export const datedPreferenceSchema = z
  .object({
    timezone: z.literal("Asia/Kolkata"),
    slots: z
      .array(
        z
          .object({
            startsAt: z.iso.datetime({ offset: true }),
            endsAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();
export const weeklyPreferenceSchema = z
  .object({
    timezone: z.literal("Asia/Kolkata"),
    weekly: z
      .array(
        z
          .object({
            weekday: z.number().int().min(0).max(6),
            startMinute: z.number().int().min(0).max(1439),
            endMinute: z.number().int().min(1).max(1440),
          })
          .strict(),
      )
      .min(1)
      .max(14),
  })
  .strict();
export const preferenceSchema = z.union([
  datedPreferenceSchema,
  weeklyPreferenceSchema,
]);
export const preferenceUpdateSchema = z.union([
  datedPreferenceSchema
    .extend({ expectedVersion: z.number().int().positive() })
    .strict(),
  weeklyPreferenceSchema
    .extend({ expectedVersion: z.number().int().positive() })
    .strict(),
]);
export function normalizedPreferences(
  data: z.infer<typeof preferenceSchema>,
  now = new Date(),
) {
  if ("weekly" in data) {
    const weekly = [...data.weekly].sort(
      (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
    );
    if (
      weekly.some(
        (w, i) =>
          w.endMinute - w.startMinute < 20 ||
          (i > 0 &&
            weekly[i - 1].weekday === w.weekday &&
            weekly[i - 1].endMinute > w.startMinute),
      )
    )
      return null;
    return { timezone: data.timezone, weekly };
  }
  const slots = data.slots
    .map((s) => ({
      startsAt: new Date(s.startsAt),
      endsAt: new Date(s.endsAt),
    }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (
    slots.some((s, i) => {
      const duration = s.endsAt.getTime() - s.startsAt.getTime();
      return (
        s.startsAt.getTime() < now.getTime() + 3600000 ||
        s.endsAt.getTime() > now.getTime() + 60 * 86400000 ||
        duration < 20 * 60000 ||
        duration > 120 * 60000 ||
        (i > 0 && slots[i - 1].endsAt > s.startsAt)
      );
    })
  )
    return null;
  return {
    timezone: data.timezone,
    slots: slots.map((s) => ({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
    })),
  };
}
