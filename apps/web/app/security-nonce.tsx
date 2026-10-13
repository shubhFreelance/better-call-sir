"use client";
import { createContext, useContext, type ReactNode } from "react";
const Nonce = createContext<string | undefined>(undefined);
export const useScriptNonce = () => useContext(Nonce);
export function ScriptNonceProvider({
  nonce,
  children,
}: {
  nonce: string | undefined;
  children: ReactNode;
}) {
  return <Nonce.Provider value={nonce}>{children}</Nonce.Provider>;
}
