"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function LandingMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !root.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let disposed = false;
    let stop = () => {};
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (disposed || !root.current) return;
        gsap.registerPlugin(ScrollTrigger);
        const media = gsap.matchMedia();
        stop = () => media.revert();
        media.add("(prefers-reduced-motion: no-preference)", () => {
          const context = gsap.context(() => {
            gsap.from(".hero-copy > *", {
              y: 18,
              duration: 0.65,
              stagger: 0.07,
              ease: "power2.out",
              clearProps: "transform",
            });
            gsap.from(".illustration", {
              y: 16,
              scale: 0.98,
              duration: 0.8,
              ease: "power2.out",
              clearProps: "transform",
            });
            for (const section of root.current!.querySelectorAll<HTMLElement>(
              ".home-registration, .section-heading, .teacher-grid, .how-section, .hiring-discovery-banner",
            )) {
              gsap.from(section, {
                y: 20,
                duration: 0.6,
                ease: "power2.out",
                clearProps: "transform",
                scrollTrigger: {
                  trigger: section,
                  start: "top 92%",
                  once: true,
                },
              });
            }
          }, root.current!);
          return () => context.revert();
        });
        void document.fonts.ready.then(() => {
          if (!disposed) ScrollTrigger.refresh();
        });
      })
      .catch(() => {
        // Motion is optional; content is never hidden while the library loads.
        stop();
      });
    return () => {
      disposed = true;
      stop();
    };
  }, []);
  return (
    <div className="landing-page" ref={root}>
      {children}
    </div>
  );
}
