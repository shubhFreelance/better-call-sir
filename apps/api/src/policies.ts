export const revisionPrice = (minutes: number) => minutes * 1500;
export const placementFee = (monthlyPaise: number) => Math.min(Math.round(monthlyPaise * 0.25), 150_000);
export const verifiedAttendance = (lesson: {status: string; attendance: string; disputed: boolean}) =>
  lesson.status === 'COMPLETED' && ['PRESENT', 'LATE'].includes(lesson.attendance) && !lesson.disputed;
export function eligible(request: {subject: string; mode: string; language: string; locality: string; budgetPaise: number}, child: {grade: number|null; board: string|null}, teacher: {status: string; screeningComplete: boolean; subjects: string[]; modes: string[]; languages: string[]; localities: string[]; monthlyPaise: number; grades: number[]; boards: string[]; screeningValidUntil?:Date|null}, now=new Date()) {
  return child.grade!==null && child.board!==null && teacher.status === 'APPROVED' && teacher.screeningComplete && (teacher.screeningValidUntil===undefined || (teacher.screeningValidUntil!==null&&teacher.screeningValidUntil>now)) && teacher.subjects.includes(request.subject)
    && teacher.modes.includes(request.mode) && teacher.languages.includes(request.language)
    && teacher.grades.includes(child.grade) && teacher.boards.includes(child.board)
    && teacher.monthlyPaise <= request.budgetPaise && (request.mode === 'ONLINE' || teacher.localities.includes(request.locality));
}
export function revisionRefund(startsAt: Date, now: Date, reason: string) {
  return ['TEACHER_NO_SHOW', 'PLATFORM_UNAVAILABLE'].includes(reason) || startsAt.getTime() - now.getTime() >= 6 * 3_600_000;
}
export function window30(now = new Date()) {
  return {start: new Date(now.getTime() - 30 * 86_400_000), end: now, timezone: 'Asia/Kolkata', metricVersion: 'attendance-v1'};
}
