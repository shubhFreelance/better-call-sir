import { z } from "zod";
export const placement = z.enum(["HOME", "SEARCH", "SPACE"]);
export const planDefaults = [
  { id: "SEARCH", amountPaise: 29900, days: 7 },
  { id: "HOME", amountPaise: 59900, days: 7 },
  { id: "SPACE", amountPaise: 99900, days: 7 },
] as const;
export const actions = z.enum([
  "APPROVE",
  "REJECT",
  "PAUSE",
  "RESUME",
  "CANCEL",
]);
export function nextStatus(
  status: string,
  action: z.infer<typeof actions>,
  admin: boolean,
) {
  if (action === "APPROVE" && admin && status === "PENDING") return "ACTIVE";
  if (action === "REJECT" && admin && status === "PENDING") return "REJECTED";
  if (action === "PAUSE" && status === "ACTIVE") return "PAUSED";
  if (action === "RESUME" && status === "PAUSED") return "ACTIVE";
  if (action === "CANCEL" && ["PENDING", "ACTIVE", "PAUSED"].includes(status))
    return "CANCELLED";
  return null;
}
export const displayStatus = (
  c: { status: string; endsAt: Date | null },
  now = new Date(),
) =>
  ["ACTIVE", "PAUSED"].includes(c.status) && c.endsAt && c.endsAt <= now
    ? "EXPIRED"
    : c.status;
export function pricesOrdered(
  plans: { id: string; amountPaise: number; days: number }[],
) {
  const ordered = ["SEARCH", "HOME", "SPACE"].map((id) =>
    plans.find((p) => p.id === id),
  );
  return (
    ordered.every(Boolean) &&
    ordered
      .slice(1)
      .every(
        (p, i) =>
          ordered[i]!.amountPaise * p!.days < p!.amountPaise * ordered[i]!.days,
      )
  );
}
