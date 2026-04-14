export function createCourseStatsService(config, deps) {
  const {
    freeCourseStorageLimitBytes,
    plusCourseStorageLimitBytes,
    defaultCoursePriceCurrency,
  } = config;

  const {
    db,
    displayName,
    getPlatformApplicationFeeAmount,
    formatStorageLimitLabel,
  } = deps;

  function ensureCourseStatsRow(courseId) {
    if (!courseId) return;

    db.prepare(`
      INSERT OR IGNORE INTO course_stats (course_id, students, rating, reviews)
      VALUES (?, 0, 0, 0)
    `).run(courseId);
  }

  function refreshCourseStorageStats(courseId) {
    if (!courseId) {
      return {
        usedBytes: 0,
        limitBytes: freeCourseStorageLimitBytes,
      };
    }

    ensureCourseStatsRow(courseId);

    const usageRow = db.prepare(`
      SELECT
        COALESCE((
          SELECT SUM(COALESCE(m.file_size_bytes, 0))
          FROM lesson_materials m
          JOIN lessons l ON l.id = m.lesson_id
          WHERE l.course_id = c.id
        ), 0)
        +
        COALESCE((
          SELECT SUM(COALESCE(clm.file_size_bytes, 0))
          FROM course_learner_materials clm
          WHERE clm.course_id = c.id
        ), 0) AS usedBytes,
        CASE
          WHEN lower(COALESCE(u.subscription_plan, 'free')) = 'plus' THEN ?
          ELSE ?
        END AS limitBytes
      FROM courses c
      JOIN users u ON u.id = c.author_user_id
      WHERE c.id = ?
    `).get(plusCourseStorageLimitBytes, freeCourseStorageLimitBytes, courseId);

    const usedBytes = Number(usageRow?.usedBytes || 0);
    const limitBytes = Number(usageRow?.limitBytes || freeCourseStorageLimitBytes);

    db.prepare(`
      UPDATE course_stats
      SET storage_used_bytes = ?, storage_limit_bytes = ?
      WHERE course_id = ?
    `).run(usedBytes, limitBytes, courseId);

    return { usedBytes, limitBytes };
  }

  function refreshUserOwnedCourseStorageStats(userId) {
    if (!userId) return;

    const courses = db.prepare(`
      SELECT id
      FROM courses
      WHERE author_user_id = ?
    `).all(userId);

    courses.forEach(course => {
      refreshCourseStorageStats(course.id);
    });
  }

  function getCourseStorageStats(courseId) {
    ensureCourseStatsRow(courseId);
    const row = db.prepare(`
      SELECT storage_used_bytes AS usedBytes, storage_limit_bytes AS limitBytes
      FROM course_stats
      WHERE course_id = ?
    `).get(courseId);

    if (!row || Number(row.limitBytes || 0) <= 0) {
      return refreshCourseStorageStats(courseId);
    }

    return {
      usedBytes: Number(row.usedBytes || 0),
      limitBytes: Number(row.limitBytes || freeCourseStorageLimitBytes),
    };
  }

  function ensureCourseStorageCapacity(courseId, incomingBytes, replacedBytes = 0) {
    const storage = getCourseStorageStats(courseId);
    const nextUsage = storage.usedBytes - Math.max(0, Number(replacedBytes || 0)) + Math.max(0, Number(incomingBytes || 0));
    if (nextUsage > storage.limitBytes) {
      throw new Error(`This upload would exceed the ${formatStorageLimitLabel(storage.limitBytes)} per-course storage limit for this course`);
    }
  }

  function getTeacherCourseStats(userId, courseId) {
    const course = db.prepare(`
      SELECT c.id, c.title, c.category, c.level, c.publish_status AS publishStatus,
             COUNT(DISTINCT a.group_id) AS assignedGroupsCount,
             COUNT(DISTINCT CASE WHEN gm.member_role = 'student' AND gm.status = 'active' THEN gm.user_id END) AS participantCount,
             COUNT(DISTINCT qa.id) AS attemptsCount,
             ROUND(AVG(qa.score_percent)) AS avgQuizScore
      FROM courses c
      LEFT JOIN group_course_assignments a ON a.course_id = c.id
      LEFT JOIN learning_group_members gm ON gm.group_id = a.group_id
      LEFT JOIN lessons l ON l.course_id = c.id
      LEFT JOIN lesson_quizzes lq ON lq.lesson_id = l.id
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = lq.id AND qa.user_id = gm.user_id
      WHERE c.id = ? AND c.author_user_id = ?
      GROUP BY c.id
    `).get(courseId, userId);

    if (!course) return null;

    const participants = db.prepare(`
      SELECT u.id, u.first_name AS firstName, u.last_name AS lastName, u.avatar_url AS avatarUrl, u.profile_blocked AS profileBlocked,
             group_concat(DISTINCT g.name) AS groupNames,
             ROUND(AVG(qa.score_percent)) AS avgQuizScore,
             COUNT(DISTINCT qa.id) AS attemptsCount,
             COUNT(DISTINCT CASE WHEN qa.passed = 1 THEN lq.id END) AS passedQuizzesCount,
             MAX(qa.submitted_at) AS lastActivity,
             MAX(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS isEnrolled
      FROM group_course_assignments a
      JOIN learning_groups g ON g.id = a.group_id
      JOIN learning_group_members gm ON gm.group_id = g.id AND gm.member_role = 'student' AND gm.status = 'active'
      JOIN users u ON u.id = gm.user_id
      LEFT JOIN course_enrollments e ON e.course_id = a.course_id AND e.user_id = gm.user_id AND e.status = 'active'
      LEFT JOIN lessons l ON l.course_id = a.course_id
      LEFT JOIN lesson_quizzes lq ON lq.lesson_id = l.id
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = lq.id AND qa.user_id = gm.user_id
      WHERE a.course_id = ? AND g.owner_user_id = ?
      GROUP BY u.id
      ORDER BY COALESCE(AVG(qa.score_percent), 0) DESC, u.first_name ASC, u.last_name ASC
    `).all(courseId, userId).map(row => ({
      id: row.id,
      name: displayName(row.firstName, row.lastName),
      avatarUrl: row.avatarUrl || '',
      profileBlocked: Boolean(row.profileBlocked),
      groupNames: String(row.groupNames || '').split(',').map(item => item.trim()).filter(Boolean),
      avgQuizScore: row.avgQuizScore == null ? null : Number(row.avgQuizScore),
      attemptsCount: Number(row.attemptsCount || 0),
      passedQuizzesCount: Number(row.passedQuizzesCount || 0),
      lastActivity: row.lastActivity || '',
      isEnrolled: Boolean(row.isEnrolled),
    }));

    const salesRows = db.prepare(`
      SELECT cp.id, cp.status, cp.amount_cents AS amountCents, cp.currency,
             cp.stripe_checkout_session_id AS checkoutSessionId,
             cp.stripe_payment_intent_id AS paymentIntentId,
             cp.updated_at AS paidAt,
             buyer.first_name AS buyerFirstName,
             buyer.last_name AS buyerLastName,
             buyer.email AS buyerEmail
      FROM course_purchases cp
      JOIN users buyer ON buyer.id = cp.user_id
      WHERE cp.course_id = ? AND cp.status = 'paid'
      ORDER BY cp.updated_at DESC, cp.created_at DESC
    `).all(courseId);

    const sales = salesRows.map(row => {
      const platformFeeCents = getPlatformApplicationFeeAmount(row.amountCents);
      const netPayoutCents = Math.max(0, Number(row.amountCents || 0) - platformFeeCents);
      return {
        id: row.id,
        status: row.status,
        buyerName: displayName(row.buyerFirstName, row.buyerLastName),
        buyerEmail: row.buyerEmail || '',
        amountCents: Number(row.amountCents || 0),
        currency: row.currency || defaultCoursePriceCurrency,
        platformFeeCents,
        netPayoutCents,
        paidAt: row.paidAt || '',
        checkoutSessionId: row.checkoutSessionId || '',
        paymentIntentId: row.paymentIntentId || '',
      };
    });

    const salesSummary = sales.reduce((acc, sale) => ({
      salesCount: acc.salesCount + 1,
      grossRevenueCents: acc.grossRevenueCents + sale.amountCents,
      platformFeeCents: acc.platformFeeCents + sale.platformFeeCents,
      netPayoutCents: acc.netPayoutCents + sale.netPayoutCents,
    }), {
      salesCount: 0,
      grossRevenueCents: 0,
      platformFeeCents: 0,
      netPayoutCents: 0,
    });

    const quizzes = db.prepare(`
      SELECT lq.id, lq.title, lq.passing_score AS passingScore, lq.time_limit_min AS timeLimitMin,
             lq.max_attempts AS maxAttempts, lq.available_from AS availableFrom, lq.available_to AS availableTo,
             lq.access_scope AS accessScope, access_group.name AS accessGroupName,
             l.id AS lessonId, l.title AS lessonTitle
      FROM lessons l
      JOIN lesson_quizzes lq ON lq.lesson_id = l.id
      LEFT JOIN learning_groups access_group ON access_group.id = lq.access_group_id
      WHERE l.course_id = ?
      ORDER BY l.rowid ASC, lq.rowid ASC
    `).all(courseId).map(quiz => {
      const summary = db.prepare(`
        SELECT COUNT(DISTINCT qa.id) AS attemptsCount,
               COUNT(DISTINCT qa.user_id) AS participantCount,
               COUNT(DISTINCT CASE WHEN qa.passed = 1 THEN qa.user_id END) AS passedParticipantsCount,
               COUNT(DISTINCT CASE WHEN qa.passed = 1 THEN qa.id END) AS passedAttemptsCount,
               ROUND(AVG(qa.score_percent)) AS avgScore,
               MAX(qa.submitted_at) AS lastActivity
        FROM group_course_assignments a
        JOIN learning_groups g ON g.id = a.group_id
        JOIN learning_group_members gm ON gm.group_id = g.id AND gm.member_role = 'student' AND gm.status = 'active'
        LEFT JOIN quiz_attempts qa ON qa.quiz_id = ? AND qa.user_id = gm.user_id
        WHERE a.course_id = ? AND g.owner_user_id = ?
      `).get(quiz.id, courseId, userId);

      const participantResults = db.prepare(`
        SELECT u.id, u.first_name AS firstName, u.last_name AS lastName, u.avatar_url AS avatarUrl, u.profile_blocked AS profileBlocked,
               group_concat(DISTINCT g.name) AS groupNames,
               COUNT(DISTINCT qa.id) AS attemptsCount,
               ROUND(AVG(qa.score_percent)) AS avgScore,
               MAX(qa.score_percent) AS bestScore,
               MAX(CASE WHEN qa.passed = 1 THEN 1 ELSE 0 END) AS hasPassed,
               MAX(qa.submitted_at) AS lastActivity,
               MAX(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS isEnrolled
        FROM group_course_assignments a
        JOIN learning_groups g ON g.id = a.group_id
        JOIN learning_group_members gm ON gm.group_id = g.id AND gm.member_role = 'student' AND gm.status = 'active'
        JOIN users u ON u.id = gm.user_id
        LEFT JOIN course_enrollments e ON e.course_id = a.course_id AND e.user_id = gm.user_id AND e.status = 'active'
        LEFT JOIN quiz_attempts qa ON qa.quiz_id = ? AND qa.user_id = gm.user_id
        WHERE a.course_id = ? AND g.owner_user_id = ?
        GROUP BY u.id
        ORDER BY COALESCE(MAX(qa.score_percent), 0) DESC, u.first_name ASC, u.last_name ASC
      `).all(quiz.id, courseId, userId).map(row => ({
        id: row.id,
        name: displayName(row.firstName, row.lastName),
        avatarUrl: row.avatarUrl || '',
        profileBlocked: Boolean(row.profileBlocked),
        groupNames: String(row.groupNames || '').split(',').map(item => item.trim()).filter(Boolean),
        attemptsCount: Number(row.attemptsCount || 0),
        avgScore: row.avgScore == null ? null : Number(row.avgScore),
        bestScore: row.bestScore == null ? null : Number(row.bestScore),
        hasPassed: Boolean(row.hasPassed),
        lastActivity: row.lastActivity || '',
        isEnrolled: Boolean(row.isEnrolled),
      }));

      const participantCount = Number(summary?.participantCount || 0);
      const passedParticipantsCount = Number(summary?.passedParticipantsCount || 0);

      return {
        id: quiz.id,
        title: quiz.title,
        lessonId: quiz.lessonId,
        lessonTitle: quiz.lessonTitle,
        passingScore: Number(quiz.passingScore || 0),
        timeLimitMin: quiz.timeLimitMin == null ? null : Number(quiz.timeLimitMin),
        maxAttempts: quiz.maxAttempts == null ? null : Number(quiz.maxAttempts),
        availableFrom: quiz.availableFrom || null,
        availableTo: quiz.availableTo || null,
        accessScope: quiz.accessScope === 'group' ? 'group' : 'course',
        accessGroupName: quiz.accessGroupName || null,
        attemptsCount: Number(summary?.attemptsCount || 0),
        participantCount,
        passedParticipantsCount,
        passedAttemptsCount: Number(summary?.passedAttemptsCount || 0),
        avgScore: summary?.avgScore == null ? null : Number(summary.avgScore),
        passRate: participantCount > 0 ? Math.round((passedParticipantsCount / participantCount) * 100) : null,
        lastActivity: summary?.lastActivity || '',
        participantResults,
      };
    });

    return {
      course: {
        ...course,
        assignedGroupsCount: Number(course.assignedGroupsCount || 0),
        participantCount: Number(course.participantCount || 0),
        attemptsCount: Number(course.attemptsCount || 0),
        avgQuizScore: course.avgQuizScore == null ? null : Number(course.avgQuizScore),
        salesCount: salesSummary.salesCount,
        grossRevenueCents: salesSummary.grossRevenueCents,
        platformFeeCents: salesSummary.platformFeeCents,
        netPayoutCents: salesSummary.netPayoutCents,
        lastSaleAt: sales[0]?.paidAt || '',
      },
      participants,
      quizzes,
      sales,
    };
  }

  return {
    ensureCourseStatsRow,
    refreshCourseStorageStats,
    refreshUserOwnedCourseStorageStats,
    getCourseStorageStats,
    ensureCourseStorageCapacity,
    getTeacherCourseStats,
  };
}
