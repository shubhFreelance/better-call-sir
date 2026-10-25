"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { useAppTranslation } from "../../app/locale";

export function Modal({ open, onOpenChange, title, description, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode;
}) {
  const { appText } = useAppTranslation(), id = useId(), dialog = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    if (!node.open) node.showModal(); document.body.style.overflow = "hidden";
    return () => {
      node.close(); document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, mounted]);
  if (!mounted) return null;
  return createPortal(<dialog ref={dialog} className="app-modal" aria-labelledby={id} aria-describedby={description ? id + "-description" : undefined}
    onCancel={event => { event.preventDefault(); onOpenChange(false); }} onClose={() => onOpenChange(false)}
    onKeyDown={event => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>("button,a[href],input,select,textarea,summary,[tabindex],[contenteditable=true]")]
        .filter(item => !item.matches(":disabled") && item.checkVisibility() && (item.tabIndex >= 0 || item.isContentEditable));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
    }}
    onClick={event => {
      event.stopPropagation();
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onOpenChange(false);
    }}>
    {open && <><header className="app-modal-header"><div><h2 id={id}>{title}</h2>{description && <p id={id + "-description"}>{description}</p>}</div>
      <Button type="button" variant="ghost" size="icon" autoFocus aria-label={appText("Close")} onClick={() => onOpenChange(false)}><X aria-hidden="true" size={20} /></Button>
    </header><div className="app-modal-body">{children}</div></>}
  </dialog>, document.body);
}
