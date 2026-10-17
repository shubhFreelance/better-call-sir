"use client";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { InfiniteData } from "@tanstack/react-query";
import type { Teacher } from "@bcs/api-client";

export const emptyTeacherFilters = {
  stage: "",
  level: "",
  courseName: "",
  studyYear: "",
  q: "",
  subject: "",
  mode: "",
  board: "",
  grade: "",
  language: "",
  locality: "",
  maxMonthly: "",
};
export type TeacherSearchPage = {
  items: Teacher[];
  nextCursor?: string | null;
};
type SearchState = {
  filters: typeof emptyTeacherFilters;
  results?: {
    key: string;
    data: InfiniteData<TeacherSearchPage, string>;
    updatedAt: number;
  };
};
const SearchContext = createContext<
  [SearchState, Dispatch<SetStateAction<SearchState>>] | null
>(null);

// Only public discovery state survives route changes; private query clients remain route-scoped.
export function TeacherSearchProvider({ children }: { children: ReactNode }) {
  const state = useState<SearchState>({ filters: { ...emptyTeacherFilters } });
  return (
    <SearchContext.Provider value={state}>{children}</SearchContext.Provider>
  );
}
export function useTeacherSearchState() {
  const state = useContext(SearchContext);
  if (!state) throw new Error("TeacherSearchProvider is required");
  return state;
}
