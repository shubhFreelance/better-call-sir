"use client";
import { FallbackScreen } from "./fallback-screen";
export default function ErrorScreen({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <FallbackScreen kind="error" retry={retry} />;
}
