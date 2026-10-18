"use client";
import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { useAppTranslation } from "./locale";

// One history policy for private lists; arrayKeys also covers paired calendar and linkage lists.
export function useHistory<T extends { nextCursor?: string | null }>({
  queryKey,
  path,
  enabled = true,
  arrayKeys = ["items" as keyof T],
}: {
  queryKey: readonly unknown[];
  path: string;
  enabled?: boolean;
  arrayKeys?: readonly (keyof T)[];
}) {
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<T>(
        path +
          (pageParam
            ? (path.includes("?") ? "&" : "?") +
              "cursor=" +
              encodeURIComponent(pageParam)
            : ""),
        { signal },
      ),
    getNextPageParam: (page, _pages, _last, params) =>
      page.nextCursor && !params.includes(page.nextCursor)
        ? page.nextCursor
        : undefined,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  let data: T | undefined;
  let loadedCount = 0;
  if (query.data && !query.error) {
    data = { ...query.data.pages[0] };
    for (const key of arrayKeys) {
      const seen = new Set<string>();
      const rows = query.data.pages.flatMap((p) =>
        Array.isArray(p[key]) ? p[key] : [],
      ) as { id: string }[];
      const unique = rows.filter((r) => !seen.has(r.id) && !!seen.add(r.id));
      data[key] = unique as T[keyof T];
      loadedCount += unique.length;
    }
  }
  const last = query.data?.pages.at(-1)?.nextCursor;
  const looped = !!last && !!query.data?.pageParams.includes(last);
  return {
    ...query,
    data,
    loadedCount,
    looped,
    restart: () => client.resetQueries({ queryKey, exact: true }),
  };
}
type HistoryState = {
  isPending: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  error: Error | null;
  hasNextPage: boolean;
  looped: boolean;
  loadedCount: number;
  refetch: () => Promise<unknown>;
  fetchNextPage: () => Promise<unknown>;
  restart: () => Promise<unknown>;
};
export function HistoryPages({
  history,
  disabled = false,
  label,
}: {
  history: HistoryState;
  disabled?: boolean;
  label: string;
}) {
  const { appText } = useAppTranslation();
  const target = useRef<HTMLDivElement>(null),
    focus = useRef(false);
  useEffect(() => {
    if (focus.current && !history.isFetching) {
      focus.current = false;
      target.current?.focus();
    }
  }, [history.isFetching, history.error, history.loadedCount]);
  const action = (run: () => Promise<unknown>) => {
    focus.current = true;
    void run();
  };
  return (
    <div
      className="history-controls"
      role="group"
      aria-label={appText(label)}
      aria-busy={history.isFetching}
      ref={target}
      tabIndex={-1}
    >
      <p role="status">
        {history.isFetching
          ? appText("Loading history…")
          : history.error
            ? appText(
                "History is unavailable. Retry or reload from the beginning.",
              )
            : history.looped
              ? appText("History changed. Reload from the beginning.")
              : appText("Showing {0} records.", [history.loadedCount])}
      </p>
      {history.error && (
        <Button
          variant="outline"
          disabled={disabled || history.isFetching}
          onClick={() => action(() => history.refetch())}
        >
          {appText("Retry history")}
        </Button>
      )}
      {!history.error && history.hasNextPage && (
        <Button
          variant="outline"
          disabled={disabled || history.isFetching}
          onClick={() => action(() => history.fetchNextPage())}
        >
          {appText("Load more records")}
        </Button>
      )}
      <Button
        variant="ghost"
        disabled={disabled || history.isFetching}
        onClick={() => action(history.restart)}
      >
        {appText("Reload history")}
      </Button>
    </div>
  );
}
