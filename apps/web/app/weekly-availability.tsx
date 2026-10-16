"use client";
import type { components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
export type Weekly = components["schemas"]["WeeklyPreferences"];
export type WeeklyRange = { weekday: string; start: string; end: string };
export const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const hindiDays = [
  "रविवार",
  "सोमवार",
  "मंगलवार",
  "बुधवार",
  "गुरुवार",
  "शुक्रवार",
  "शनिवार",
];
export const clock = (minute: number) =>
  minute === 1440
    ? "00:00"
    : `${Math.floor(minute / 60)}`.padStart(2, "0") +
      ":" +
      `${minute % 60}`.padStart(2, "0");
export const emptyWeekly = () => [
  { weekday: "", start: "16:00", end: "20:00" },
];
export const weeklyRows = (p: Weekly) =>
  p.weekly.map((w) => ({
    weekday: String(w.weekday),
    start: clock(w.startMinute),
    end: clock(w.endMinute),
  }));
export function weeklyPreferences(rows: WeeklyRange[]): Weekly | null {
  const minute = (s: string) =>
    /^\d{2}:\d{2}$/.test(s) &&
    Number(s.slice(0, 2)) < 24 &&
    Number(s.slice(3)) < 60
      ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
      : NaN;
  const weekly = rows
    .map((r) => ({
      weekday: r.weekday === "" ? NaN : Number(r.weekday),
      startMinute: minute(r.start),
      endMinute: r.end === "00:00" ? 1440 : minute(r.end),
    }))
    .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  if (
    !weekly.length ||
    weekly.length > 14 ||
    weekly.some(
      (w, i) =>
        !Number.isInteger(w.weekday) ||
        w.weekday < 0 ||
        w.weekday > 6 ||
        !Number.isFinite(w.startMinute) ||
        !Number.isFinite(w.endMinute) ||
        w.endMinute - w.startMinute < 20 ||
        (i > 0 &&
          weekly[i - 1].weekday === w.weekday &&
          weekly[i - 1].endMinute > w.startMinute),
    )
  )
    return null;
  return { timezone: "Asia/Kolkata", weekly };
}
export function WeeklySummary({
  preferences,
  hindi = false,
}: {
  preferences: Weekly;
  hindi?: boolean;
}) {
  return (
    <ul className="tuition-windows">
      {preferences.weekly.map((w, i) => (
        <li key={i}>
          {(hindi ? hindiDays : weekdays)[w.weekday]} · {clock(w.startMinute)}–
          {w.endMinute === 1440 ? "24:00" : clock(w.endMinute)} IST
        </li>
      ))}
    </ul>
  );
}
export function AvailabilityMode({
  weekly,
  onChange,
}: {
  weekly: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <fieldset className="availability-mode">
      <legend>How would you like to share availability?</legend>
      <label>
        <input
          type="radio"
          name="availability-mode"
          checked={weekly}
          onChange={() => onChange(true)}
        />{" "}
        Weekly preferences
      </label>
      <label>
        <input
          type="radio"
          name="availability-mode"
          checked={!weekly}
          onChange={() => onChange(false)}
        />{" "}
        Specific dates (optional)
      </label>
    </fieldset>
  );
}
export function WeeklyAvailability({
  rows,
  onChange,
  hindi = false,
}: {
  rows: WeeklyRange[];
  hindi?: boolean;
  onChange: (rows: WeeklyRange[]) => void;
}) {
  return (
    <div className="weekly-availability">
      <p>
        {hindi
          ? "भारतीय समय के अनुसार सुविधाजनक दिन और समय चुनें। इनसे शिक्षक खोजने में मदद मिलेगी; कक्षा बुक या अवधि तय नहीं होगी।"
          : "Choose suitable weekdays and broad time ranges in India Standard Time. These help us find a teacher; they do not book classes or set a lesson length."}
      </p>
      {rows.map((r, i) => (
        <div className="weekly-range" key={i}>
          <div className="field">
            <label htmlFor={`weekly-day-${i}`}>
              {hindi ? "पसंदीदा दिन" : "Preferred day"} {i + 1}
            </label>
            <select
              id={`weekly-day-${i}`}
              value={r.weekday}
              onChange={(e) =>
                onChange(
                  rows.map((v, n) =>
                    n === i ? { ...v, weekday: e.target.value } : v,
                  ),
                )
              }
            >
              <option value="">{hindi ? "दिन चुनें" : "Choose a day"}</option>
              {(hindi ? hindiDays : weekdays).map((d, n) => (
                <option key={d} value={n}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          {(["start", "end"] as const).map((key) => (
            <div className="field" key={key}>
              <label htmlFor={`weekly-${key}-${i}`}>
                {key === "start"
                  ? hindi
                    ? "कब से उपलब्ध"
                    : "Available from"
                  : hindi
                    ? "कब तक उपलब्ध"
                    : "Available until"}{" "}
                {i + 1} (IST)
              </label>
              <Input
                id={`weekly-${key}-${i}`}
                type="time"
                value={r[key]}
                onChange={(e) =>
                  onChange(
                    rows.map((v, n) =>
                      n === i ? { ...v, [key]: e.target.value } : v,
                    ),
                  )
                }
              />
            </div>
          ))}
          {rows.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(rows.filter((_, n) => n !== i))}
              aria-label={`${hindi ? "समय हटाएँ" : "Remove weekly range"} ${i + 1}`}
            >
              {hindi ? "हटाएँ" : "Remove"}
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={rows.length >= 14}
        onClick={() => onChange([...rows, ...emptyWeekly()])}
      >
        {hindi ? "एक और दिन/समय जोड़ें" : "Add another day/time range"}
      </Button>
      <p className="wizard-help">
        {hindi
          ? "एक दिन के समय आपस में नहीं टकराने चाहिए। दिन के अंत की मध्यरात्रि के लिए 00:00 चुनें।"
          : "Ranges must not overlap on the same day. Use 00:00 as the end time for midnight at the end of that day."}
      </p>
    </div>
  );
}
