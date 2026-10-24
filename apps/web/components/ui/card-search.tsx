"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";

export function CardSearch({ title, label, placeholder, value, onChange }: {
  title: ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  return (
    <div className="card-search-header">
      <h2>{title}</h2>
      <Button ref={toggle} type="button" variant="outline" size="icon"
        className={`card-search-toggle${value ? " has-query" : ""}`}
        aria-label={value ? `${label}: ${value}` : label}
        aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(!open)}>
        <Search aria-hidden="true" />
      </Button>
      <div id={id} className={`card-search-field${open ? " is-open" : ""}`}>
        <Search aria-hidden="true" size={18} />
        <Input ref={input} type="search" aria-label={label} placeholder={placeholder}
          value={value} onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Escape" && toggle.current?.getClientRects().length) {
              event.preventDefault();
              setOpen(false);
              toggle.current.focus();
            }
          }} />
      </div>
    </div>
  );
}
