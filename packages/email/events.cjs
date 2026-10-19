module.exports = async function targets(db, job) {
  const found = new Map(),
    add = (accountId, actionPath) => {
      if (accountId) found.set(accountId, { accountId, actionPath });
    };
  const staff = async (region) => {
    for (const a of await db.account.findMany({
      where: {
        disabled: false,
        OR: [{ role: "ADMIN" }, { role: "OPERATOR", region }],
      },
      select: { id: true },
    }))
      add(a.id, "/dashboard");
  };
  const family = async (guardianId, childId, path) => {
    const g = await db.account.findUnique({ where: { id: guardianId } }),
      consent = await db.consent.findUnique({ where: { guardianId } }),
      child = await db.child.findUnique({ where: { id: childId } });
    if (
      !g?.verified ||
      g.disabled ||
      !consent ||
      consent.withdrawnAt ||
      !child ||
      (await db.privacyRequest.count({
        where: {
          accountId: guardianId,
          kind: "DELETION",
          scope: { in: ["ACCOUNT", "CHILD"] },
          status: "PENDING",
        },
      }))
    )
      return;
    if (
      child.guardianVerificationId &&
      !(await db.guardianVerification.count({
        where: { id: child.guardianVerificationId, status: "APPROVED" },
      }))
    )
      return;
    add(guardianId, path);
    if (!child.studentAccessRevokedAt)
      add(child.studentAccountId, "/dashboard/learning-choices");
  };
  const independent = async (studentId, path) => {
    const owner = await db.account.findUnique({ where: { id: studentId } });
    if (
      !owner ||
      owner.disabled ||
      (await db.privacyRequest.count({
        where: {
          accountId: studentId,
          scope: "ACCOUNT",
          kind: "DELETION",
          status: "PENDING",
        },
      })) ||
      !(await db.independentStudentProfile.count({
        where: { accountId: studentId },
      }))
    )
      return;
    add(studentId, path);
    for (const grant of await db.studentGuardianGrant.findMany({
      where: { studentAccountId: studentId, status: "ACTIVE" },
    }))
      add(
        grant.acceptedById,
        path + (path.includes("?") ? "&" : "?") + "student=" + studentId,
      );
  };
  const t = job.type,
    id = job.aggregateId;
  if (t === "supporter.invited") {
    const g = await db.studentGuardianGrant.findUnique({ where: { id } });
    if (g && g.status === "PENDING" && g.expiresAt > new Date()) {
      const owner = await db.account.findUnique({
        where: { id: g.studentAccountId },
      });
      if (
        owner &&
        !owner.disabled &&
        !(await db.privacyRequest.count({
          where: {
            accountId: owner.id,
            scope: "ACCOUNT",
            kind: "DELETION",
            status: "PENDING",
          },
        }))
      )
        found.set("email:" + g.recipientEmail, {
          to: g.recipientEmail,
          locale: owner.emailLocale,
          region: owner.region,
          actionPath: "/dashboard/supported-students",
        });
    }
  } else if (
    t.startsWith("request.") ||
    t.startsWith("matching.") ||
    t === "shortlist.published" ||
    t === "candidate.responded"
  ) {
    const r = await db.tuitionRequest.findUnique({ where: { id } });
    if (r) {
      await family(
        r.guardianId,
        r.childId,
        "/dashboard/requests?request=" + id,
      );
      if (t === "request.created" || t === "matching.review_ready")
        await staff(r.region);
      if (t === "shortlist.published" && r.status === "OPEN")
        for (const c of await db.recommendation.findMany({
          where: {
            requestId: id,
            presentedAt: { not: null },
            expiresAt: { gt: new Date() },
            response: "PENDING",
          },
        })) {
          const teacher = await db.teacher.findUnique({
            where: { id: c.teacherId },
          });
          add(teacher?.accountId, "/dashboard/enquiries");
        }
    }
  } else if (t.startsWith("student-enquiry.")) {
    const e = await db.studentEnquiry.findUnique({ where: { id } });
    if (e) {
      await independent(
        e.studentAccountId,
        "/dashboard/student-enquiries?enquiry=" + id,
      );
      if (
        ["student-enquiry.created", "student-enquiry.review_ready"].includes(t)
      )
        await staff(e.region);
      if (t === "student-enquiry.published" && e.status === "SUBMITTED")
        for (const c of await db.studentCandidate.findMany({
          where: {
            enquiryId: id,
            position: { not: null },
            expiresAt: { gt: new Date() },
            response: "PENDING",
          },
        })) {
          const teacher = await db.teacher.findUnique({
            where: { id: c.teacherId },
          });
          add(teacher?.accountId, "/dashboard/student-opportunities");
        }
    }
  } else if (t.startsWith("student-arrangement.")) {
    const a = await db.studentArrangement.findUnique({ where: { id } });
    if (a) {
      await independent(
        a.studentAccountId,
        "/dashboard/student-arrangements?arrangement=" + id,
      );
      const teacher = await db.teacher.findUnique({
        where: { id: a.teacherId },
      });
      add(
        teacher?.accountId,
        "/dashboard/student-arrangements?arrangement=" + id,
      );
    }
  } else if (t.startsWith("placement.") || t.startsWith("tuition.")) {
    const p = await db.placement.findUnique({ where: { id } });
    if (p) {
      await family(p.guardianId, p.childId, "/dashboard?arrangement=" + id);
      const teacher = await db.teacher.findUnique({
        where: { id: p.teacherId },
      });
      add(teacher?.accountId, "/dashboard?arrangement=" + id);
    } else if (t.startsWith("tuition.")) {
      const a = await db.studentArrangement.findUnique({ where: { id } });
      if (a) {
        await independent(
          a.studentAccountId,
          "/dashboard/student-arrangements?arrangement=" + id,
        );
        add(
          (await db.teacher.findUnique({ where: { id: a.teacherId } }))
            ?.accountId,
          "/dashboard/student-arrangements?arrangement=" + id,
        );
      }
    }
  } else if (t.startsWith("demo.")) {
    const d = await db.demo.findUnique({ where: { id } });
    if (d) {
      const r = await db.tuitionRequest.findUnique({
        where: { id: d.requestId },
      });
      if (r) await family(r.guardianId, r.childId, "/dashboard/demos");
      add(
        (await db.teacher.findUnique({ where: { id: d.teacherId } }))
          ?.accountId,
        "/dashboard/demos",
      );
    }
  } else if (t.startsWith("case.") || t.startsWith("support.")) {
    const c = await db.supportCase.findUnique({ where: { id } });
    if (c) {
      add(c.accountId, "/support?case=" + id);
      if (c.assignedToId) add(c.assignedToId, "/support?case=" + id);
      else await staff(c.region);
    }
  } else if (t === "service.follow_up") {
    const p = await db.placement.findUnique({ where: { id } });
    if (p) {
      await family(p.guardianId, p.childId, "/dashboard?arrangement=" + id);
      add(
        (await db.teacher.findUnique({ where: { id: p.teacherId } }))
          ?.accountId,
        "/dashboard?arrangement=" + id,
      );
    }
  }
  return [...found.values()];
};
