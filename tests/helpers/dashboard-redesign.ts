import { expect, type Page } from "@playwright/test";
const accountId = "10000000-0000-4000-8000-000000000661";
export async function dashboard(page: Page, role: string) {
  let privateFailure = false,
    hiringFailure = false;
  const reads: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    reads.push(path);
    expect(req.method()).toBe("GET");
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: accountId,
            name: "Synthetic Priya",
            role,
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/auth/mfa"))
      return route.fulfill({
        json: {
          enabled: true,
          verifiedUntil: new Date(Date.now() + 300000).toISOString(),
          recoveryCodesRemaining: 8,
        },
      });
    if (path.endsWith("/dashboard"))
      return route.fulfill(
        privateFailure
          ? {
              status: 403,
              json: { code: "FORBIDDEN", message: "Synthetic denied profile" },
            }
          : {
              json: {
                profile: {
                  name: "Synthetic Priya",
                  education: [
                    {
                      milestone: "POSTGRADUATE",
                      status: "COMPLETED",
                      qualification: "MSc Mathematics",
                      institution: "Synthetic university",
                      year: 2021,
                      grading: "PERCENTAGE",
                      score: 82,
                      outOf: null,
                      percentage: 82,
                    },
                    {
                      milestone: "CLASS_10",
                      status: "COMPLETED",
                      qualification: "Secondary school",
                      institution: "Synthetic school",
                      year: 2014,
                      grading: "PERCENTAGE",
                      score: 85,
                      outOf: null,
                      percentage: 85,
                    },
                  ],
                  employment: [
                    {
                      organization: "Synthetic school",
                      role: "Mathematics teacher",
                      fromYear: 2021,
                      toYear: null,
                      proof: "CERTIFICATE_AVAILABLE",
                    },
                  ],
                  experience: 5,
                  modes: ["HOME", "ONLINE"],
                  languages: ["English", "Hindi"],
                  monthlyPaise: 350000,
                  demoOptIn: true,
                  lockInDays: 15,
                },
              },
            },
      );
    if (path.endsWith("/dashboard/hiring")) {
      if (hiringFailure)
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Synthetic unavailable" },
        });
      const teacher = role === "TEACHER",
        admin = role === "ADMIN";
      return route.fulfill({
        json: {
          role,
          asOf: new Date().toISOString(),
          definitionVersion: "hiring-v1",
          section: "ENQUIRIES",
          counts: {
            enquiries: 0,
            openEnquiries: 0,
            pendingResponses: 0,
            termsPending: 0,
            activeArrangements: 0,
          },
          enquiries: [],
          arrangements: [],
          learners: [],
          learnersLimited: false,
          nextCursor: null,
          ...(role === "GUARDIAN"
            ? { gate: { verified: true, consent: true, privacyPaused: false } }
            : {}),
          ...(teacher
            ? {
                profile: {
                  name: "Synthetic Priya",
                  status: "APPROVED",
                  subjects: ["Maths"],
                  screeningComplete: true,
                  screeningValidUntil: new Date(
                    Date.now() + 86400000,
                  ).toISOString(),
                  feeTermsAccepted: true,
                },
              }
            : {}),
          ...(admin
            ? {
                operations: {
                  requests: [],
                  teachers: [],
                  arrangements: [],
                  openSupport: 0,
                  pendingPrivacy: 0,
                  failedJobs: 0,
                },
              }
            : {}),
        },
      });
    }
    if (path.endsWith("/independent-student/profile"))
      return route.fulfill({
        json: {
          education: {
            stage: "COLLEGE",
            institutionName: "Synthetic college",
            subjects: ["Maths"],
            courseName: "BSc Mathematics",
            university: "Synthetic university",
            studyYear: 2,
          },
          editStatus: "EDITABLE",
        },
      });
    if (
      path.endsWith("/student-enquiries") ||
      path.endsWith("/student-arrangements")
    )
      return route.fulfill({ json: { items: [], nextCursor: null } });
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Synthetic route unavailable" },
    });
  });
  return {
    reads,
    denyProfile: () => (privateFailure = true),
    failHiring: () => (hiringFailure = true),
  };
}
