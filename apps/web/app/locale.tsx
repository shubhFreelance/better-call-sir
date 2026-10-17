"use client";
import { createContext, useContext, type ReactNode } from "react";
import { hindiMessages } from "./hindi-messages";

export const LanguageContext = createContext(false);
export function LocaleBoundary({
  hindi,
  children,
}: {
  hindi: boolean;
  children: ReactNode;
}) {
  return (
    <LanguageContext.Provider value={hindi}>
      {children}
    </LanguageContext.Provider>
  );
}
export function rememberLanguage(hindi: boolean) {
  document.cookie = `bcs.interface-language=${hindi ? "hi" : "en"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
const normalized = new Map(
  Object.entries(hindiMessages).map(([key, value]) => [
    key.trim().toLowerCase().replaceAll("_", " "),
    value,
  ]),
);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(hindiMessages)
  .filter(
    ([key]) =>
      /\{\d+\}/.test(key) && /[a-z]{3}/i.test(key) && !/\}\{/.test(key),
  )
  .map(([key, value]) => ({
    key,
    value,
    slots: [...key.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1])),
    pattern: new RegExp(
      "^" +
        key
          .split(/\{\d+\}/g)
          .map(escape)
          .join("([\\s\\S]*?)") +
        "$",
    ),
  }))
  .sort(
    (a, b) =>
      b.key.replace(/\{\d+\}/g, "").length -
      a.key.replace(/\{\d+\}/g, "").length,
  );
const interpolate = (message: string, values: readonly unknown[]) =>
  message.replace(/\{(\d+)\}/g, (_, index: string) =>
    String(values[Number(index)] ?? ""),
  );

// Call only for interface copy or declared curriculum labels, never authored messages or names.
export function translateText<T>(
  hindi: boolean,
  text: T,
  values?: readonly unknown[],
): T {
  if (typeof text !== "string") return text;
  if (!hindi) return (values ? interpolate(text, values) : text) as T;
  const exact = Object.hasOwn(hindiMessages, text)
    ? hindiMessages[text]
    : normalized.get(text.trim().toLowerCase().replaceAll("_", " "));
  if (exact !== undefined)
    return (values ? interpolate(exact, values) : exact) as T;
  if (!values && text.length <= 2000) {
    for (const { value, pattern, slots } of patterns) {
      const match = pattern.exec(text);
      if (match) {
        const parameters: unknown[] = [];
        slots.forEach((slot, index) => {
          parameters[slot] = match[index + 1];
        });
        return interpolate(value, parameters) as T;
      }
    }
  }
  return (values ? interpolate(text, values) : text) as T;
}
export function translateError<T>(hindi: boolean, text: T): T {
  if (typeof text !== "string" || !text || !hindi) return text;
  const translated = translateText(true, text);
  if (translated !== text || /[\u0900-\u097f]/.test(text)) return translated;
  return "यह कार्रवाई पूरी नहीं हुई। मौजूदा जानकारी और अपनी अनुमति जाँचें, फिर कोशिश करें।" as T;
}
const curriculumLabels = new Set(
  [
    "Maths",
    "Mathematics",
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
    "Social Science",
    "Social Studies",
    "History",
    "Geography",
    "Sanskrit",
    "Urdu",
    "Tamil",
    "Telugu",
    "Bengali",
    "Marathi",
    "Gujarati",
    "Kannada",
    "Malayalam",
    "Punjabi",
    "Odia",
    "Assamese",
    "Chhattisgarhi",
  ].map((value) => value.toLowerCase()),
);
export function curriculumText<T>(text: T, translate: (value: T) => T): T {
  return typeof text === "string" &&
    curriculumLabels.has(text.trim().toLowerCase())
    ? translate(text)
    : text;
}
export function useAppTranslation(override?: boolean) {
  const current = useContext(LanguageContext);
  const hindi = override ?? current;
  return {
    appText: <T,>(text: T, values?: readonly unknown[]) =>
      translateText(hindi, text, values),
    appError: <T,>(text: T) => translateError(hindi, text),
    appLocale: hindi ? "hi-IN" : "en-IN",
    appCurriculum: <T,>(text: T) =>
      curriculumText(text, (value) => translateText(hindi, value)),
  };
}

export function nativeValidationText(
  validity: Pick<
    ValidityState,
    | "valueMissing"
    | "typeMismatch"
    | "rangeUnderflow"
    | "rangeOverflow"
    | "tooShort"
    | "tooLong"
    | "patternMismatch"
    | "stepMismatch"
  >,
) {
  if (validity.valueMissing) return "यह जानकारी भरें।";
  if (validity.typeMismatch)
    return "सही प्रारूप में जानकारी दर्ज करें। ईमेल हो तो पूरा ईमेल पता दें।";
  if (validity.rangeUnderflow || validity.rangeOverflow)
    return "बताई गई न्यूनतम और अधिकतम सीमा के भीतर मान दर्ज करें।";
  if (validity.tooShort || validity.tooLong)
    return "बताई गई अक्षर सीमा के अनुसार जानकारी दें।";
  if (validity.patternMismatch) return "बताए गए प्रारूप में जानकारी दर्ज करें।";
  if (validity.stepMismatch)
    return "इस फ़ील्ड के लिए मान्य संख्या या समय चुनें।";
  return "मान्य जानकारी दर्ज करके फिर कोशिश करें।";
}
