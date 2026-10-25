"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { Button } from "./button";
import { useAppTranslation } from "../../app/locale";

export function ActionToast({ message, error = false }: { message: string; error?: boolean }) {
  const [mounted, setMounted] = useState(false), [dismissed, setDismissed] = useState(false);
  const { appText } = useAppTranslation();
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setDismissed(false);
    if (!message) return;
    const timer = window.setTimeout(() => setDismissed(true), 5000);
    return () => window.clearTimeout(timer);
  }, [message, error]);
  if (!mounted || !message || dismissed) return null;
  const Icon = error ? CircleAlert : CheckCircle2;
  return createPortal(<div className="action-toast" data-error={error} role={error ? "alert" : "status"}>
    <Icon size={20} aria-hidden="true" /><p>{message}</p>
    <Button type="button" variant="ghost" size="icon" aria-label={appText("Close")} onClick={() => setDismissed(true)}><X size={18} aria-hidden="true" /></Button>
  </div>, document.body);
}
