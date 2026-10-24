"use client";
import { useEffect, useRef, useState } from "react";
import { Heart, MapPin, Pause, Play, ShieldCheck, Users } from "lucide-react";
import type { gsap } from "gsap";
import { Button } from "../components/ui/button";
import { useAppTranslation } from "./locale";

export function PromiseTicker() {
  const { appText } = useAppTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const firstGroup = useRef<HTMLUListElement>(null);
  const tween = useRef<gsap.core.Tween | null>(null);
  const pauseRequested = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    pauseRequested.current = paused || hovered || focused;
    tween.current?.paused(pauseRequested.current);
  }, [paused, hovered, focused]);

  useEffect(() => {
    const view = viewport.current,
      rail = track.current,
      group = firstGroup.current;
    if (
      !view ||
      !rail ||
      !group ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let disposed = false;
    let stop = () => {};
    void import("gsap")
      .then(({ gsap }) => {
        if (disposed) return;
        const media = gsap.matchMedia();
        stop = () => media.revert();
        media.add("(prefers-reduced-motion: no-preference)", () => {
          let active = true;
          let lastDistance = 0;
          setEnabled(true);
          const refresh = () => {
            if (!active || disposed) return;
            const distance = group.getBoundingClientRect().width;
            if (!distance || (distance === lastDistance && tween.current))
              return;
            const progress = tween.current?.progress() || 0;
            tween.current?.kill();
            lastDistance = distance;
            gsap.set(rail, { x: 0 });
            tween.current = gsap
              .to(rail, {
                x: -distance,
                duration: distance / 38,
                repeat: -1,
                ease: "none",
                paused: pauseRequested.current,
              })
              .progress(progress);
          };
          const observer = new ResizeObserver(refresh);
          observer.observe(view);
          observer.observe(group);
          void document.fonts.ready.then(refresh);
          return () => {
            active = false;
            observer.disconnect();
            tween.current?.kill();
            tween.current = null;
            gsap.set(rail, { clearProps: "transform" });
              if (!disposed) setEnabled(false);
          };
        });
      })
      .catch(() => stop());
    return () => {
      disposed = true;
      stop();
    };
  }, []);

  const items = [
    { text: "Reviewed teacher coverage", Icon: ShieldCheck },
    { text: "At home or online", Icon: MapPin },
    { text: "Free teacher matching", Icon: Heart },
    { text: "Students, parents and teachers", Icon: Users },
  ];
  return (
    <section
      className="promise-bar"
      aria-label={appText("Learning highlights")}
    >
      <div className={`promise-ticker${enabled ? " is-animated" : ""}`}>
        <div
          className="promise-ticker-viewport"
          ref={viewport}
          tabIndex={enabled ? 0 : undefined}
          role="group"
          aria-label={appText("Learning highlights")}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setHovered(true);
          }}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          <div className="promise-ticker-track" ref={track}>
            {[false, true].map((copy) => (
              <ul
                key={String(copy)}
                ref={copy ? undefined : firstGroup}
                className={`promise-ticker-group${copy ? " promise-ticker-copy" : ""}`}
                aria-hidden={copy ? true : undefined}
              >
                {items.map(({ text, Icon }) => (
                  <li key={text}>
                    <Icon size={21} aria-hidden="true" />
                    <span>{appText(text)}</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
        {enabled && (
          <Button
            variant="ghost"
            size="icon"
            className="promise-ticker-control"
            aria-label={appText(
              paused ? "Resume highlights" : "Pause highlights",
            )}
            title={appText(paused ? "Resume highlights" : "Pause highlights")}
            onClick={() => setPaused(!paused)}
          >
            {paused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
    </section>
  );
}
