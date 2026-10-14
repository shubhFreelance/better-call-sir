"use client";
import type { ReactNode } from "react";
import type { components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
type Address = components["schemas"]["TeacherAddress"];
type Education = components["schemas"]["TeacherEducation"];
type Employment = components["schemas"]["TeacherEmployment"];
export type TeacherDetails = {
  address: Address;
  education: Education[];
  employment: Employment[];
  demoOptIn?: boolean;
};
export const milestones = {
  CLASS_10: "Class 10",
  CLASS_12: "Class 12",
  UNDERGRADUATE: "College / undergraduate",
  POSTGRADUATE: "Postgraduate",
};
export const emptyDetails: TeacherDetails = {
  address: {
    line1: "",
    line2: "",
    locality: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
  },
  education: Object.keys(milestones).map((milestone) => ({
    milestone: milestone as Education["milestone"],
    status:
      milestone === "CLASS_10" || milestone === "CLASS_12"
        ? "COMPLETED"
        : "NOT_APPLICABLE",
    institution: "",
    qualification: "",
    year: null,
    grading: null,
    score: null,
    outOf: null,
    percentage: null,
  })),
  employment: [],
};
export function detailsErrors(
  v: Partial<TeacherDetails>,
  part: "address" | "education",
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (part === "address") {
    for (const [key, label] of Object.entries({
      line1: "street address",
      locality: "locality",
      city: "city",
      state: "state",
      postalCode: "PIN code",
    })) {
      if (!v.address?.[key as keyof Address]?.trim())
        errors[`address.${key}`] = `Enter your ${label}.`;
    }
    if (v.address?.postalCode && !/^[1-9][0-9]{5}$/.test(v.address.postalCode))
      errors["address.postalCode"] = "Enter a valid six-digit Indian PIN code.";
  } else {
    for (const [i, r] of (v.education || emptyDetails.education).entries()) {
      const key = `education.${i}.`;
      if (r.status === "NOT_APPLICABLE") {
        if (r.milestone === "CLASS_10")
          errors[key + "status"] = "Record your Class 10 milestone.";
        continue;
      }
      if (!r.institution.trim())
        errors[key + "institution"] = "Enter the institution.";
      if (!r.qualification.trim())
        errors[key + "qualification"] = "Enter the board, stream or degree.";
      if (
        !r.year ||
        r.year < 1950 ||
        r.year > new Date().getFullYear() + (r.status === "PURSUING" ? 10 : 0)
      )
        errors[key + "year"] = "Enter a valid completion or expected year.";
      if (r.status === "COMPLETED") {
        if (!r.grading)
          errors[key + "grading"] = "Choose the official result format.";
        if (r.score === null || r.score < 0 || r.score > 100000)
          errors[key + "score"] = "Enter your official result.";
        if (r.grading === "PERCENTAGE" && r.score !== null && r.score > 100)
          errors[key + "score"] = "Percentage must be between 0 and 100.";
        if (r.percentage !== null && (r.percentage < 0 || r.percentage > 100))
          errors[key + "percentage"] = "Percentage must be between 0 and 100.";
        if (
          (r.grading === "MARKS" || r.grading === "CGPA") &&
          (!r.outOf || (r.score !== null && r.score > r.outOf))
        )
          errors[key + "outOf"] = "Enter a valid total or CGPA scale.";
      }
    }
    for (const [i, r] of (v.employment || []).entries()) {
      if (!r.organization.trim())
        errors[`employment.${i}.organization`] =
          "Enter the institution, employer or independent tuition practice.";
      if (!r.role.trim()) errors[`employment.${i}.role`] = "Enter your role.";
      if (
        !r.fromYear ||
        r.fromYear < 1950 ||
        r.fromYear > new Date().getFullYear()
      )
        errors[`employment.${i}.fromYear`] = "Enter a valid start year.";
      if (
        r.toYear !== null &&
        (r.toYear < r.fromYear || r.toYear > new Date().getFullYear())
      )
        errors[`employment.${i}.toYear`] = "Enter a valid end year.";
    }
  }
  return errors;
}
export function TeacherDetailsForm({
  part,
  values,
  onChange,
  errors,
}: {
  part: "address" | "education";
  values: Partial<TeacherDetails>;
  onChange: (
    key: "address" | "education" | "employment",
    value: unknown,
  ) => void;
  errors: Record<string, string>;
}) {
  const addr = values.address || emptyDetails.address,
    education = values.education || emptyDetails.education,
    employment = values.employment || [];
  const field = (
    key: string,
    label: string,
    input: (a: {
      id: string;
      "aria-invalid": boolean;
      "aria-describedby": string | undefined;
    }) => ReactNode,
    hint?: string,
  ) => (
    <div className="field">
      <label htmlFor={"teacher-" + key}>{label}</label>
      {input({
        id: "teacher-" + key,
        "aria-invalid": !!errors[key],
        "aria-describedby": errors[key] ? "error-" + key : undefined,
      })}
      {hint && <small className="wizard-help">{hint}</small>}
      {errors[key] && (
        <small id={"error-" + key} className="field-error" role="alert">
          {errors[key]}
        </small>
      )}
    </div>
  );
  const number = (text: string) => (text.trim() ? Number(text) : null);
  const updateEducation = (index: number, patch: Partial<Education>) =>
    onChange(
      "education",
      education.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  return part === "address" ? (
    <>
      <p className="wizard-help">
        Your full address stays private for verification and administration.
        Families see your chosen home-tuition service areas, never this address.
      </p>
      {Object.entries({
        line1: "House / office and street address",
        line2: "Apartment / landmark (optional)",
        locality: "Address locality",
        city: "City",
        state: "State",
        postalCode: "PIN code",
      }).map(([key, label]) => (
        <div key={key}>
          {field("address." + key, label, (a) => (
            <Input
              {...a}
              value={addr[key as keyof Address] || ""}
              maxLength={key === "postalCode" ? 6 : 160}
              inputMode={key === "postalCode" ? "numeric" : undefined}
              autoComplete={
                key === "line1"
                  ? "address-line1"
                  : key === "line2"
                    ? "address-line2"
                    : key === "postalCode"
                      ? "postal-code"
                      : undefined
              }
              onChange={(e) =>
                onChange("address", { ...addr, [key]: e.target.value })
              }
            />
          ))}
        </div>
      ))}
      <p className="wizard-help">
        Country: India. Public service coverage is selected in the
        teaching-preferences step.
      </p>
    </>
  ) : (
    <>
      <p className="wizard-help">
        Record all four milestones. Choose “Pursuing” or “Not applicable” where
        appropriate. Marks, institution details and documents stay private;
        declarations still need independent review.
      </p>
      {education.map((r, i) => (
        <section
          className="teacher-milestone"
          key={r.milestone}
          aria-label={milestones[r.milestone]}
        >
          <h3>{milestones[r.milestone]}</h3>
          {field(`education.${i}.status`, "Milestone status", (a) => (
            <select
              {...a}
              value={r.status}
              onChange={(e) =>
                updateEducation(
                  i,
                  e.target.value === "NOT_APPLICABLE"
                    ? { ...emptyDetails.education[i], status: "NOT_APPLICABLE" }
                    : { status: e.target.value as Education["status"] },
                )
              }
            >
              <option value="COMPLETED">Completed</option>
              <option value="PURSUING">Pursuing</option>
              {r.milestone !== "CLASS_10" && (
                <option value="NOT_APPLICABLE">Not applicable</option>
              )}
            </select>
          ))}
          {r.status !== "NOT_APPLICABLE" && (
            <>
              {field(
                `education.${i}.institution`,
                "School / college / university",
                (a) => (
                  <Input
                    {...a}
                    value={r.institution}
                    maxLength={160}
                    onChange={(e) =>
                      updateEducation(i, { institution: e.target.value })
                    }
                  />
                ),
              )}
              {field(
                `education.${i}.qualification`,
                r.milestone === "CLASS_10" || r.milestone === "CLASS_12"
                  ? "Board and stream"
                  : "Degree and specialization",
                (a) => (
                  <Input
                    {...a}
                    value={r.qualification}
                    maxLength={120}
                    onChange={(e) =>
                      updateEducation(i, { qualification: e.target.value })
                    }
                  />
                ),
              )}
              {field(
                `education.${i}.year`,
                r.status === "PURSUING"
                  ? "Expected completion year"
                  : "Completion year",
                (a) => (
                  <Input
                    {...a}
                    type="number"
                    min={1950}
                    max={new Date().getFullYear() + 10}
                    value={r.year ?? ""}
                    onChange={(e) =>
                      updateEducation(i, { year: number(e.target.value) })
                    }
                  />
                ),
              )}
              {r.status === "COMPLETED" && (
                <>
                  {field(
                    `education.${i}.grading`,
                    "Official result format",
                    (a) => (
                      <select
                        {...a}
                        value={r.grading || ""}
                        onChange={(e) =>
                          updateEducation(i, {
                            grading: e.target.value as Education["grading"],
                            score: null,
                            outOf: null,
                            percentage: null,
                          })
                        }
                      >
                        <option value="">Choose a format</option>
                        <option value="PERCENTAGE">Percentage</option>
                        <option value="MARKS">Marks obtained / total</option>
                        <option value="CGPA">CGPA and scale</option>
                      </select>
                    ),
                  )}
                  {r.grading &&
                    field(
                      `education.${i}.score`,
                      r.grading === "PERCENTAGE"
                        ? "Percentage (%)"
                        : r.grading === "CGPA"
                          ? "CGPA"
                          : "Marks obtained",
                      (a) => (
                        <Input
                          {...a}
                          type="number"
                          min={0}
                          step="any"
                          value={r.score ?? ""}
                          onChange={(e) =>
                            updateEducation(i, {
                              score: number(e.target.value),
                              percentage:
                                r.grading === "PERCENTAGE"
                                  ? number(e.target.value)
                                  : r.percentage,
                            })
                          }
                        />
                      ),
                    )}
                  {(r.grading === "MARKS" || r.grading === "CGPA") &&
                    field(
                      `education.${i}.outOf`,
                      r.grading === "MARKS"
                        ? "Total marks"
                        : "CGPA scale (out of)",
                      (a) => (
                        <Input
                          {...a}
                          type="number"
                          min={1}
                          step="any"
                          value={r.outOf ?? ""}
                          onChange={(e) =>
                            updateEducation(i, {
                              outOf: number(e.target.value),
                            })
                          }
                        />
                      ),
                    )}
                  {r.grading === "MARKS" && r.score !== null && r.outOf && (
                    <p className="wizard-help">
                      Calculated percentage:{" "}
                      {new Intl.NumberFormat("en-IN", {
                        maximumFractionDigits: 2,
                      }).format((r.score / r.outOf) * 100)}
                      %.
                    </p>
                  )}
                  {r.grading === "CGPA" &&
                    field(
                      `education.${i}.percentage`,
                      "Official equivalent percentage (optional)",
                      (a) => (
                        <Input
                          {...a}
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          value={r.percentage ?? ""}
                          onChange={(e) =>
                            updateEducation(i, {
                              percentage: number(e.target.value),
                            })
                          }
                        />
                      ),
                      "Enter only an institution-issued equivalence. We do not invent a CGPA conversion.",
                    )}
                </>
              )}
            </>
          )}
        </section>
      ))}
      <section className="teacher-work-history">
        <h3>Previous teaching work</h3>
        <p className="wizard-help">
          Include schools, institutes or independent tuition. If you have no
          previous work, leave this list empty. Certificates and references are
          uploaded privately after application submission.
        </p>
        {employment.map((r, i) => (
          <section
            className="teacher-employment"
            key={i}
            aria-label={`Previous work ${i + 1}`}
          >
            <h4>Previous work {i + 1}</h4>
            {(["organization", "role", "fromYear", "toYear"] as const).map(
              (key) => (
                <div key={key}>
                  {field(
                    `employment.${i}.${key}`,
                    {
                      organization: "Institution / employer / tuition practice",
                      role: "Your role",
                      fromYear: "Start year",
                      toYear: "End year (leave blank if current)",
                    }[key],
                    (a) => (
                      <Input
                        {...a}
                        type={key.includes("Year") ? "number" : "text"}
                        value={r[key] ?? ""}
                        maxLength={key === "organization" ? 160 : 100}
                        onChange={(e) =>
                          onChange(
                            "employment",
                            employment.map((row, index) =>
                              index === i
                                ? {
                                    ...row,
                                    [key]: key.includes("Year")
                                      ? number(e.target.value)
                                      : e.target.value,
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    ),
                  )}
                </div>
              ),
            )}
            {field(
              `employment.${i}.proof`,
              "Experience certificate or reference",
              (a) => (
                <select
                  {...a}
                  value={r.proof}
                  onChange={(e) =>
                    onChange(
                      "employment",
                      employment.map((row, index) =>
                        index === i
                          ? {
                              ...row,
                              proof: e.target.value as Employment["proof"],
                            }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="CERTIFICATE_AVAILABLE">
                    I can provide an experience certificate
                  </option>
                  <option value="REFERENCE_AVAILABLE">
                    I can provide a reference
                  </option>
                  <option value="NOT_AVAILABLE">
                    Neither is currently available
                  </option>
                </select>
              ),
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange(
                  "employment",
                  employment.filter((_, index) => index !== i),
                )
              }
            >
              Remove previous work {i + 1}
            </Button>
          </section>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={employment.length >= 10}
          onClick={() =>
            onChange("employment", [
              ...employment,
              {
                organization: "",
                role: "",
                fromYear: new Date().getFullYear(),
                toYear: null,
                proof: "NOT_AVAILABLE",
              },
            ])
          }
        >
          Add previous work
        </Button>
      </section>
    </>
  );
}

export function TeacherDetailsSummary({
  profile,
}: {
  profile: components["schemas"]["PrivateTeacher"];
}) {
  const a = profile.address;
  return (
    <section
      className="teacher-private-summary"
      aria-label="Private onboarding details"
    >
      <h3>Private onboarding details</h3>
      <p className="wizard-help">
        These are submitted declarations for verification. They are not
        published with the teacher profile.
      </p>
      <h4>Complete address</h4>
      {a ? (
        <p>
          {a.line1} {a.line2}
          <br />
          {a.locality}, {a.city}, {a.state} {a.postalCode} · {a.country}
        </p>
      ) : (
        <p>Address not yet recorded. Update the application before approval.</p>
      )}
      <h4>Education and results</h4>
      {profile.education?.length ? (
        <ul>
          {profile.education.map((r) => (
            <li key={r.milestone}>
              <strong>
                {milestones[r.milestone]}:{" "}
                {r.status.toLowerCase().replaceAll("_", " ")}
              </strong>
              {r.status !== "NOT_APPLICABLE" && (
                <p>
                  {r.institution} · {r.qualification} · {r.year}
                  {r.score !== null
                    ? ` · ${r.score}${r.grading === "PERCENTAGE" ? "%" : r.outOf ? ` / ${r.outOf}` : ""}`
                    : ""}
                  {r.percentage !== null && r.grading !== "PERCENTAGE"
                    ? ` · ${r.percentage}%`
                    : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>Education milestones not yet recorded.</p>
      )}
      <h4>Previous work and proof declarations</h4>
      {profile.employment?.length ? (
        <ul>
          {profile.employment.map((r, i) => (
            <li key={i}>
              <strong>
                {r.organization} · {r.role}
              </strong>
              <p>
                {r.fromYear}–{r.toYear || "current"} ·{" "}
                {r.proof.toLowerCase().replaceAll("_", " ")}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No previous work recorded.</p>
      )}
      <h4>Optional demo preference</h4>
      <p>
        {profile.demoOptIn === true
          ? "Demo offered"
          : profile.demoOptIn === false
            ? "Demo not offered"
            : "Preference not yet recorded"}
        . This preference is separate from qualification approval.
      </p>
      <p className="wizard-help">
        Review qualification certificates/marksheets and previous-work
        certificates or references in the private evidence list below. A
        declaration does not establish that a certificate has been uploaded or
        verified.
      </p>
    </section>
  );
}
