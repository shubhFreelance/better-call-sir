import { DB } from "../../shared";
export async function snapshotMinimum(
  db: DB,
  kind: "PLACEMENT" | "INDEPENDENT",
  resourceId: string,
  monthlyPaise: number,
  days: number | null,
) {
  // Legacy unspecified preferences never become a retroactive financial obligation.
  if (days === null) return;
  const minimumPaise =
    days === 15 ? Math.ceil(monthlyPaise / 2) : days === 30 ? monthlyPaise : 0;
  await db.tuitionMinimum.create({
    data: {
      kind,
      resourceId,
      monthlyPaise,
      days,
      minimumPaise,
      adjustedPaise: minimumPaise,
    },
  });
}
