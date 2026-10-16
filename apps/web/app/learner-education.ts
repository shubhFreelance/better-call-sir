type EducationSummary = {
  grade: number | null;
  board: string | null;
  educationStage?: string;
  earlyYearsLevel?: string | null;
  courseName?: string | null;
  studyYear?:number|null;
};
export function educationLabel(c: EducationSummary) {
  if (c.educationStage === "COLLEGE") return `${c.courseName||"College"}${c.studyYear?" · Year "+c.studyYear:""}`;
  if (c.educationStage === "EARLY_YEARS")
    return c.earlyYearsLevel === "NURSERY"
      ? "Nursery"
      : c.earlyYearsLevel || "Early years";
  return c.grade === null
    ? "Learner profile"
    : `Class ${c.grade}${c.board ? " · " + c.board : ""}`;
}
export function pilotLearner<T extends EducationSummary>(
  c: T,
): c is T & { grade: number; board: string } {
  return (
    (!c.educationStage || c.educationStage === "SCHOOL") &&
    c.grade !== null &&
    c.grade >= 6 &&
    c.grade <= 10 &&
    ["CBSE", "CGBSE"].includes(c.board || "")
  );
}
