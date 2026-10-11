import App from "./ui";
import type { Teacher } from "@bcs/api-client";
export const dynamic = "force-dynamic";
export default async function Page() {
  let initialTeachers: { items: Teacher[] } | undefined;
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL || "http://127.0.0.1:4000"}/api/v1/teachers`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (response.ok) initialTeachers = await response.json();
  } catch {}
  return <App initialTeachers={initialTeachers} />;
}
