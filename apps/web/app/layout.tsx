import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
import { headers } from "next/headers";
import { ScriptNonceProvider } from "./security-nonce";
export const metadata: Metadata = {
  title: "Better Call Sir · Find your kind of teacher",
  description:
    "Find a teacher who understands your child. Maths and Science tuition for Classes 6–10 in Raipur.",
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <html lang="en">
      <body>
        <ScriptNonceProvider nonce={nonce}>{children}</ScriptNonceProvider>
      </body>
    </html>
  );
}
