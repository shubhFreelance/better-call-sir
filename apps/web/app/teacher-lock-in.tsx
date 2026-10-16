export function TeacherLockIn({ days }: { days?: number | null }) {
  return (
    <span className="teacher-lock-in-badge">
      {days === 0
        ? "No lock-in period"
        : days === 15 || days === 30
          ? `${days}-day lock-in preference`
          : "Lock-in preference not recorded"}
    </span>
  );
}
