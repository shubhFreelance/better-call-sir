import { z } from "zod";
export const preferenceSchema = z
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
export function normalizedPreferences(
  data: z.infer<typeof preferenceSchema>,
  now = new Date(),
) {
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
