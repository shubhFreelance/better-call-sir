"use client";
import { useState } from "react";
import { Input } from "../components/ui/input";
export const subjectSuggestions = [
  "Maths",
  "Science",
  "English",
  "Hindi",
  "Physics",
  "Chemistry",
  "Biology",
  "Economics",
  "Statistics",
  "Computer Science",
  "Language",
  "Numbers",
];
export const boardSuggestions = ["CBSE", "CGBSE", "ICSE", "IB"];
export function CurriculumChoice({
  id,
  value,
  onChange,
  suggestions,
  customLabel,
  anyLabel,
  disabled = false,
  error = false,
  errorId,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  customLabel: string;
  anyLabel?: string;
  disabled?: boolean;
  error?: boolean;
  errorId?: string;
}) {
  const [custom, setCustom] = useState(!!value && !suggestions.includes(value));
  const showCustom = custom || (!!value && !suggestions.includes(value));
  return (
    <div className="curriculum-choice">
      <select
        id={id}
        value={showCustom ? "__CUSTOM__" : value}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "__CUSTOM__") {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(next);
          }
        }}
        disabled={disabled}
        aria-invalid={error}
        aria-describedby={errorId}
      >
        <option value="">{anyLabel || "Choose an option"}</option>
        {suggestions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value="__CUSTOM__">
          Enter another {customLabel.toLowerCase()}
        </option>
      </select>
      {showCustom && (
        <div className="field">
          <label htmlFor={id + "-custom"}>{customLabel}</label>
          <Input
            id={id + "-custom"}
            value={value}
            maxLength={customLabel.toLowerCase().includes("board") ? 80 : 60}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={error}
            aria-describedby={errorId}
          />
        </div>
      )}
    </div>
  );
}
