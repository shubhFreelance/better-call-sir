import App from "../ui";
import type { Teacher } from "@bcs/api-client";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  let initialTeachers: { items: Teacher[] } | undefined,
    initialTeacher: Teacher | undefined;
  if (path[0] === "teachers")
    try {
      const url = `${process.env.API_INTERNAL_URL || "http://127.0.0.1:4000"}/api/v1/teachers${path[1] ? "/" + encodeURIComponent(path[1]) : ""}`;
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        if (path[1]) initialTeacher = await response.json();
        else initialTeachers = await response.json();
      }
    } catch {}
  return (
    <App initialTeachers={initialTeachers} initialTeacher={initialTeacher} />
  );
}
