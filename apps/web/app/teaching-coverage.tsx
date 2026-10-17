"use client";
import { useAppTranslation, curriculumText } from "./locale";
import type { components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
export type TeachingScope = components["schemas"]["TeachingScope"];
export type CoverageGroup = {
  stage: "SCHOOL" | "EARLY_YEARS" | "COLLEGE";
  subjects: string;
  boards: string;
  grades: number[];
  levels: string[];
  courseName: string;
  years: number[];
};
export const emptyCoverageGroup = (): CoverageGroup => ({
  stage: "SCHOOL",
  subjects: "",
  boards: "",
  grades: [],
  levels: [],
  courseName: "",
  years: [],
});
type Declared = {
  subjects?: string[];
  boards?: string[];
  grades?: number[];
  teachingCoverage?: TeachingScope[] | null;
};
export function coverageGroups(t: Declared): CoverageGroup[] {
  if (!t.teachingCoverage?.length)
    return [
      {
        ...emptyCoverageGroup(),
        subjects: (t.subjects || []).join(", "),
        boards: (t.boards || []).join(", "),
        grades: t.grades || [],
      },
    ];
  const groups: CoverageGroup[] = [];
  for (const s of t.teachingCoverage) {
    let g = groups.find(
      (g) =>
        g.stage === s.stage &&
        g.subjects === s.subject &&
        (s.stage !== "SCHOOL" || g.boards === s.board) &&
        (s.stage !== "COLLEGE" || g.courseName === s.courseName),
    );
    if (!g) {
      g = {
        ...emptyCoverageGroup(),
        stage: s.stage,
        subjects: s.subject,
        boards: s.stage === "SCHOOL" ? s.board : "",
        courseName: s.stage === "COLLEGE" ? s.courseName : "",
      };
      groups.push(g);
    }
    if (s.stage === "SCHOOL") g.grades.push(s.grade);
    if (s.stage === "EARLY_YEARS") g.levels.push(s.level);
    if (s.stage === "COLLEGE") g.years.push(s.studyYear);
  }
  return groups;
}
const list = (text: string) =>
  text
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
export function expandedCoverage(groups: CoverageGroup[]): {
  scopes: TeachingScope[];
  error: string;
} {
  const scopes: TeachingScope[] = [];
  for (const [i, g] of groups.entries()) {
    const subjects = list(g.subjects),
      boards = list(g.boards);
    let error = "";
    if (
      !subjects.length ||
      subjects.length > 40 ||
      subjects.some((v) => v.length > 60) ||
      new Set(subjects.map((v) => v.toLowerCase())).size !== subjects.length
    )
      error = "enter 1–40 distinct subjects, with up to 60 characters each.";
    else if (
      g.stage === "SCHOOL" &&
      (!boards.length ||
        boards.length > 20 ||
        boards.some((v) => v.length > 80) ||
        new Set(boards.map((v) => v.toLowerCase())).size !== boards.length ||
        !g.grades.length)
    )
      error = "enter distinct boards and choose at least one class.";
    else if (g.stage === "EARLY_YEARS" && !g.levels.length)
      error = "choose Nursery, KG1 or KG2.";
    else if (
      g.stage === "COLLEGE" &&
      (!g.courseName.trim() ||
        g.courseName.trim().length > 160 ||
        !g.years.length)
    )
      error = "enter the course or degree and choose at least one year.";
    if (error) return { scopes: [], error: `Teaching area ${i + 1}: ${error}` };
    for (const subject of subjects) {
      if (g.stage === "SCHOOL")
        for (const board of boards)
          for (const grade of g.grades)
            scopes.push({
              stage: g.stage,
              subject,
              board: board.toUpperCase(),
              grade,
            });
      else if (g.stage === "EARLY_YEARS")
        for (const level of g.levels)
          scopes.push({
            stage: g.stage,
            subject,
            level: level as "NURSERY" | "KG1" | "KG2",
          });
      else
        for (const studyYear of g.years)
          scopes.push({
            stage: g.stage,
            subject,
            courseName: g.courseName.trim(),
            studyYear,
          });
    }
  }
  const keys = scopes.map((s) =>
    JSON.stringify([
      s.stage,
      s.subject.toLowerCase(),
      s.stage === "SCHOOL"
        ? s.board.toUpperCase()
        : s.stage === "COLLEGE"
          ? s.courseName.toLowerCase()
          : s.level,
      s.stage === "SCHOOL"
        ? s.grade
        : s.stage === "COLLEGE"
          ? s.studyYear
          : null,
    ]),
  );
  if (!scopes.length || scopes.length > 200)
    return {
      scopes: [],
      error:
        "Declare 1–200 subject and education combinations. Split only the areas you actually teach.",
    };
  if (new Set(keys).size !== keys.length)
    return {
      scopes: [],
      error:
        "Two teaching areas repeat the same subject and education details. Combine them or remove the repeated selection.",
    };
  if (
    new Set(scopes.map((s) => s.subject.toLowerCase())).size > 40 ||
    new Set(scopes.flatMap((s) => (s.stage === "SCHOOL" ? [s.board] : [])))
      .size > 20
  )
    return {
      scopes: [],
      error: "Use up to 40 subjects and 20 school boards in total.",
    };
  return { scopes, error: "" };
}
export function flatCoverage(scopes: TeachingScope[]) {
  return {
    subjects: [...new Set(scopes.map((s) => s.subject))],
    boards: [
      ...new Set(
        scopes.flatMap((s) => (s.stage === "SCHOOL" ? [s.board] : [])),
      ),
    ],
    grades: [
      ...new Set(
        scopes.flatMap((s) => (s.stage === "SCHOOL" ? [s.grade] : [])),
      ),
    ],
  };
}
export function coverageText(
  t: Declared,
  translate: (text: string) => string = (text) => text,
) {
  return coverageGroups(t)
    .filter((g) => g.subjects)
    .map(
      (g) =>
        `${g.subjects
          .split(",")
          .map((s) => curriculumText(s.trim(), translate))
          .join(
            ", ",
          )} · ${g.stage === "SCHOOL" ? `${g.boards} · ${translate("Classes")} ${[...new Set(g.grades)].sort((a, b) => a - b).join(", ")}` : g.stage === "EARLY_YEARS" ? g.levels.map((l) => (l === "NURSERY" ? translate("Nursery") : l)).join(", ") : `${g.courseName} · ${translate("Years")} ${[...new Set(g.years)].sort((a, b) => a - b).join(", ")}`}`,
    )
    .join("\n");
}
export function TeachingCoverageSummary({
  profile,
  compact = false,
}: {
  profile: Declared;
  compact?: boolean;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const lines = coverageText(profile, appText).split("\n").filter(Boolean);
  return (
    <div className="teaching-coverage-summary">
      {lines.slice(0, compact ? 3 : undefined).map((line, i) => (
        <p key={i}>{appText(line)}</p>
      ))}
      {compact && lines.length > 3 && (
        <p>
          +{lines.length - 3} {appText("more teaching areas on the profile")}
        </p>
      )}
    </div>
  );
}
export function TeachingCoverageEditor({
  groups,
  onChange,
  error,
}: {
  groups: CoverageGroup[];
  onChange: (groups: CoverageGroup[]) => void;
  error?: string;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  function change(index: number, patch: Partial<CoverageGroup>) {
    onChange(groups.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }
  function toggle(
    index: number,
    key: "grades" | "levels" | "years",
    value: string | number,
  ) {
    const current = groups[index][key] as (string | number)[];
    change(index, {
      [key]: current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    });
  }
  return (
    <section
      className="teaching-coverage-editor"
      aria-labelledby="coverage-heading"
    >
      <h3 id="coverage-heading">{appText("What do you teach?")}</h3>
      <p className="wizard-help">
        {appText(
          "Create a separate teaching area when the subject, curriculum or course differs. Each subject applies to every selected class, level or year within that area. All declarations need screening.",
        )}{" "}
      </p>
      {groups.map((g, i) => (
        <section
          key={i}
          className="teaching-coverage-group"
          aria-label={appText("Teaching area {0}", [i + 1])}
        >
          <div className="hiring-section-heading">
            <h4>
              {appText("Teaching area")} {i + 1}
            </h4>
            {groups.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange(groups.filter((_, n) => n !== i))}
              >
                {appText("Remove teaching area")} {i + 1}
              </Button>
            )}
          </div>
          <div className="field">
            <label htmlFor={`coverage-stage-${i}`}>
              {appText("Education stage for teaching area")} {i + 1}
            </label>
            <select
              id={`coverage-stage-${i}`}
              value={g.stage}
              onChange={(e) =>
                change(i, { stage: e.target.value as CoverageGroup["stage"] })
              }
            >
              <option value="SCHOOL">{appText("School — Classes 1–12")}</option>
              <option value="EARLY_YEARS">
                {appText("Early years — Nursery / KG")}
              </option>
              <option value="COLLEGE">{appText("College / university")}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`coverage-subjects-${i}`}>
              {appText("Subjects in teaching area")} {i + 1}
            </label>
            <Input
              id={`coverage-subjects-${i}`}
              value={g.subjects}
              maxLength={2440}
              onChange={(e) => change(i, { subjects: e.target.value })}
              aria-invalid={!!error}
              aria-describedby={error ? "teaching-coverage-error" : undefined}
            />
            <small className="wizard-help">
              {appText(
                "Separate subjects with commas, for example Physics, Chemistry.",
              )}{" "}
            </small>
          </div>
          {g.stage === "SCHOOL" && (
            <>
              <div className="field">
                <label htmlFor={`coverage-boards-${i}`}>
                  {appText("Boards in teaching area")} {i + 1}
                </label>
                <Input
                  id={`coverage-boards-${i}`}
                  value={g.boards}
                  maxLength={1620}
                  onChange={(e) => change(i, { boards: e.target.value })}
                />
                <small className="wizard-help">
                  {appText("For example CBSE, ICSE or your state board.")}{" "}
                </small>
              </div>
              <fieldset className="coverage-picks">
                <legend>
                  {appText("Classes in teaching area")} {i + 1}
                </legend>
                {Array.from({ length: 12 }, (_, n) => n + 1).map((n) => (
                  <label key={n}>
                    <input
                      type="checkbox"
                      checked={g.grades.includes(n)}
                      onChange={() => toggle(i, "grades", n)}
                    />
                    {appText("Class")} {n}
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {g.stage === "EARLY_YEARS" && (
            <fieldset className="coverage-picks">
              <legend>
                {appText("Levels in teaching area")} {i + 1}
              </legend>
              {["NURSERY", "KG1", "KG2"].map((level) => (
                <label key={level}>
                  <input
                    type="checkbox"
                    checked={g.levels.includes(level)}
                    onChange={() => toggle(i, "levels", level)}
                  />
                  {level === "NURSERY" ? appText("Nursery") : level}
                </label>
              ))}
            </fieldset>
          )}
          {g.stage === "COLLEGE" && (
            <>
              <div className="field">
                <label htmlFor={`coverage-course-${i}`}>
                  {appText("Course / degree in teaching area")} {i + 1}
                </label>
                <Input
                  id={`coverage-course-${i}`}
                  value={g.courseName}
                  maxLength={160}
                  onChange={(e) => change(i, { courseName: e.target.value })}
                />
                <small className="wizard-help">
                  {appText(
                    "Use the course name learners use, for example BSc Physics. Matching also checks the study year.",
                  )}{" "}
                </small>
              </div>
              <fieldset className="coverage-picks">
                <legend>
                  {appText("Study years in teaching area")} {i + 1}
                </legend>
                {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                  <label key={n}>
                    <input
                      type="checkbox"
                      checked={g.years.includes(n)}
                      onChange={() => toggle(i, "years", n)}
                    />
                    {appText("Year")} {n}
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </section>
      ))}
      {error && (
        <p id="teaching-coverage-error" className="field-error" role="alert">
          {appError(error)}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={groups.length >= 20}
        onClick={() => onChange([...groups, emptyCoverageGroup()])}
      >
        {appText("Add teaching area")}{" "}
      </Button>
    </section>
  );
}
