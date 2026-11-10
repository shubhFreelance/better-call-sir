"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Eye, LoaderCircle, FileText } from "lucide-react";
import { Button } from "./button";
import { FilterButton } from "./filter-button";
import { Modal } from "./modal";
import { useAppTranslation } from "../../app/locale";

export function PrivateDocumentPreview({
  evidenceId,
  mediaType,
  kind,
  disabled = false,
  children,
}: {
  evidenceId: string;
  mediaType: string;
  kind: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const { appText } = useAppTranslation();
  const [open, setOpen] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const title = appText("Private evidence: {0}", [kind]);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="evidence-preview-trigger"
        aria-label={appText("View private evidence: {0}", [kind])}
        title={appText("View private evidence: {0}", [kind])}
        aria-haspopup="dialog"
        aria-expanded={open && !disabled}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Eye aria-hidden="true" size={18} />
      </Button>
      <Modal
        open={open && !disabled}
        onOpenChange={setOpen}
        title={title}
        description={appText(
          "This document is private and available only with current permission.",
        )}
      >
        {children && <div className="document-preview-details">{children}</div>}
        {mediaType === "application/pdf" ? (
          <div className="document-preview-file">
            <FileText size={28} aria-hidden="true" />
            <p>
              {appText(
                "Download this PDF to view all pages in your PDF reader.",
              )}
            </p>
            <FilterButton asChild>
              <a
                href={`/api/v1/evidence/${encodeURIComponent(evidenceId)}/content`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {appText("Download private file")}
              </a>
            </FilterButton>
          </div>
        ) : (
          <DocumentContent
            key={`${evidenceId}:${attempt}`}
            evidenceId={evidenceId}
            mediaType={mediaType}
            title={title}
            retry={() => setAttempt((value) => value + 1)}
          />
        )}
      </Modal>
    </>
  );
}

function DocumentContent({
  evidenceId,
  mediaType,
  title,
  retry,
}: {
  evidenceId: string;
  mediaType: string;
  title: string;
  retry: () => void;
}) {
  const { appText } = useAppTranslation();
  const [url, setUrl] = useState(""),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    async function load() {
      try {
        const response = await fetch(
          `/api/v1/evidence/${encodeURIComponent(evidenceId)}/content?preview=${crypto.randomUUID()}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(15000),
            ]),
          },
        );
        if (!response.ok) throw new Error("Document unavailable");
        const bytes = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: mediaType }));
        setUrl(objectUrl);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidenceId, mediaType]);
  if (error)
    return (
      <div className="document-preview-error">
        <p role="alert">
          {appText(
            "The document could not be loaded. Your permission or the document may have changed.",
          )}
        </p>
        <FilterButton onClick={retry}>{appText("Retry")}</FilterButton>
      </div>
    );
  if (!url)
    return (
      <p role="status" className="document-preview-loading">
        <LoaderCircle size={18} aria-hidden="true" />
        {appText("Loading uploaded document…")}
      </p>
    );
  return (
    <img
      className="document-preview-image"
      src={url}
      alt={title}
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
    />
  );
}
