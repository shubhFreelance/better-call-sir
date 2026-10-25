"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "../components/ui/button";
import { FilterButton } from "../components/ui/filter-button";
import { Modal } from "../components/ui/modal";
import { useAppTranslation } from "./locale";

export function GuardianDocumentPreview({ evidenceId, learnerName }: { evidenceId: string; learnerName: string }) {
  const { appText } = useAppTranslation();
  const [open, setOpen] = useState(false), [state, setState] = useState("loading"), [attempt, setAttempt] = useState("");
  return <>
    <Button type="button" variant="ghost" size="icon" className="evidence-preview-trigger" aria-label={appText("See uploaded document")} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setState("loading"); setAttempt(crypto.randomUUID()); setOpen(true); }}><Eye aria-hidden="true" size={18} /></Button>
    <Modal open={open} onOpenChange={setOpen} title={appText("School report for {0}", [learnerName])} description={appText("This document is private and available only with current permission.")}>
      {state === "loading" && <p role="status">{appText("Loading uploaded document…")}</p>}
      {state === "error" ? <div className="document-preview-error"><p role="alert">{appText("The document could not be loaded. Your permission or the document may have changed.")}</p>
        <FilterButton onClick={() => { setState("loading"); setAttempt(crypto.randomUUID()); }}>{appText("Retry")}</FilterButton></div>
        // A fresh URL prevents decoded-image reuse from skipping the current permission check.
        : <img key={attempt} className="document-preview-image" hidden={state !== "ready"} src={`/api/v1/guardian-evidence/${encodeURIComponent(evidenceId)}/content?preview=${attempt}`} alt={appText("Uploaded school report")} referrerPolicy="no-referrer" onLoad={() => setState("ready")} onError={() => setState("error")} />}
    </Modal>
  </>;
}
