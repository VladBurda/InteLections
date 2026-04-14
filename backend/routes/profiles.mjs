export async function handleProfileRoutes(ctx, req, res, url) {
  const {
    readBody,
    sendJson,
    requireAuth,
    sanitizeText,
    normalizeSubscriptionPlan,
    refreshUserOwnedCourseStorageStats,
    saveAvatarFile,
    removeStoredAvatarIfLocal,
    db,
    getFullProfile,
    getCurrentUserId,
    sanitizeAchievement,
    sanitizeCertificate,
    sanitizeActivity,
    sanitizeSocialLink,
  } = ctx;

  if (req.method === 'POST' && url.pathname === '/api/me/avatar') {
    const auth = requireAuth(req, res);
    if (!auth) return true;

    const body = await readBody(req, 8_000_000);
    const avatarUrl = saveAvatarFile(auth.user.id, body.mimeType, body.base64Data);
    removeStoredAvatarIfLocal(auth.user.avatarUrl);
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, auth.user.id);
    sendJson(res, 200, { avatarUrl });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/me/role') {
    const auth = requireAuth(req, res);
    if (!auth) return true;

    const body = await readBody(req);
    const nextRole = sanitizeText(body.role);
    const allowedSelfRoles = ['Personal', 'Student', 'Teacher'];

    if (!allowedSelfRoles.includes(nextRole)) {
      sendJson(res, 400, { error: 'Invalid role selected' });
      return true;
    }
    if (auth.user.role === 'Admin') {
      sendJson(res, 403, { error: 'Admin role cannot be changed here' });
      return true;
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(nextRole, auth.user.id);
    sendJson(res, 200, { role: nextRole });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/me/subscription') {
    const auth = requireAuth(req, res);
    if (!auth) return true;

    const body = await readBody(req);
    const nextPlan = normalizeSubscriptionPlan(body.plan);
    const subscriptionStartedAt = nextPlan === 'plus'
      ? (auth.user.subscriptionStartedAt || new Date().toISOString())
      : null;

    db.prepare('UPDATE users SET subscription_plan = ?, subscription_started_at = ? WHERE id = ?').run(
      nextPlan,
      subscriptionStartedAt,
      auth.user.id,
    );
    refreshUserOwnedCourseStorageStats(auth.user.id);

    sendJson(res, 200, { plan: nextPlan, subscriptionStartedAt });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    sendJson(res, 200, getFullProfile(auth.user.id, auth.user.id));
    return true;
  }

  if (req.method === 'PUT' && url.pathname === '/api/me') {
    const auth = requireAuth(req, res);
    if (!auth) return true;

    const userId = auth.user.id;
    const body = await readBody(req);
    const nextRole = sanitizeText(body.role);
    const allowedSelfRoles = ['Personal', 'Student', 'Teacher'];

    if (nextRole === 'Admin') {
      sendJson(res, 403, { error: 'Admin role cannot be selected manually' });
      return true;
    }
    if (nextRole && !allowedSelfRoles.includes(nextRole)) {
      sendJson(res, 400, { error: 'Invalid role selected' });
      return true;
    }

    db.prepare(`
      UPDATE users
      SET first_name = ?, last_name = ?, role = ?, bio = ?, location = ?, birth_date = ?, avatar_url = ?,
          headline = ?, website = ?, institution = ?, specialization = ?
      WHERE id = ?
    `).run(
      sanitizeText(body.firstName),
      sanitizeText(body.lastName),
      auth.user.role === 'Admin' ? 'Admin' : (nextRole || auth.user.role),
      sanitizeText(body.bio),
      sanitizeText(body.location),
      sanitizeText(body.birthday) || null,
      sanitizeText(body.avatarUrl),
      sanitizeText(body.headline),
      sanitizeText(body.website),
      sanitizeText(body.institution),
      sanitizeText(body.specialization),
      userId,
    );

    if (Array.isArray(body.achievements)) {
      db.prepare('DELETE FROM user_achievements WHERE user_id = ?').run(userId);
      const insertAchievement = db.prepare(`
        INSERT INTO user_achievements (id, user_id, title, organization, year_label, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      body.achievements
        .map((item, index) => sanitizeAchievement(item, index))
        .filter(item => item.title)
        .forEach(item => {
          insertAchievement.run(item.id, userId, item.title, item.organization, item.yearLabel, item.sortOrder);
        });
    }

    if (Array.isArray(body.certificates)) {
      db.prepare('DELETE FROM user_certificates WHERE user_id = ?').run(userId);
      const insertCertificate = db.prepare(`
        INSERT INTO user_certificates (id, user_id, title, issuer, year_label, credential_url, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      body.certificates
        .map((item, index) => sanitizeCertificate(item, index))
        .filter(item => item.title)
        .forEach(item => {
          insertCertificate.run(item.id, userId, item.title, item.issuer, item.yearLabel, item.credentialUrl, item.sortOrder);
        });
    }

    if (Array.isArray(body.activities)) {
      db.prepare('DELETE FROM user_activities WHERE user_id = ?').run(userId);
      const insertActivity = db.prepare(`
        INSERT INTO user_activities (id, user_id, title, organization, description, year_label, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      body.activities
        .map((item, index) => sanitizeActivity(item, index))
        .filter(item => item.title)
        .forEach(item => {
          insertActivity.run(item.id, userId, item.title, item.organization, item.description, item.yearLabel, item.sortOrder);
        });
    }

    if (Array.isArray(body.socialLinks)) {
      db.prepare('DELETE FROM user_social_links WHERE user_id = ?').run(userId);
      const insertSocial = db.prepare(`
        INSERT INTO user_social_links (id, user_id, platform, url, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `);
      body.socialLinks
        .map((item, index) => sanitizeSocialLink(item, index))
        .filter(item => item.platform && item.url)
        .forEach(item => {
          insertSocial.run(item.id, userId, item.platform, item.url, item.sortOrder);
        });
    }

    sendJson(res, 200, getFullProfile(userId, userId));
    return true;
  }

  if (req.method === 'GET' && /^\/api\/profiles\/[^/]+$/.test(url.pathname)) {
    const profileId = decodeURIComponent(url.pathname.split('/')[3]);
    const viewerId = getCurrentUserId(req);
    const profile = getFullProfile(profileId, viewerId);
    if (!profile) {
      sendJson(res, 404, { error: 'Profile not found' });
      return true;
    }
    sendJson(res, 200, profile);
    return true;
  }

  return false;
}
