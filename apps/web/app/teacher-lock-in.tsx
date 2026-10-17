import { useAppTranslation } from "./locale";
export function TeacherLockIn({ days }: { days?: number | null }) {
  const { appText, appError, appLocale } = useAppTranslation();

  return (
    <span className="teacher-lock-in-badge">
      {days === 0
        ? appText("No lock-in period")
        : days === 15 || days === 30
          ? appText("{0}-day lock-in preference", [days])
          : appText("Lock-in preference not recorded")}
    </span>
  );
}
