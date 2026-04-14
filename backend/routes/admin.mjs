export async function handleAdminRoutes(ctx, req, res, url) {
  const {
    readBody,
    sendJson,
    requireAuth,
    sanitizeText,
    db,
    isAdmin,
    getUserBase,
  } = ctx;

  if (req.method === 'POST' && /^\/api\/admin\/courses\/[^/]+\/publish-block$/.test(url.pathname)) {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (!isAdmin(auth.user)) {
      sendJson(res, 403, { error: 'Only Admin can change publishing moderation' });
      return true;
    }

    const courseId = decodeURIComponent(url.pathname.split('/')[4]);
    const body = await readBody(req);
    const blocked = Boolean(body.blocked);
    const message = sanitizeText(body.message);
    const course = db.prepare(`
      SELECT id, publish_status AS publishStatus
      FROM courses
      WHERE id = ?
    `).get(courseId);
    if (!course) {
      sendJson(res, 404, { error: 'Course not found' });
      return true;
    }

    db.prepare(`
      UPDATE courses
      SET publish_blocked = ?,
          publish_block_message = ?,
          publish_status = CASE WHEN ? = 1 THEN 'draft' ELSE publish_status END
      WHERE id = ?
    `).run(blocked ? 1 : 0, blocked ? message : '', blocked ? 1 : 0, courseId);

    const updated = db.prepare(`
      SELECT publish_blocked AS publishBlocked,
             publish_block_message AS publishBlockMessage,
             publish_status AS publishStatus
      FROM courses
      WHERE id = ?
    `).get(courseId);

    sendJson(res, 200, {
      blocked: Boolean(updated?.publishBlocked),
      message: updated?.publishBlockMessage || '',
      publishStatus: updated?.publishStatus || course.publishStatus,
    });
    return true;
  }

  if (req.method === 'POST' && /^\/api\/admin\/users\/[^/]+\/profile-visibility$/.test(url.pathname)) {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (!isAdmin(auth.user)) {
      sendJson(res, 403, { error: 'Only Admin can change profile visibility' });
      return true;
    }

    const targetUserId = decodeURIComponent(url.pathname.split('/')[4]);
    if (targetUserId === auth.user.id) {
      sendJson(res, 400, { error: 'Admin cannot hide the current admin profile' });
      return true;
    }

    const body = await readBody(req);
    const blocked = Boolean(body.blocked);
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
    if (!existing) {
      sendJson(res, 404, { error: 'User not found' });
      return true;
    }

    db.prepare('UPDATE users SET profile_blocked = ? WHERE id = ?').run(blocked ? 1 : 0, targetUserId);
    sendJson(res, 200, { blocked, user: getUserBase(targetUserId) });
    return true;
  }

  return false;
}
