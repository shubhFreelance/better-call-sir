"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { Button } from "./button";

export function InfoTooltip({ label, items }: { label: string; items: string[] }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !trigger.current || !box.current) return;
    const button = trigger.current.getBoundingClientRect();
    const tooltip = box.current.getBoundingClientRect();
    setPosition({
      left: Math.max(16, Math.min(button.left, innerWidth - tooltip.width - 16)),
      top: button.bottom + tooltip.height + 8 <= innerHeight
        ? button.bottom : Math.max(8, button.top - tooltip.height),
    });
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !box.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return <>
    <Button ref={trigger} type="button" variant="ghost" size="icon"
      className="info-tooltip-trigger" aria-label={label}
      aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}
      onPointerEnter={event => { if (event.pointerType === "mouse") setOpen(true); }}
      onPointerLeave={event => { if (event.pointerType === "mouse" && document.activeElement !== trigger.current && !(event.relatedTarget instanceof Node && box.current?.contains(event.relatedTarget))) setOpen(false); }}>
      <Info aria-hidden="true" size={16} />
    </Button>
    {open && createPortal(<div ref={box} id={id} role="tooltip" className="info-tooltip-box" style={position}
      onPointerLeave={event => { if (document.activeElement !== trigger.current && !(event.relatedTarget instanceof Node && trigger.current?.contains(event.relatedTarget))) setOpen(false); }}>
      <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
    </div>, document.body)}
  </>;
}
