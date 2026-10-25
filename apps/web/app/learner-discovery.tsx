"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, type Session, type components } from "@bcs/api-client";

type Profile = components["schemas"]["LearnerProfile"];
export function useLearnerDiscovery(session: Session | null) {
  const params = useSearchParams(), router = useRouter(), pathname = usePathname();
  const required = !!session && ["GUARDIAN", "STUDENT", "INDEPENDENT_STUDENT"].includes(session.account.role);
  const query = useInfiniteQuery({
    queryKey: ["discovery-learners", session?.account.id],
    initialPageParam: "",
    enabled: required,
    retry: false,
    queryFn: async ({ pageParam, signal }): Promise<{ items: Profile[]; nextCursor: string | null }> => {
      if (session?.account.role === "INDEPENDENT_STUDENT") {
        const p = await api<components["schemas"]["IndependentStudentProfile"]>("/independent-student/profile", { signal });
        return { items: [{ id: p.accountId, alias: session.account.name, education: p.education, version: p.version, enquiryEligible: p.editStatus !== "PRIVACY_PAUSED" }], nextCursor: null };
      }
      return api("/learner-profiles?limit=50" + (pageParam ? "&cursor=" + pageParam : ""), { signal });
    },
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
  const learners = query.error ? [] : query.data?.pages.flatMap(page => page.items) ?? [];
  const requested = params.get("learner");
  const learner = requested ? learners.find(row => row.id === requested)
    : learners.length === 1 && !query.hasNextPage ? learners[0] : undefined;
  return {
    required, query, learners, learner,
    ready: !!learner?.enquiryEligible && !query.error && !query.isPending && !query.isFetching,
    select: (id: string) => {
      const next = new URLSearchParams(params);
      if (id) next.set("learner", id); else next.delete("learner");
      router.replace(pathname + "?" + next, { scroll: false });
    },
  };
}
