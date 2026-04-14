export function createGroupsService({ db, freeClassesLimit }, deps) {
  const {
    getUserBase,
    displayName,
    getTeacherAssignableCourses,
    getOwnedCourseAssignmentCount,
    getClassAssignmentLimit,
    getOwnedLearningGroupCount,
    hasIntelectionsPlus,
    syncGroupAssignedCourseEnrollments,
    getCourseAccessMode,
  } = deps;

  function getTeacherClassrooms(userId) {
    const classrooms = db.prepare(`
      SELECT g.id, g.name, g.description, g.focus_area AS focusArea,
             g.meeting_label AS meetingLabel, g.location_label AS locationLabel,
             g.room_link AS roomLink, g.invite_code AS inviteCode,
             COUNT(DISTINCT CASE WHEN gm.member_role = 'student' AND gm.status = 'active' THEN gm.user_id END) AS studentsCount,
             COUNT(DISTINCT a.course_id) AS assignedCoursesCount
      FROM learning_groups g
      LEFT JOIN learning_group_members gm ON gm.group_id = g.id
      LEFT JOIN group_course_assignments a ON a.group_id = g.id
      WHERE g.owner_user_id = ?
      GROUP BY g.id
      ORDER BY g.created_at DESC, g.name ASC
    `).all(userId);

    return classrooms.map(classroom => ({
      ...classroom,
      studentsCount: Number(classroom.studentsCount || 0),
      assignedCoursesCount: Number(classroom.assignedCoursesCount || 0),
      students: db.prepare(`
        SELECT u.id, u.first_name AS firstName, u.last_name AS lastName, u.avatar_url AS avatarUrl, u.profile_blocked AS profileBlocked
        FROM learning_group_members gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ? AND gm.member_role = 'student' AND gm.status = 'active'
        ORDER BY gm.joined_at DESC, u.first_name ASC
        LIMIT 4
      `).all(classroom.id).map(student => ({
        id: student.id,
        name: displayName(student.firstName, student.lastName),
        avatarUrl: student.avatarUrl || '',
        profileBlocked: Boolean(student.profileBlocked),
      })),
      courses: db.prepare(`
        SELECT c.id, c.title, c.publish_status AS publishStatus, c.level,
               a.cadence_label AS cadenceLabel, a.due_label AS dueLabel
        FROM group_course_assignments a
        JOIN courses c ON c.id = a.course_id
        WHERE a.group_id = ?
        ORDER BY a.created_at DESC, c.title ASC
        LIMIT 6
      `).all(classroom.id),
    }));
  }

  function getTeacherParticipants(userId) {
    const rows = db.prepare(`
      SELECT gm.user_id AS id,
             u.first_name AS firstName,
             u.last_name AS lastName,
             u.profile_blocked AS profileBlocked,
             g.name AS groupName,
             COUNT(DISTINCT a.course_id) AS assignedCoursesCount,
             COUNT(DISTINCT e.course_id) AS enrolledCoursesCount,
             ROUND(AVG(qa.score_percent)) AS avgQuizScore,
             MAX(qa.submitted_at) AS lastActivity
      FROM learning_groups g
      JOIN learning_group_members gm ON gm.group_id = g.id AND gm.member_role = 'student' AND gm.status = 'active'
      JOIN users u ON u.id = gm.user_id
      LEFT JOIN group_course_assignments a ON a.group_id = g.id
      LEFT JOIN course_enrollments e ON e.user_id = gm.user_id AND e.course_id = a.course_id AND e.status = 'active'
      LEFT JOIN lessons l ON l.course_id = a.course_id
      LEFT JOIN lesson_quizzes lq ON lq.lesson_id = l.id
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = lq.id AND qa.user_id = gm.user_id
      WHERE g.owner_user_id = ?
      GROUP BY g.id, gm.user_id
      ORDER BY COALESCE(AVG(qa.score_percent), 0) ASC, MAX(qa.submitted_at) DESC
      LIMIT 8
    `).all(userId);

    return rows.map(row => {
      const avgQuizScore = row.avgQuizScore == null ? null : Number(row.avgQuizScore);
      let statusLabel = 'Needs first attempt';
      if (avgQuizScore != null && avgQuizScore >= 80) statusLabel = 'Strong progress';
      else if (avgQuizScore != null && avgQuizScore >= 60) statusLabel = 'On track';
      else if (avgQuizScore != null) statusLabel = 'Needs attention';

      return {
        id: row.id,
        name: displayName(row.firstName, row.lastName),
        profileBlocked: Boolean(row.profileBlocked),
        groupName: row.groupName,
        assignedCoursesCount: Number(row.assignedCoursesCount || 0),
        enrolledCoursesCount: Number(row.enrolledCoursesCount || 0),
        avgQuizScore,
        lastActivity: row.lastActivity || '',
        statusLabel,
      };
    });
  }

  function getTeacherClassDetail(userId, groupId) {
    const viewer = getUserBase(userId);
    const classroom = db.prepare(`
      SELECT g.id, g.name, g.description, g.focus_area AS focusArea,
             g.meeting_label AS meetingLabel, g.location_label AS locationLabel,
             g.room_link AS roomLink, g.invite_code AS inviteCode,
             COUNT(DISTINCT CASE WHEN gm.member_role = 'student' AND gm.status = 'active' THEN gm.user_id END) AS studentsCount,
             COUNT(DISTINCT a.course_id) AS assignedCoursesCount,
             COUNT(DISTINCT CASE WHEN invite.status = 'pending' THEN invite.id END) AS pendingInvitesCount
      FROM learning_groups g
      LEFT JOIN learning_group_members gm ON gm.group_id = g.id
      LEFT JOIN group_course_assignments a ON a.group_id = g.id
      LEFT JOIN learning_group_invites invite ON invite.group_id = g.id
      WHERE g.id = ? AND g.owner_user_id = ?
      GROUP BY g.id
    `).get(groupId, userId);

    if (!classroom) return null;

    const summary = db.prepare(`
      SELECT COUNT(DISTINCT qa.id) AS attemptsCount,
             ROUND(AVG(qa.score_percent)) AS avgQuizScore,
             MAX(qa.submitted_at) AS lastActivity
      FROM learning_group_members gm
      LEFT JOIN group_course_assignments a ON a.group_id = gm.group_id
      LEFT JOIN lessons l ON l.course_id = a.course_id
      LEFT JOIN lesson_quizzes lq ON lq.lesson_id = l.id
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = lq.id AND qa.user_id = gm.user_id
      WHERE gm.group_id = ? AND gm.member_role = 'student' AND gm.status = 'active'
    `).get(groupId);

    const participants = db.prepare(`
      SELECT u.id, u.first_name AS firstName, u.last_name AS lastName, u.email, u.avatar_url AS avatarUrl, u.profile_blocked AS profileBlocked,
             gm.joined_at AS joinedAt,
             COUNT(DISTINCT a.course_id) AS assignedCoursesCount,
             COUNT(DISTINCT CASE WHEN e.status = 'active' THEN e.course_id END) AS enrolledCoursesCount,
             ROUND(AVG(qa.score_percent)) AS avgQuizScore,
             COUNT(DISTINCT qa.id) AS attemptsCount,
             COUNT(DISTINCT CASE WHEN qa.passed = 1 THEN lq.id END) AS passedQuizzesCount,
             MAX(qa.submitted_at) AS lastActivity
      FROM learning_group_members gm
      JOIN users u ON u.id = gm.user_id
      LEFT JOIN group_course_assignments a ON a.group_id = gm.group_id
      LEFT JOIN course_enrollments e ON e.course_id = a.course_id AND e.user_id = gm.user_id AND e.status = 'active'
      LEFT JOIN lessons l ON l.course_id = a.course_id
      LEFT JOIN lesson_quizzes lq ON lq.lesson_id = l.id
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = lq.id AND qa.user_id = gm.user_id
      WHERE gm.group_id = ? AND gm.member_role = 'student' AND gm.status = 'active'
      GROUP BY gm.user_id
      ORDER BY COALESCE(AVG(qa.score_percent), 0) ASC, MAX(qa.submitted_at) DESC, u.first_name ASC, u.last_name ASC
    `).all(groupId).map(row => {
      const avgQuizScore = row.avgQuizScore == null ? null : Number(row.avgQuizScore);
      let statusLabel = 'Needs first attempt';
      if (avgQuizScore != null && avgQuizScore >= 80) statusLabel = 'Strong progress';
      else if (avgQuizScore != null && avgQuizScore >= 60) statusLabel = 'On track';
      else if (avgQuizScore != null) statusLabel = 'Needs attention';

      return {
        id: row.id,
        name: displayName(row.firstName, row.lastName),
        email: row.email || '',
        avatarUrl: row.avatarUrl || '',
        profileBlocked: Boolean(row.profileBlocked),
        joinedAt: row.joinedAt || '',
        assignedCoursesCount: Number(row.assignedCoursesCount || 0),
        enrolledCoursesCount: Number(row.enrolledCoursesCount || 0),
        avgQuizScore,
        attemptsCount: Number(row.attemptsCount || 0),
        passedQuizzesCount: Number(row.passedQuizzesCount || 0),
        lastActivity: row.lastActivity || '',
        statusLabel,
      };
    });

    const courses = db.prepare(`
      SELECT c.id, c.title, c.category, c.level, c.publish_status AS publishStatus,
             a.cadence_label AS cadenceLabel, a.due_label AS dueLabel,
             COUNT(DISTINCT l.id) AS lessonCount,
             COUNT(DISTINCT lq.id) AS quizCount,
             COUNT(DISTINCT gm.user_id) AS participantCount,
             COUNT(DISTINCT CASE WHEN e.status = 'active' THEN gm.user_id END) AS enrolledCount,
             ROUND(AVG(qa.score_percent)) AS avgQuizScore,
             MAX(qa.submitted_at) AS lastActivity
      FROM group_course_assignments a
      JOIN courses c ON c.id = a.course_id
      LEFT JOIN learning_group_members gm ON gm.group_id = a.group_id AND gm.member_role = 'student' AND gm.status = 'active'
      LEFT JOIN course_enrollments e ON e.course_id = c.id AND e.user_id = gm.user_id AND e.status = 'active'
      LEFT JOIN lessons l ON l.course_id = c.id
      LEFT JOIN lesson_quizzes lq ON lq.lesson_id = l.id
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = lq.id AND qa.user_id = gm.user_id
      WHERE a.group_id = ?
      GROUP BY a.id
      ORDER BY a.created_at DESC, c.title ASC
    `).all(groupId).map(row => ({
      id: row.id,
      title: row.title,
      category: row.category,
      level: row.level,
      publishStatus: row.publishStatus,
      cadenceLabel: row.cadenceLabel || '',
      dueLabel: row.dueLabel || '',
      lessonCount: Number(row.lessonCount || 0),
      quizCount: Number(row.quizCount || 0),
      participantCount: Number(row.participantCount || 0),
      enrolledCount: Number(row.enrolledCount || 0),
      avgQuizScore: row.avgQuizScore == null ? null : Number(row.avgQuizScore),
      lastActivity: row.lastActivity || '',
    }));

    const pendingInvites = db.prepare(`
      SELECT id, recipient_email AS recipientEmail, created_at AS createdAt
      FROM learning_group_invites
      WHERE group_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 8
    `).all(groupId).map(row => ({
      id: row.id,
      recipientEmail: row.recipientEmail || '',
      createdAt: row.createdAt || '',
    }));

    return {
      classroom: {
        ...classroom,
        studentsCount: Number(classroom.studentsCount || 0),
        assignedCoursesCount: Number(classroom.assignedCoursesCount || 0),
        pendingInvitesCount: Number(classroom.pendingInvitesCount || 0),
        avgQuizScore: summary?.avgQuizScore == null ? null : Number(summary.avgQuizScore),
        attemptsCount: Number(summary?.attemptsCount || 0),
        lastActivity: summary?.lastActivity || '',
      },
      participants,
      courses,
      pendingInvites,
      availableCourses: getTeacherAssignableCourses(userId),
      limits: {
        assignmentsUsed: getOwnedCourseAssignmentCount(userId),
        assignmentsLimit: getClassAssignmentLimit(viewer),
        classesUsed: getOwnedLearningGroupCount(userId),
        classesLimit: hasIntelectionsPlus(viewer) ? null : freeClassesLimit,
      },
      audience: 'teacher',
    };
  }

  function getStudentClassDetail(userId, groupId) {
    const classroom = db.prepare(`
      SELECT g.id, g.name, g.description, g.focus_area AS focusArea,
             g.meeting_label AS meetingLabel, g.location_label AS locationLabel, g.room_link AS roomLink,
             owner.id AS teacherId, owner.first_name AS teacherFirstName, owner.last_name AS teacherLastName, owner.profile_blocked AS teacherProfileBlocked,
             COUNT(DISTINCT a.course_id) AS assignedCoursesCount,
             COUNT(DISTINCT CASE WHEN e.status = 'active' THEN e.course_id END) AS activeEnrollmentsCount
      FROM learning_group_members gm
      JOIN learning_groups g ON g.id = gm.group_id
      JOIN users owner ON owner.id = g.owner_user_id
      LEFT JOIN group_course_assignments a ON a.group_id = g.id
      LEFT JOIN course_enrollments e ON e.user_id = gm.user_id AND e.course_id = a.course_id AND e.status = 'active'
      WHERE gm.user_id = ? AND gm.group_id = ? AND gm.member_role = 'student' AND gm.status = 'active'
      GROUP BY g.id
    `).get(userId, groupId);

    if (!classroom) return null;

    const courses = db.prepare(`
      SELECT c.id, c.title, c.category, c.level, c.publish_status AS publishStatus, c.access_type AS accessType, c.visibility,
             a.cadence_label AS cadenceLabel, a.due_label AS dueLabel,
             COUNT(DISTINCT l.id) AS lessonCount,
             ROUND(AVG(qa.score_percent)) AS avgQuizScore,
             MAX(qa.submitted_at) AS lastAttemptAt,
             MAX(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS isEnrolled
      FROM group_course_assignments a
      JOIN courses c ON c.id = a.course_id
      LEFT JOIN lessons l ON l.course_id = c.id
      LEFT JOIN lesson_quizzes lq ON lq.lesson_id = l.id
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = lq.id AND qa.user_id = ?
      LEFT JOIN course_enrollments e ON e.course_id = c.id AND e.user_id = ?
      WHERE a.group_id = ?
      GROUP BY a.id
      ORDER BY a.created_at DESC, c.title ASC
    `).all(userId, userId, groupId).map(row => ({
      ...row,
      accessMode: getCourseAccessMode(row),
      lessonCount: Number(row.lessonCount || 0),
      avgQuizScore: row.avgQuizScore == null ? null : Number(row.avgQuizScore),
      isEnrolled: Boolean(row.isEnrolled),
      lastAttemptAt: row.lastAttemptAt || '',
    }));

    const recentAttempts = db.prepare(`
      SELECT qa.id, qa.score_percent AS scorePercent, qa.passed, qa.submitted_at AS submittedAt,
             q.title AS quizTitle, c.title AS courseTitle
      FROM learning_group_members gm
      JOIN group_course_assignments a ON a.group_id = gm.group_id
      JOIN courses c ON c.id = a.course_id
      JOIN lessons l ON l.course_id = c.id
      JOIN lesson_quizzes q ON q.lesson_id = l.id
      JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.user_id = gm.user_id
      WHERE gm.user_id = ? AND gm.group_id = ? AND gm.member_role = 'student' AND gm.status = 'active'
      ORDER BY qa.submitted_at DESC, qa.id DESC
      LIMIT 8
    `).all(userId, groupId).map(row => ({
      ...row,
      scorePercent: Number(row.scorePercent || 0),
      passed: Boolean(row.passed),
      submittedAt: row.submittedAt || '',
    }));

    return {
      audience: 'student',
      classroom: {
        ...classroom,
        teacherName: displayName(classroom.teacherFirstName, classroom.teacherLastName),
        teacherProfileBlocked: Boolean(classroom.teacherProfileBlocked),
        assignedCoursesCount: Number(classroom.assignedCoursesCount || 0),
        activeEnrollmentsCount: Number(classroom.activeEnrollmentsCount || 0),
      },
      courses,
      recentAttempts,
    };
  }

  function getStudentClassrooms(userId) {
    const classrooms = db.prepare(`
      SELECT g.id, g.name, g.description, g.focus_area AS focusArea,
             g.meeting_label AS meetingLabel, g.location_label AS locationLabel, g.room_link AS roomLink,
             owner.id AS teacherId, owner.first_name AS teacherFirstName, owner.last_name AS teacherLastName, owner.profile_blocked AS teacherProfileBlocked,
             COUNT(DISTINCT a.course_id) AS assignedCoursesCount,
             COUNT(DISTINCT e.course_id) AS activeEnrollmentsCount
      FROM learning_group_members gm
      JOIN learning_groups g ON g.id = gm.group_id
      JOIN users owner ON owner.id = g.owner_user_id
      LEFT JOIN group_course_assignments a ON a.group_id = g.id
      LEFT JOIN course_enrollments e ON e.user_id = gm.user_id AND e.course_id = a.course_id AND e.status = 'active'
      WHERE gm.user_id = ? AND gm.member_role = 'student' AND gm.status = 'active'
      GROUP BY g.id
      ORDER BY g.created_at DESC, g.name ASC
    `).all(userId);

    return classrooms.map(classroom => ({
      ...classroom,
      teacherName: displayName(classroom.teacherFirstName, classroom.teacherLastName),
      teacherProfileBlocked: Boolean(classroom.teacherProfileBlocked),
      assignedCoursesCount: Number(classroom.assignedCoursesCount || 0),
      activeEnrollmentsCount: Number(classroom.activeEnrollmentsCount || 0),
      courses: db.prepare(`
        SELECT c.id, c.title, c.publish_status AS publishStatus,
               a.cadence_label AS cadenceLabel, a.due_label AS dueLabel
        FROM group_course_assignments a
        JOIN courses c ON c.id = a.course_id
        WHERE a.group_id = ?
        ORDER BY a.created_at DESC, c.title ASC
        LIMIT 6
      `).all(classroom.id),
    }));
  }

  function getStudentAssignedCourses(userId) {
    const rows = db.prepare(`
      SELECT c.id, c.title, c.category, c.level, c.publish_status AS publishStatus, c.access_type AS accessType, c.visibility,
             author.id AS authorId, author.first_name AS authorFirstName, author.last_name AS authorLastName, author.profile_blocked AS authorProfileBlocked,
             COUNT(DISTINCT l.id) AS lessonCount,
             ROUND(AVG(qa.score_percent)) AS avgQuizScore,
             MAX(qa.submitted_at) AS lastAttemptAt,
             MAX(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS isEnrolled,
             group_concat(DISTINCT g.name) AS groupNames
      FROM learning_group_members gm
      JOIN learning_groups g ON g.id = gm.group_id
      JOIN group_course_assignments a ON a.group_id = g.id
      JOIN courses c ON c.id = a.course_id
      JOIN users author ON author.id = c.author_user_id
      LEFT JOIN lessons l ON l.course_id = c.id
      LEFT JOIN lesson_quizzes lq ON lq.lesson_id = l.id
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = lq.id AND qa.user_id = gm.user_id
      LEFT JOIN course_enrollments e ON e.course_id = c.id AND e.user_id = gm.user_id
      WHERE gm.user_id = ? AND gm.member_role = 'student' AND gm.status = 'active'
      GROUP BY c.id
      ORDER BY CASE WHEN c.publish_status = 'published' THEN 0 ELSE 1 END, c.title ASC
    `).all(userId);

    return rows.map(row => ({
      ...row,
      accessMode: getCourseAccessMode(row),
      authorName: displayName(row.authorFirstName, row.authorLastName),
      authorProfileBlocked: Boolean(row.authorProfileBlocked),
      lessonCount: Number(row.lessonCount || 0),
      avgQuizScore: row.avgQuizScore == null ? null : Number(row.avgQuizScore),
      isEnrolled: Boolean(row.isEnrolled),
      groupNames: String(row.groupNames || '').split(',').map(item => item.trim()).filter(Boolean),
      lastAttemptAt: row.lastAttemptAt || '',
    }));
  }

  function getStudentRecentAttempts(userId) {
    return db.prepare(`
      SELECT qa.id, qa.score_percent AS scorePercent, qa.passed, qa.submitted_at AS submittedAt,
             q.title AS quizTitle, c.title AS courseTitle
      FROM quiz_attempts qa
      JOIN lesson_quizzes q ON q.id = qa.quiz_id
      JOIN lessons l ON l.id = q.lesson_id
      JOIN courses c ON c.id = l.course_id
      WHERE qa.user_id = ?
      ORDER BY qa.submitted_at DESC, qa.id DESC
      LIMIT 8
    `).all(userId).map(row => ({
      ...row,
      scorePercent: Number(row.scorePercent || 0),
      passed: Boolean(row.passed),
    }));
  }

  function getGroupsClassesPayload(user) {
    const viewer = {
      id: user.id,
      firstName: user.firstName,
      role: user.role,
    };

    if (user.role === 'Teacher' || user.role === 'Admin') {
      const classrooms = getTeacherClassrooms(user.id);
      const participants = getTeacherParticipants(user.id);
      const totalStudents = Number(db.prepare(`
        SELECT COUNT(DISTINCT gm.user_id) AS count
        FROM learning_groups g
        JOIN learning_group_members gm ON gm.group_id = g.id
        WHERE g.owner_user_id = ? AND gm.member_role = 'student' AND gm.status = 'active'
      `).get(user.id).count || 0);
      const assignedCourses = Number(db.prepare(`
        SELECT COUNT(DISTINCT a.course_id) AS count
        FROM learning_groups g
        JOIN group_course_assignments a ON a.group_id = g.id
        WHERE g.owner_user_id = ?
      `).get(user.id).count || 0);
      const classCount = classrooms.length;
      const classLimit = hasIntelectionsPlus(user) ? null : freeClassesLimit;
      const assignmentCount = getOwnedCourseAssignmentCount(user.id);
      const assignmentLimit = getClassAssignmentLimit(user);
      const avgScoreRow = db.prepare(`
        SELECT ROUND(AVG(qa.score_percent)) AS avgScore
        FROM quiz_attempts qa
        JOIN lesson_quizzes lq ON lq.id = qa.quiz_id
        JOIN lessons l ON l.id = lq.lesson_id
        JOIN courses c ON c.id = l.course_id
        WHERE c.author_user_id = ?
      `).get(user.id);
      const avgScore = avgScoreRow?.avgScore == null ? null : Number(avgScoreRow.avgScore);

      return {
        audience: 'teacher',
        viewer,
        overview: [
          { label: 'Active classes', value: String(classrooms.length), hint: 'Teacher-managed groups with assignments and meeting context.' },
          { label: 'Students', value: String(totalStudents), hint: 'Distinct active learners currently inside your classes.' },
          { label: 'Assigned courses', value: String(assignedCourses), hint: 'Courses already attached to classes and ready to guide.' },
          { label: 'Average quiz score', value: avgScore == null ? 'No attempts' : String(avgScore) + '%', hint: 'Calculated from submitted quiz attempts in your authored courses.' },
        ],
        teacher: {
          classrooms,
          participants,
          availableCourses: getTeacherAssignableCourses(user.id),
          limits: {
            assignmentsUsed: assignmentCount,
            assignmentsLimit: assignmentLimit,
            classesUsed: classCount,
            classesLimit: classLimit,
          },
        },
      };
    }

    if (user.role === 'Student') {
      const classrooms = getStudentClassrooms(user.id);
      const assignedCourses = getStudentAssignedCourses(user.id);
      const recentAttempts = getStudentRecentAttempts(user.id);
      const avgScore = recentAttempts.length > 0
        ? Math.round(recentAttempts.reduce((sum, item) => sum + item.scorePercent, 0) / recentAttempts.length)
        : null;

      return {
        audience: 'student',
        viewer,
        overview: [
          { label: 'Joined classes', value: String(classrooms.length), hint: 'Teacher-led spaces that organize your learning path.' },
          { label: 'Assigned courses', value: String(assignedCourses.length), hint: 'Courses attached to your classes, including private preparation tracks.' },
          { label: 'Active enrollments', value: String(assignedCourses.filter(course => course.isEnrolled).length), hint: 'Published courses you already joined and can continue right away.' },
          { label: 'Average quiz score', value: avgScore == null ? 'No attempts' : String(avgScore) + '%', hint: 'Based on your recent submitted quizzes across classes.' },
        ],
        student: {
          classrooms,
          assignedCourses,
          recentAttempts,
        },
      };
    }

    const ownedCoursesCount = Number(db.prepare('SELECT COUNT(*) AS count FROM courses WHERE author_user_id = ?').get(user.id).count || 0);
    const savedCoursesCount = Number(db.prepare('SELECT COUNT(*) AS count FROM saved_courses WHERE user_id = ?').get(user.id).count || 0);

    return {
      audience: 'personal',
      viewer,
      overview: [
        { label: 'Saved courses', value: String(savedCoursesCount), hint: 'Courses you bookmarked for your own learning journey.' },
        { label: 'Created courses', value: String(ownedCoursesCount), hint: 'Your own course catalog, if you decide to teach later.' },
        { label: 'Current role', value: user.role, hint: 'Groups & Classes expands fully for Student and Teacher roles.' },
      ],
      personal: {
        ownedCoursesCount,
        savedCoursesCount,
        message: 'Personal mode keeps this area simple. You can still save courses, build your own catalog, review course statistics in My Products, and switch to Student or Teacher mode when you want classroom tools.',
      },
    };
  }

  return {
    getTeacherClassrooms,
    getTeacherClassDetail,
    getStudentClassDetail,
    getStudentClassrooms,
    getStudentAssignedCourses,
    getStudentRecentAttempts,
    getGroupsClassesPayload,
  };
}
