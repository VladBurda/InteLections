export function createRatingsService({ db }, deps) {
  const { displayName } = deps;

  function getViewerCourseRating(courseId, userId) {
    if (!courseId || !userId) return null;

    const row = db.prepare(`
      SELECT stars
      FROM course_ratings
      WHERE course_id = ? AND user_id = ?
    `).get(courseId, userId);

    return row ? Number(row.stars) : null;
  }

  function getViewerCourseReview(courseId, userId) {
    if (!courseId || !userId) return null;

    const row = db.prepare(`
      SELECT stars, review_title AS reviewTitle, review_text AS reviewText, updated_at AS updatedAt
      FROM course_ratings
      WHERE course_id = ? AND user_id = ?
    `).get(courseId, userId);

    if (!row) return null;

    const title = row.reviewTitle || '';
    const text = row.reviewText || '';
    if (!title && !text) return null;

    return {
      stars: Number(row.stars || 0),
      title,
      text,
      updatedAt: row.updatedAt || '',
    };
  }

  function getCourseReviews(courseId, limit = 8) {
    return db.prepare(`
      SELECT cr.user_id AS userId, cr.stars, cr.review_title AS title, cr.review_text AS text, cr.updated_at AS updatedAt,
             u.first_name AS firstName, u.last_name AS lastName, u.avatar_url AS avatarUrl, u.profile_blocked AS profileBlocked
      FROM course_ratings cr
      JOIN users u ON u.id = cr.user_id
      WHERE cr.course_id = ?
        AND (COALESCE(cr.review_title, '') <> '' OR COALESCE(cr.review_text, '') <> '')
      ORDER BY cr.updated_at DESC, cr.created_at DESC
      LIMIT ?
    `).all(courseId, limit).map(row => ({
      userId: row.userId,
      name: displayName(row.firstName, row.lastName),
      avatarUrl: row.avatarUrl || '',
      profileBlocked: Boolean(row.profileBlocked),
      stars: Number(row.stars || 0),
      title: row.title || '',
      text: row.text || '',
      updatedAt: row.updatedAt || '',
    }));
  }

  function canUserRateCourse(course, userId, enrollment, hasClassAccess, hasPaidAccess = false) {
    if (!course || !userId) return false;
    if (userId === course.authorUserId) return false;
    return Boolean(enrollment || hasClassAccess || hasPaidAccess);
  }

  function upsertCourseRating(courseId, userId, stars, review = {}, ensureCourseStatsRow) {
    ensureCourseStatsRow(courseId);

    const stats = db.prepare(`
      SELECT rating, reviews
      FROM course_stats
      WHERE course_id = ?
    `).get(courseId) || { rating: 0, reviews: 0 };
    const existing = db.prepare(`
      SELECT stars
      FROM course_ratings
      WHERE course_id = ? AND user_id = ?
    `).get(courseId, userId);

    const reviewTitle = review.reviewTitle ?? null;
    const reviewText = review.reviewText ?? null;
    const currentRating = Number(stats.rating || 0);
    const currentReviews = Number(stats.reviews || 0);
    let nextRating = stars;
    let nextReviews = currentReviews;

    if (existing) {
      const previousStars = Number(existing.stars || 0);
      nextReviews = currentReviews > 0 ? currentReviews : 1;
      nextRating = nextReviews > 0
        ? (((currentRating * nextReviews) - previousStars + stars) / nextReviews)
        : stars;

      db.prepare(`
        UPDATE course_ratings
        SET stars = ?,
            review_title = COALESCE(?, review_title),
            review_text = COALESCE(?, review_text),
            updated_at = datetime('now')
        WHERE course_id = ? AND user_id = ?
      `).run(stars, reviewTitle, reviewText, courseId, userId);
    } else {
      nextReviews = currentReviews + 1;
      nextRating = nextReviews > 0
        ? (((currentRating * currentReviews) + stars) / nextReviews)
        : stars;

      db.prepare(`
        INSERT INTO course_ratings (course_id, user_id, stars, review_title, review_text)
        VALUES (?, ?, ?, ?, ?)
      `).run(courseId, userId, stars, reviewTitle ?? '', reviewText ?? '');
    }

    const roundedRating = Math.round(nextRating * 10) / 10;
    db.prepare(`
      UPDATE course_stats
      SET rating = ?, reviews = ?
      WHERE course_id = ?
    `).run(roundedRating, nextReviews, courseId);

    return {
      rating: roundedRating,
      reviews: nextReviews,
      viewerRating: stars,
      viewerReview: getViewerCourseReview(courseId, userId),
      courseReviews: getCourseReviews(courseId),
    };
  }

  function clearCourseReview(courseId, userId, ensureCourseStatsRow) {
    ensureCourseStatsRow(courseId);

    db.prepare(`
      UPDATE course_ratings
      SET review_title = '',
          review_text = '',
          updated_at = datetime('now')
      WHERE course_id = ? AND user_id = ?
    `).run(courseId, userId);

    const stats = db.prepare(`
      SELECT rating, reviews
      FROM course_stats
      WHERE course_id = ?
    `).get(courseId) || { rating: 0, reviews: 0 };

    return {
      rating: Number(stats.rating || 0),
      reviews: Number(stats.reviews || 0),
      viewerRating: getViewerCourseRating(courseId, userId),
      viewerReview: getViewerCourseReview(courseId, userId),
      courseReviews: getCourseReviews(courseId),
    };
  }

  return {
    getViewerCourseRating,
    getViewerCourseReview,
    getCourseReviews,
    canUserRateCourse,
    upsertCourseRating,
    clearCourseReview,
  };
}
