"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Session } from "@bcs/api-client";
type Entry = { accountId: string; existing: boolean } | null;
const AccountEntry = createContext<{
  entry: Entry;
  recordEntry: (session: Session | null) => void;
}>({ entry: null, recordEntry: () => {} });
export function AccountEntryProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<Entry>(null);
  function recordEntry(session: Session | null) {
    setEntry((current) =>
      !session
        ? null
        : typeof session.accountCreated === "boolean"
          ? { accountId: session.account.id, existing: !session.accountCreated }
          : current?.accountId === session.account.id
            ? current
            : null,
    );
  }
  return (
    <AccountEntry.Provider value={{ entry, recordEntry }}>
      {children}
    </AccountEntry.Provider>
  );
}
export const useAccountEntry = () => useContext(AccountEntry);
