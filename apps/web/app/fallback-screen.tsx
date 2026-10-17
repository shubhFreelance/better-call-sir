"use client";
import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "../components/ui/button";
import {
  useAppTranslation,
  rememberLanguage,
  LanguageContext,
  translateText,
} from "./locale";

export function FallbackScreen({
  kind,
  retry,
}: {
  kind: "error" | "missing" | "loading";
  retry?: () => void;
}) {
  const initialHindi = useContext(LanguageContext);
  const [hindi, setHindi] = useState(initialHindi);
  const { appText } = useAppTranslation(hindi);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("bcs.interface-language");
      if (stored === "hi" || stored === "en") setHindi(stored === "hi");
      else if (
        document.cookie.split("; ").includes("bcs.interface-language=hi")
      )
        setHindi(true);
    } catch {
      if (document.cookie.split("; ").includes("bcs.interface-language=hi"))
        setHindi(true);
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = hindi ? "hi" : "en";
    document.title = translateText(
      hindi,
      "Better Call Sir · Find your kind of teacher",
    );
  }, [hindi]);
  function changeLanguage(value: boolean) {
    setHindi(value);
    rememberLanguage(value);
    try {
      localStorage.setItem("bcs.interface-language", value ? "hi" : "en");
    } catch {
      /* Keep the choice in memory. */
    }
  }
  return (
    <main className="container narrow section" lang={hindi ? "hi" : "en"}>
      <div className="independent-language">
        <label htmlFor="fallback-language">Language / भाषा</label>
        <select
          id="fallback-language"
          value={hindi ? "hi" : "en"}
          onChange={(event) => changeLanguage(event.target.value === "hi")}
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
      </div>
      <h1>
        {appText(
          kind === "loading"
            ? "Getting things ready…"
            : kind === "missing"
              ? "This page isn’t here yet."
              : "This page could not be loaded.",
        )}
      </h1>
      {kind === "loading" ? (
        <p role="status">{appText("Loading…")}</p>
      ) : (
        <>
          <p>
            {appText(
              "Your saved records are unchanged. Try again, return home or contact support.",
            )}
          </p>
          <div className="wizard-actions">
            {retry && <Button onClick={retry}>{appText("Try again")}</Button>}
            <Link className="button secondary" href="/">
              {appText("Go home")}
            </Link>
            <Link className="inline-link" href="/support">
              {appText("Help & safety")}
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
