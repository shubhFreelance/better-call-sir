import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/noto-sans-devanagari";
import "./globals.css";
import { cookies, headers } from "next/headers";
import { ScriptNonceProvider } from "./security-nonce";
import { LocaleBoundary } from "./locale";
import { TeacherSearchProvider } from "./teacher-search-state";
export async function generateMetadata(): Promise<Metadata> {
  const hindi = (await cookies()).get("bcs.interface-language")?.value === "hi";
  return {
    title: hindi
      ? "Better Call Sir · अपने अनुरूप शिक्षक खोजें"
      : "Better Call Sir · Find your kind of teacher",
    description: hindi
      ? "शुरुआती शिक्षा, स्कूल या कॉलेज के लिए अपने अनुरूप शिक्षक खोजें—ऑनलाइन या आसपास।"
      : "Find a teacher for early learning, school or college, online or close to home.",
  };
}
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  const hindi = (await cookies()).get("bcs.interface-language")?.value === "hi";
  return (
    <html lang={hindi ? "hi" : "en"}>
      <body>
        <ScriptNonceProvider nonce={nonce}>
          <LocaleBoundary hindi={hindi}>
            <TeacherSearchProvider>{children}</TeacherSearchProvider>
          </LocaleBoundary>
        </ScriptNonceProvider>
      </body>
    </html>
  );
}
