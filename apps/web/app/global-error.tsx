"use client";
import "@fontsource-variable/manrope";
import "@fontsource-variable/noto-sans-devanagari";
import "./globals.css";
import { FallbackScreen } from "./fallback-screen";
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <FallbackScreen kind="error" retry={retry} />
      </body>
    </html>
  );
}
