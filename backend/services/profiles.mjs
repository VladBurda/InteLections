export function createProfileService({ db }, { getUserBase, isAdmin, slugId, sanitizeText }) {
  function canViewProfile(profileUser, viewerId = null, viewer = null) {
    if (!profileUser) return false;
    if (!profileUser.profileBlocked) return true;
    if (viewerId && viewerId === profileUser.id) return true;
    if (isAdmin(viewer)) return true;
    return false;
  }

  function listByUser(query, userId) {
    return query.all(userId);
  }

  function getProfileCollections(userId) {
    const achievements = listByUser(db.prepare(`
      SELECT id, title, organization, year_label AS yearLabel
      FROM user_achievements
      WHERE user_id = ?
      ORDER BY sort_order ASC, id ASC
    `), userId);

    const certificates = listByUser(db.prepare(`
      SELECT id, title, issuer, year_label AS yearLabel, credential_url AS credentialUrl
      FROM user_certificates
      WHERE user_id = ?
      ORDER BY sort_order ASC, id ASC
    `), userId);

    const activities = listByUser(db.prepare(`
      SELECT id, title, organization, description, year_label AS yearLabel
      FROM user_activities
      WHERE user_id = ?
      ORDER BY sort_order ASC, id ASC
    `), userId);

    const socialLinks = listByUser(db.prepare(`
      SELECT id, platform, url
      FROM user_social_links
      WHERE user_id = ?
      ORDER BY sort_order ASC, id ASC
    `), userId);

    return { achievements, certificates, activities, socialLinks };
  }

  function getProfileCourses(userId, viewerId) {
    const showAll = viewerId && viewerId === userId;
    return db.prepare(`
      SELECT id, title, category, level,
             CASE WHEN publish_status = 'published' THEN 'Published' ELSE 'Non posted' END AS status
      FROM courses
      WHERE author_user_id = ?
        AND (${showAll ? '1 = 1' : "publish_status = 'published'"})
      ORDER BY rowid DESC
      LIMIT 6
    `).all(userId);
  }

  function getFullProfile(userId, viewerId = null) {
    const base = getUserBase(userId);
    if (!base) return null;
    const viewer = viewerId ? getUserBase(viewerId) : null;
    if (!canViewProfile(base, viewerId, viewer)) return null;

    return {
      ...base,
      ...getProfileCollections(userId),
      featuredCourses: getProfileCourses(userId, viewerId),
    };
  }

  function sanitizeAchievement(item, index) {
    return {
      id: sanitizeText(item?.id) || slugId('ach'),
      title: sanitizeText(item?.title),
      organization: sanitizeText(item?.organization),
      yearLabel: sanitizeText(item?.yearLabel),
      sortOrder: index + 1,
    };
  }

  function sanitizeCertificate(item, index) {
    return {
      id: sanitizeText(item?.id) || slugId('cert'),
      title: sanitizeText(item?.title),
      issuer: sanitizeText(item?.issuer),
      yearLabel: sanitizeText(item?.yearLabel),
      credentialUrl: sanitizeText(item?.credentialUrl),
      sortOrder: index + 1,
    };
  }

  function sanitizeActivity(item, index) {
    return {
      id: sanitizeText(item?.id) || slugId('activity'),
      title: sanitizeText(item?.title),
      organization: sanitizeText(item?.organization),
      description: sanitizeText(item?.description),
      yearLabel: sanitizeText(item?.yearLabel),
      sortOrder: index + 1,
    };
  }

  function sanitizeSocialLink(item, index) {
    return {
      id: sanitizeText(item?.id) || slugId('social'),
      platform: sanitizeText(item?.platform).toLowerCase(),
      url: sanitizeText(item?.url),
      sortOrder: index + 1,
    };
  }

  return {
    getFullProfile,
    sanitizeAchievement,
    sanitizeCertificate,
    sanitizeActivity,
    sanitizeSocialLink,
  };
}
