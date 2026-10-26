"use client";
import { useInfiniteQuery,useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {useTransition} from 'react';
import { api, type Session, type components } from "@bcs/api-client";

type Profile = components["schemas"]["LearnerProfile"];
export function useLearnerDiscovery(session: Session | null, refreshSpacesOnFocus=true) {
  const params = useSearchParams(), router = useRouter(), pathname = usePathname();
  const [transitioning,startTransition]=useTransition();
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
  const managed = !!session && ['GUARDIAN','STUDENT'].includes(session.account.role);
  const spacesQuery=useQuery({queryKey:['learner-spaces',session?.account.id,learner?.id],enabled:managed&&!!learner&&!query.error,retry:false,refetchOnWindowFocus:refreshSpacesOnFocus,refetchOnReconnect:refreshSpacesOnFocus,queryFn:({signal})=>api<components['schemas']['LearnerSpaces']>(`/children/${learner!.id}/learning-spaces`,{signal})});
  return {
    required, query, learners, learner,managed,transitioning,spacesQuery,spaces:spacesQuery.error?[]:spacesQuery.data?.spaces||[],
    ready: !!learner?.enquiryEligible && !query.error && !query.isPending && !query.isFetching && !transitioning,
    selectSpace:(subject:string)=>{const next=new URLSearchParams(params);if(subject)next.set('subject',subject);else next.delete('subject');startTransition(()=>router.replace(pathname+'?'+next,{scroll:false}));},
    select: (id: string) => {
      const next = new URLSearchParams(params);
      next.delete('subject');
      if (id) next.set("learner", id); else next.delete("learner");
      startTransition(()=>router.replace(pathname + "?" + next, { scroll: false }));
    },
  };
}
