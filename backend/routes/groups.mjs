export async function handleGroupsRoutes(ctx, req, res, url) {
  const {
    readBody,
    sendJson,
    requireAuth,
    sanitizeText,
    hasIntelectionsPlus,
    getOwnedLearningGroupCount,
    getOwnedCourseAssignmentCount,
    getClassAssignmentLimit,
    slugId,
    crypto,
    db,
    getClassInviteInbox,
    setHideClassInviteMessages,
    syncGroupAssignedCourseEnrollments,
    syncLearningGroupMemberEnrollments,
    getGroupsClassesPayload,
    getTeacherClassDetail,
    getStudentClassDetail,
    getTeacherClassrooms,
    courseStatsService,
    FREE_CLASSES_LIMIT,
  } = ctx;

  const { getTeacherCourseStats } = courseStatsService;

  if (req.method === 'GET' && url.pathname === '/api/me/class-invites') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    sendJson(res, 200, getClassInviteInbox(auth.user.id));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/me/class-invite-preferences') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    const body = await readBody(req);
    setHideClassInviteMessages(auth.user.id, Boolean(body.hideClassInviteMessages));
    sendJson(res, 200, getClassInviteInbox(auth.user.id));
    return true;
  }

  if (req.method === 'POST' && /^\/api\/class-invites\/[^/]+\/respond$/.test(url.pathname)) {
    const auth = requireAuth(req, res);
    if (!auth) return true;

    const inviteId = decodeURIComponent(url.pathname.split('/')[3]);
    const body = await readBody(req);
    const action = sanitizeText(body.action).toLowerCase();
    const invite = db.prepare(`
      SELECT id, group_id AS groupId, recipient_user_id AS recipientUserId
      FROM learning_group_invites
      WHERE id = ? AND recipient_user_id = ? AND status = 'pending'
    `).get(inviteId, auth.user.id);

    if (!invite) return sendJson(res, 404, { error: 'Invite not found' }), true;
    if (!['accepted', 'dismissed'].includes(action)) return sendJson(res, 400, { error: 'Invalid invite action' }), true;

    if (action === 'accepted') {
      db.prepare(`
        INSERT INTO learning_group_members (group_id, user_id, member_role, status)
        VALUES (?, ?, 'student', 'active')
        ON CONFLICT(group_id, user_id) DO UPDATE SET member_role = 'student', status = 'active', joined_at = datetime('now')
      `).run(invite.groupId, auth.user.id);
      syncGroupAssignedCourseEnrollments(auth.user.id);
    }

    db.prepare(`
      UPDATE learning_group_invites
      SET status = ?, responded_at = datetime('now')
      WHERE id = ?
    `).run(action, inviteId);

    sendJson(res, 200, { ok: true, inbox: getClassInviteInbox(auth.user.id) });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/groups-classes') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    syncGroupAssignedCourseEnrollments(auth.user.id);
    sendJson(res, 200, getGroupsClassesPayload(auth.user));
    return true;
  }

  if (req.method === 'GET' && /^\/api\/groups-classes\/classes\/[^/]+$/.test(url.pathname)) {
    const auth = requireAuth(req, res);
    if (!auth) return true;

    const groupId = decodeURIComponent(url.pathname.split('/')[4]);
    if (auth.user.role === 'Teacher' || auth.user.role === 'Admin') {
      const detail = getTeacherClassDetail(auth.user.id, groupId);
      if (!detail) return sendJson(res, 404, { error: 'Class not found' }), true;
      sendJson(res, 200, detail);
      return true;
    }
    if (auth.user.role === 'Student') {
      syncGroupAssignedCourseEnrollments(auth.user.id);
      const detail = getStudentClassDetail(auth.user.id, groupId);
      if (!detail) return sendJson(res, 404, { error: 'Class not found' }), true;
      sendJson(res, 200, detail);
      return true;
    }
    sendJson(res, 403, { error: 'Switch to Student or Teacher mode to view class details' });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/groups-classes/join-by-code') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (auth.user.role !== 'Student') return sendJson(res, 403, { error: 'Switch to Student mode to join a class with an invite code' }), true;

    const body = await readBody(req);
    const inviteCode = sanitizeText(String(body.inviteCode || '').toUpperCase());
    if (!inviteCode) return sendJson(res, 400, { error: 'Enter an invite code first' }), true;

    const group = db.prepare(`
      SELECT id, name, owner_user_id AS ownerUserId
      FROM learning_groups
      WHERE upper(invite_code) = ?
    `).get(inviteCode);

    if (!group) return sendJson(res, 404, { error: 'No class found for this invite code' }), true;
    if (group.ownerUserId === auth.user.id) return sendJson(res, 400, { error: 'You already own this class' }), true;

    const existingMembership = db.prepare(`
      SELECT status
      FROM learning_group_members
      WHERE group_id = ? AND user_id = ?
    `).get(group.id, auth.user.id);

    if (existingMembership?.status === 'active') {
      return sendJson(res, 400, { error: 'You are already a participant in this class' }), true;
    }

    db.prepare(`
      INSERT INTO learning_group_members (group_id, user_id, member_role, status)
      VALUES (?, ?, 'student', 'active')
      ON CONFLICT(group_id, user_id) DO UPDATE SET member_role = 'student', status = 'active', joined_at = datetime('now')
    `).run(group.id, auth.user.id);

    db.prepare(`
      UPDATE learning_group_invites
      SET status = 'accepted', responded_at = datetime('now')
      WHERE group_id = ? AND recipient_user_id = ? AND status = 'pending'
    `).run(group.id, auth.user.id);

    syncLearningGroupMemberEnrollments(group.id);
    syncGroupAssignedCourseEnrollments(auth.user.id);
    sendJson(res, 201, { joined: true, className: group.name, groupId: group.id });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/groups-classes/classes') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (auth.user.role !== 'Teacher') return sendJson(res, 403, { error: 'Only teachers can create classes' }), true;

    const body = await readBody(req);
    const name = sanitizeText(body.name);
    const description = sanitizeText(body.description);
    const focusArea = sanitizeText(body.focusArea);
    const meetingLabel = sanitizeText(body.meetingLabel);
    const locationLabel = sanitizeText(body.locationLabel);
    const roomLink = sanitizeText(body.roomLink);

    if (!name) return sendJson(res, 400, { error: 'Class name is required' }), true;
    if (roomLink && !/^https?:\/\//i.test(roomLink)) return sendJson(res, 400, { error: 'Room link must start with http:// or https://' }), true;
    if (!hasIntelectionsPlus(auth.user) && getOwnedLearningGroupCount(auth.user.id) >= FREE_CLASSES_LIMIT) {
      return sendJson(res, 403, { error: 'Free plan allows up to 2 classes. Upgrade to InteLections+ to create more.' }), true;
    }

    const groupId = slugId('group');
    const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    db.prepare([
      'INSERT INTO learning_groups (id, owner_user_id, name, description, focus_area, meeting_label, location_label, room_link, invite_code)',
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ].join(' ')).run(groupId, auth.user.id, name, description, focusArea, meetingLabel, locationLabel, roomLink, inviteCode);

    const classroom = getTeacherClassrooms(auth.user.id).find(item => item.id === groupId);
    sendJson(res, 201, { classroom });
    return true;
  }

  if (req.method === 'PUT' && /^\/api\/groups-classes\/classes\/[^/]+$/.test(url.pathname)) {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (auth.user.role !== 'Teacher') return sendJson(res, 403, { error: 'Only teachers can edit classes' }), true;

    const groupId = decodeURIComponent(url.pathname.split('/')[4]);
    const group = db.prepare('SELECT id FROM learning_groups WHERE id = ? AND owner_user_id = ?').get(groupId, auth.user.id);
    if (!group) return sendJson(res, 404, { error: 'Class not found' }), true;

    const body = await readBody(req);
    const name = sanitizeText(body.name);
    const description = sanitizeText(body.description);
    const focusArea = sanitizeText(body.focusArea);
    const meetingLabel = sanitizeText(body.meetingLabel);
    const locationLabel = sanitizeText(body.locationLabel);
    const roomLink = sanitizeText(body.roomLink);

    if (!name) return sendJson(res, 400, { error: 'Class name is required' }), true;
    if (roomLink && !/^https?:\/\//i.test(roomLink)) return sendJson(res, 400, { error: 'Room link must start with http:// or https://' }), true;

    db.prepare(`
      UPDATE learning_groups
      SET name = ?, description = ?, focus_area = ?, meeting_label = ?, location_label = ?, room_link = ?
      WHERE id = ? AND owner_user_id = ?
    `).run(name, description, focusArea, meetingLabel, locationLabel, roomLink, groupId, auth.user.id);

    const classroom = getTeacherClassrooms(auth.user.id).find(item => item.id === groupId);
    sendJson(res, 200, { classroom });
    return true;
  }

  if (req.method === 'POST' && /^\/api\/groups-classes\/classes\/[^/]+\/assign-course$/.test(url.pathname)) {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (auth.user.role !== 'Teacher') return sendJson(res, 403, { error: 'Only teachers can assign courses to classes' }), true;

    const groupId = decodeURIComponent(url.pathname.split('/')[4]);
    const group = db.prepare('SELECT id FROM learning_groups WHERE id = ? AND owner_user_id = ?').get(groupId, auth.user.id);
    if (!group) return sendJson(res, 404, { error: 'Class not found' }), true;

    const body = await readBody(req);
    const courseId = sanitizeText(body.courseId);
    const cadenceLabel = sanitizeText(body.cadenceLabel);
    const dueLabel = sanitizeText(body.dueLabel);
    if (!courseId) return sendJson(res, 400, { error: 'Course is required' }), true;

    const course = db.prepare('SELECT id FROM courses WHERE id = ? AND author_user_id = ?').get(courseId, auth.user.id);
    if (!course) return sendJson(res, 404, { error: 'You can only assign your own courses' }), true;

    const existing = db.prepare('SELECT id FROM group_course_assignments WHERE group_id = ? AND course_id = ?').get(groupId, courseId);
    if (existing) return sendJson(res, 400, { error: 'This course is already assigned to the class' }), true;
    if (getOwnedCourseAssignmentCount(auth.user.id) >= getClassAssignmentLimit(auth.user)) {
      return sendJson(res, 403, { error: `Your current plan allows up to ${getClassAssignmentLimit(auth.user)} class course assignments. Upgrade to InteLections+ to assign more.` }), true;
    }

    db.prepare(`
      INSERT INTO group_course_assignments (id, group_id, course_id, assigned_by_user_id, cadence_label, due_label)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(slugId('assignment'), groupId, courseId, auth.user.id, cadenceLabel, dueLabel);

    syncLearningGroupMemberEnrollments(groupId);
    const classroom = getTeacherClassrooms(auth.user.id).find(item => item.id === groupId);
    sendJson(res, 201, { classroom });
    return true;
  }

  if (req.method === 'POST' && /^\/api\/groups-classes\/classes\/[^/]+\/invites$/.test(url.pathname)) {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (auth.user.role !== 'Teacher') return sendJson(res, 403, { error: 'Only teachers can invite users to classes' }), true;

    const groupId = decodeURIComponent(url.pathname.split('/')[4]);
    const group = db.prepare('SELECT id FROM learning_groups WHERE id = ? AND owner_user_id = ?').get(groupId, auth.user.id);
    if (!group) return sendJson(res, 404, { error: 'Class not found' }), true;

    const body = await readBody(req);
    const email = sanitizeText(String(body.email || '').toLowerCase());
    if (!email || !email.includes('@')) return sendJson(res, 400, { error: 'Enter a valid user email' }), true;

    const recipient = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (!recipient) return sendJson(res, 404, { error: 'No existing user with this email was found yet' }), true;
    if (recipient.id === auth.user.id) return sendJson(res, 400, { error: 'You are already the owner of this class' }), true;

    const alreadyMember = db.prepare('SELECT 1 FROM learning_group_members WHERE group_id = ? AND user_id = ? AND status = \'active\'').get(groupId, recipient.id);
    if (alreadyMember) return sendJson(res, 400, { error: 'This user is already in the class' }), true;

    const pendingInvite = db.prepare(`
      SELECT id FROM learning_group_invites
      WHERE group_id = ? AND recipient_user_id = ? AND status = 'pending'
    `).get(groupId, recipient.id);
    if (pendingInvite) return sendJson(res, 400, { error: 'A pending invite already exists for this user' }), true;

    db.prepare(`
      INSERT INTO learning_group_invites (id, group_id, sender_user_id, recipient_user_id, recipient_email, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(slugId('invite'), groupId, auth.user.id, recipient.id, email);

    sendJson(res, 201, { invited: true });
    return true;
  }

  if (req.method === 'GET' && /^\/api\/groups-classes\/courses\/[^/]+\/stats$/.test(url.pathname)) {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    const courseId = decodeURIComponent(url.pathname.split('/')[4]);
    const stats = getTeacherCourseStats(auth.user.id, courseId);
    if (!stats) return sendJson(res, 404, { error: 'Course statistics are available only for the course owner' }), true;
    sendJson(res, 200, stats);
    return true;
  }

  return false;
}
