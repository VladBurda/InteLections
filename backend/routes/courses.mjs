export async function handleCourseRoutes(ctx, req, res, url) {
  const {
    OPENAI_API_KEY,
    readBody,
    readMultipartForm,
    sendJson: baseSendJson,
    authUserOrNull,
    requireAuth,
    sanitizeText,
    db,
    slugId,
    createYouTubeMaterial,
    materialKindFromNameOrMime,
    getHostedVideoLimitSeconds,
    saveLessonMaterialFile,
    replaceLessonMaterialFile,
    removeStoredMaterialIfLocal,
    estimateBase64Bytes,
    saveLearnerCourseMaterialFile,
    buildLessonQuizGenerationContext,
    generateQuizDraftWithOpenAI,
    getQuizGenerationAvailability,
    sanitizeQuizQuestion,
    getLessonQuiz,
    getPublishedOwnedCourseCount,
    getPublishedCourseLimit,
    getSellerConnectState,
    getCourseAccessState,
    isCourseAssignedToActiveGroupMember,
    getCoursePurchaseAccess,
    ratingsService,
    courseStatsService,
    scoreQuizAttempt,
    getCourseDetailsPayload,
    hasIntelectionsPlus,
    syncGroupAssignedCourseEnrollments,
  } = ctx;

  const {
    ensureCourseStorageCapacity,
    refreshCourseStorageStats,
    ensureCourseStatsRow,
  } = courseStatsService;

  const {
    canUserRateCourse,
    getViewerCourseRating,
    upsertCourseRating,
    clearCourseReview,
  } = ratingsService;

  const sendJson = (...args) => {
    baseSendJson(...args);
    return true;
  };

  function parseMultipartJsonPayload(form) {
    try {
      return JSON.parse(form?.fields?.payload || '{}');
    } catch {
      throw new Error('Invalid multipart payload');
    }
  }



  if (req.method === 'POST' && /^\/api\/lessons\/[^/]+\/material-sections$/.test(url.pathname)) {
    const auth = requireAuth(req, res); if (!auth) return true;
    const lessonId = decodeURIComponent(url.pathname.split('/')[3]);
    const body = await readBody(req);
    const lesson = db.prepare(`SELECT l.id, c.id AS courseId, c.author_user_id AS authorUserId FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = ?`).get(lessonId);
    if (!lesson) return sendJson(res, 404, { error: 'Lesson not found' }), true;
    if (lesson.authorUserId !== auth.user.id) return sendJson(res, 403, { error: 'Only the course author can create folders' }), true;
    const title = sanitizeText(body.title);
    const description = sanitizeText(body.description);
    const isPaidContent = Boolean(body.isPaidContent);
    if (!title) return sendJson(res, 400, { error: 'Folder title is required' }), true;
    const nextSortOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxSortOrder FROM lesson_material_sections WHERE lesson_id = ?').get(lessonId).maxSortOrder || 0) + 1;
    const sectionId = slugId('material-section');
    db.prepare('INSERT INTO lesson_material_sections (id, lesson_id, title, description, is_paid_content, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(sectionId, lessonId, title, description, isPaidContent ? 1 : 0, nextSortOrder);
    sendJson(res, 201, { section: { id: sectionId, title, description, isPaidContent, sortOrder: nextSortOrder } });
    return true;
  }

  if (req.method === 'PUT' && /^\/api\/material-sections\/[^/]+$/.test(url.pathname)) {
    const auth = requireAuth(req, res); if (!auth) return true;
    const sectionId = decodeURIComponent(url.pathname.split('/')[3]);
    const body = await readBody(req);
    const section = db.prepare(`SELECT s.id, s.lesson_id AS lessonId, c.author_user_id AS authorUserId FROM lesson_material_sections s JOIN lessons l ON l.id = s.lesson_id JOIN courses c ON c.id = l.course_id WHERE s.id = ?`).get(sectionId);
    if (!section) return sendJson(res, 404, { error: 'Folder not found' }), true;
    if (section.authorUserId !== auth.user.id) return sendJson(res, 403, { error: 'Only the course author can edit folders' }), true;
    const title = sanitizeText(body.title);
    const description = sanitizeText(body.description);
    const isPaidContent = Boolean(body.isPaidContent);
    if (!title) return sendJson(res, 400, { error: 'Folder title is required' }), true;
    db.prepare('UPDATE lesson_material_sections SET title = ?, description = ?, is_paid_content = ? WHERE id = ?').run(title, description, isPaidContent ? 1 : 0, sectionId);
    const updated = db.prepare('SELECT id, title, description, is_paid_content AS isPaidContent, sort_order AS sortOrder FROM lesson_material_sections WHERE id = ?').get(sectionId);
    updated.isPaidContent = Boolean(updated.isPaidContent);
    sendJson(res, 200, { section: updated });
    return true;
  }

  if (req.method === 'POST' && /^\/api\/material-sections\/[^/]+\/remove$/.test(url.pathname)) {
    const auth = requireAuth(req, res); if (!auth) return true;
    const sectionId = decodeURIComponent(url.pathname.split('/')[3]);
    const section = db.prepare(`SELECT s.id, s.lesson_id AS lessonId, c.author_user_id AS authorUserId FROM lesson_material_sections s JOIN lessons l ON l.id = s.lesson_id JOIN courses c ON c.id = l.course_id WHERE s.id = ?`).get(sectionId);
    if (!section) return sendJson(res, 404, { error: 'Folder not found' }), true;
    if (section.authorUserId !== auth.user.id) return sendJson(res, 403, { error: 'Only the course author can remove folders' }), true;
    db.prepare('UPDATE lesson_materials SET section_id = NULL WHERE section_id = ?').run(sectionId);
    db.prepare('DELETE FROM lesson_material_sections WHERE id = ?').run(sectionId);
    sendJson(res, 200, { removed: true });
    return true;
  }

  if (req.method === 'POST' && /^\/api\/lessons\/[^/]+\/materials\/layout$/.test(url.pathname)) {
    const auth = requireAuth(req, res); if (!auth) return true;
    const lessonId = decodeURIComponent(url.pathname.split('/')[3]);
    const body = await readBody(req);
    const lesson = db.prepare(`SELECT l.id, c.id AS courseId, c.author_user_id AS authorUserId FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = ?`).get(lessonId);
    if (!lesson) return sendJson(res, 404, { error: 'Lesson not found' }), true;
    if (lesson.authorUserId !== auth.user.id) return sendJson(res, 403, { error: 'Only the course author can reorder materials' }), true;
    if (!Array.isArray(body.items)) return sendJson(res, 400, { error: 'Items payload is required' }), true;

    const existingIds = new Set(db.prepare('SELECT id FROM lesson_materials WHERE lesson_id = ?').all(lessonId).map(row => row.id));
    const payloadIds = body.items.map(item => String(item?.id || ''));
    if (payloadIds.length !== existingIds.size || payloadIds.some(id => !existingIds.has(id))) {
      return sendJson(res, 400, { error: 'Material layout payload does not match this lesson' }), true;
    }

    const validSectionIds = new Set(db.prepare('SELECT id FROM lesson_material_sections WHERE lesson_id = ?').all(lessonId).map(row => row.id));
    const updateMaterial = db.prepare('UPDATE lesson_materials SET section_id = ?, sort_order = ? WHERE id = ?');
    body.items.forEach((item, index) => {
      const sectionId = item.sectionId == null || item.sectionId === '' ? null : String(item.sectionId);
      if (sectionId && !validSectionIds.has(sectionId)) throw new Error('Invalid folder reference in material layout');
      updateMaterial.run(sectionId, index + 1, String(item.id));
    });
    sendJson(res, 200, { saved: true });
    return true;
  }

  if (req.method === 'POST' && /^\/api\/courses\/[^/]+\/lessons$/.test(url.pathname)) {
    const auth = requireAuth(req, res); if (!auth) return true;
    const courseId = decodeURIComponent(url.pathname.split('/')[3]);
    const body = await readBody(req);
    const courseExists = db.prepare('SELECT 1 FROM courses WHERE id = ?').get(courseId);
    if (!courseExists) return sendJson(res, 404, { error: 'Course not found' }), true;
    const title = sanitizeText(body.title);
    const durationMin = Number(body.durationMin || 0);
    const isFreePreview = Boolean(body.isFreePreview);
    if (!title) return sendJson(res, 400, { error: 'Lesson title is required' }), true;
    if (!Number.isFinite(durationMin) || durationMin <= 0) return sendJson(res, 400, { error: 'Duration must be a positive number' }), true;
    const maxPosition = db.prepare('SELECT COALESCE(MAX(position), 0) AS maxPosition FROM lessons WHERE course_id = ?').get(courseId).maxPosition;
    const lessonId = `lesson-${Date.now()}`;
    db.prepare('INSERT INTO lessons (id, course_id, title, duration_min, is_free_preview, position) VALUES (?, ?, ?, ?, ?, ?)').run(lessonId, courseId, title, Math.round(durationMin), isFreePreview ? 1 : 0, Number(maxPosition) + 1);
    sendJson(res, 201, { id: lessonId, title, durationMin: Math.round(durationMin), isFreePreview, materials: [] });
    return true;
  }

  if (req.method === 'PUT' && /^\/api\/lessons\/[^/]+$/.test(url.pathname)) {
    const auth = requireAuth(req, res); if (!auth) return true;
    const lessonId = decodeURIComponent(url.pathname.split('/')[3]);
    const body = await readBody(req);
    const lesson = db.prepare(`SELECT l.id, l.course_id AS courseId, l.title, l.duration_min AS durationMin, l.is_free_preview AS isFreePreview, c.author_user_id AS authorUserId FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = ?`).get(lessonId);
    if (!lesson) return sendJson(res, 404, { error: 'Lesson not found' }), true;
    if (lesson.authorUserId !== auth.user.id) return sendJson(res, 403, { error: 'Only the course author can edit lessons' }), true;
    const title = sanitizeText(body.title);
    const durationMin = Number(body.durationMin || 0);
    const isFreePreview = Boolean(body.isFreePreview);
    if (!title) return sendJson(res, 400, { error: 'Lesson title is required' }), true;
    if (!Number.isFinite(durationMin) || durationMin <= 0) return sendJson(res, 400, { error: 'Duration must be a positive number' }), true;
    db.prepare('UPDATE lessons SET title = ?, duration_min = ?, is_free_preview = ? WHERE id = ?').run(title, Math.round(durationMin), isFreePreview ? 1 : 0, lessonId);
    sendJson(res, 200, { lesson: { id: lessonId, courseId: lesson.courseId, title, durationMin: Math.round(durationMin), isFreePreview } });
    return true;
  }

  if (req.method === 'POST' && /^\/api\/courses\/[^/]+\/learner-materials$/.test(url.pathname)) {
    const auth = requireAuth(req, res); if (!auth) return true;
    const courseId = decodeURIComponent(url.pathname.split('/')[3]);
    syncGroupAssignedCourseEnrollments(auth.user.id);
    const body = await readBody(req, 30_000_000);
    const course = db.prepare('SELECT id, author_user_id AS authorUserId, allow_learner_uploads AS allowLearnerUploads FROM courses WHERE id = ?').get(courseId);
    if (!course) return sendJson(res, 404, { error: 'Course not found' }), true;
    if (course.authorUserId === auth.user.id) return sendJson(res, 400, { error: 'Course owner does not upload learner materials here' }), true;
    if (!course.allowLearnerUploads) return sendJson(res, 403, { error: 'Learner uploads are not enabled for this course' }), true;
    if (!hasIntelectionsPlus(auth.user)) return sendJson(res, 403, { error: 'Learner uploads are part of InteLections+' }), true;
    const enrollment = db.prepare('SELECT 1 FROM course_enrollments WHERE course_id = ? AND user_id = ? AND status = ?').get(courseId, auth.user.id, 'active');
    if (!enrollment) return sendJson(res, 403, { error: 'Join the course before uploading learner materials' }), true;
    if (!body.file || typeof body.file !== 'object') return sendJson(res, 400, { error: 'Choose a file to upload' }), true;

    ensureCourseStorageCapacity(courseId, estimateBase64Bytes(body.file.base64Data));
    const saved = saveLearnerCourseMaterialFile(courseId, auth.user.id, { ...body.file, title: body.title, description: body.description });
    db.prepare(`INSERT INTO course_learner_materials (id, course_id, user_id, title, description, file_path, original_name, mime_type, file_size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(saved.id, courseId, auth.user.id, saved.title, saved.description, saved.filePath, saved.originalName, saved.mimeType, saved.fileSizeBytes);
    sendJson(res, 201, { material: { ...saved, uploadedAt: new Date().toISOString(), uploadedById: auth.user.id, uploadedByName: [auth.user.firstName, auth.user.lastName].filter(Boolean).join(' ') || 'Learner' } });
    return true;
  }

  if (req.method === 'POST' && /^\/api\/courses\/[^/]+\/publish$/.test(url.pathname)) {
    const auth = requireAuth(req, res); if (!auth) return true;
    const courseId = decodeURIComponent(url.pathname.split('/')[3]);
    const owned = db.prepare(`SELECT id, publish_status AS publishStatus, visibility, access_type AS accessType, author_user_id AS authorUserId, publish_blocked AS publishBlocked, publish_block_message AS publishBlockMessage FROM courses WHERE id = ? AND author_user_id = ?`).get(courseId, auth.user.id);
    if (!owned) return sendJson(res, 404, { error: 'Course not found or access denied' }), true;
    if (owned.publishStatus === 'published') return sendJson(res, 200, { published: true }), true;
    if (Boolean(owned.publishBlocked)) return sendJson(res, 403, { error: sanitizeText(owned.publishBlockMessage) || 'Publishing this course was blocked by Admin.' }), true;
    if (getPublishedOwnedCourseCount(auth.user.id) >= getPublishedCourseLimit(auth.user)) {
      return sendJson(res, 403, { error: `Your current plan allows up to ${getPublishedCourseLimit(auth.user)} published courses. Upgrade to InteLections+ to publish more.` }), true;
    }
    if (owned.accessType === 'paid' && !getSellerConnectState(auth.user.id).sellerBillingReady) {
      return sendJson(res, 403, { error: 'Connect Stripe payouts in Account before publishing a paid course.' }), true;
    }
    db.prepare(`UPDATE courses SET publish_status = 'published' WHERE id = ? AND author_user_id = ?`).run(courseId, auth.user.id);
    sendJson(res, 200, { published: true });
    return true;
  }

  if (req.method === 'POST' && /^\/api\/courses\/[^/]+\/unpublish$/.test(url.pathname)) {
    const auth = requireAuth(req, res); if (!auth) return true;
    const courseId = decodeURIComponent(url.pathname.split('/')[3]);
    const owned = db.prepare(`SELECT id, publish_status AS publishStatus FROM courses WHERE id = ? AND author_user_id = ?`).get(courseId, auth.user.id);
    if (!owned) return sendJson(res, 404, { error: 'Course not found or access denied' }), true;
    if (owned.publishStatus !== 'published') return sendJson(res, 200, { unpublished: true }), true;
    db.prepare(`UPDATE courses SET publish_status = 'draft' WHERE id = ? AND author_user_id = ?`).run(courseId, auth.user.id);
    sendJson(res, 200, { unpublished: true });
    return true;
  }

    if (req.method === 'POST' && /^\/api\/lessons\/[^/]+\/materials$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const lessonId = decodeURIComponent(url.pathname.split('/')[3]);
      const contentType = String(req.headers['content-type'] || '');
      const multipartUpload = contentType.startsWith('multipart/form-data');
      const form = multipartUpload ? await readMultipartForm(req, 320_000_000) : null;
      const body = multipartUpload
        ? (() => {
            try {
              return JSON.parse(form?.fields?.payload || '{}');
            } catch {
              throw new Error('Invalid multipart payload');
            }
          })()
        : await readBody(req, 30_000_000);
      const uploadedFiles = form?.files || {};
      const lesson = db.prepare(`
        SELECT l.id, c.id AS courseId, c.author_user_id AS authorUserId
        FROM lessons l
        JOIN courses c ON c.id = l.course_id
        WHERE l.id = ?
      `).get(lessonId);

      if (!lesson) return sendJson(res, 404, { error: 'Lesson not found' });
      if (lesson.authorUserId !== auth.user.id) {
        return sendJson(res, 403, { error: 'Only the course author can add materials' });
      }
      if (!Array.isArray(body.materials) || body.materials.length === 0) {
        return sendJson(res, 400, { error: 'Add at least one file or YouTube video' });
      }

      const insertMaterial = db.prepare(`
        INSERT INTO lesson_materials (id, lesson_id, title, material_kind, file_path, external_url, original_name, description, mime_type, file_size_bytes, video_duration_seconds, section_id, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let nextSortOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxSortOrder FROM lesson_materials WHERE lesson_id = ?').get(lessonId).maxSortOrder || 0);
      const validSectionIds = new Set(db.prepare('SELECT id FROM lesson_material_sections WHERE lesson_id = ?').all(lessonId).map(row => row.id));

      const materialsPayload = body.materials;
      const incomingBytes = materialsPayload.reduce((sum, item) => {
        if (item?.youtubeUrl) return sum;
        if (item?.fileField && uploadedFiles[item.fileField]?.buffer) {
          return sum + uploadedFiles[item.fileField].buffer.length;
        }
        return sum + estimateBase64Bytes(item?.base64Data);
      }, 0);
      ensureCourseStorageCapacity(lesson.courseId, incomingBytes);

      const savedMaterials = materialsPayload.map(item => {
        const sectionId = item?.sectionId == null || item?.sectionId === '' ? null : String(item.sectionId);
        if (sectionId && !validSectionIds.has(sectionId)) {
          throw new Error('Invalid folder selected for uploaded material');
        }

        let normalizedItem = item;
        if (!item?.youtubeUrl && item?.fileField) {
          const uploadedFile = uploadedFiles[item.fileField];
          if (!uploadedFile) {
            throw new Error('Uploaded file is missing from the request');
          }
          normalizedItem = {
            ...item,
            originalName: uploadedFile.originalName || item.originalName,
            mimeType: uploadedFile.mimeType || item.mimeType,
            buffer: uploadedFile.buffer,
          };
        }

        if (!normalizedItem?.youtubeUrl) {
          const itemKind = materialKindFromNameOrMime(normalizedItem?.originalName, normalizedItem?.mimeType);
          if (itemKind === 'video') {
            const videoDurationSeconds = Math.round(Number(normalizedItem?.videoDurationSeconds || 0));
            if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
              throw new Error('We could not read the video duration. Please reselect the file and try again.');
            }
            if (videoDurationSeconds > getHostedVideoLimitSeconds(auth.user)) {
              throw new Error(`Hosted lesson videos must be ${Math.round(getHostedVideoLimitSeconds(auth.user) / 60)} minutes or shorter for your current plan.`);
            }
          }
        }

        const saved = normalizedItem?.youtubeUrl ? createYouTubeMaterial(normalizedItem) : saveLessonMaterialFile(lessonId, normalizedItem);
        nextSortOrder += 1;
        insertMaterial.run(
          saved.id,
          lessonId,
          saved.title,
          saved.materialKind,
          saved.filePath,
          saved.externalUrl ?? '',
          saved.originalName,
          saved.description,
          saved.mimeType,
          saved.fileSizeBytes,
          saved.videoDurationSeconds ?? null,
          sectionId,
          nextSortOrder,
        );
        return { ...saved, sectionId, sortOrder: nextSortOrder };
      });

      refreshCourseStorageStats(lesson.courseId);

      return sendJson(res, 201, { materials: savedMaterials });
    }

    if (req.method === 'PUT' && /^\/api\/materials\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const materialId = decodeURIComponent(url.pathname.split('/')[3]);
      const contentType = String(req.headers['content-type'] || '');
      const multipartUpload = contentType.startsWith('multipart/form-data');
      const form = multipartUpload ? await readMultipartForm(req, 320_000_000) : null;
      const body = multipartUpload
        ? (() => {
            try {
              return JSON.parse(form?.fields?.payload || '{}');
            } catch {
              throw new Error('Invalid multipart payload');
            }
          })()
        : await readBody(req);
      const uploadedFiles = form?.files || {};
      const material = db.prepare(`
        SELECT m.id, m.file_path AS filePath, m.external_url AS externalUrl, m.material_kind AS materialKind, m.original_name AS originalName, m.section_id AS sectionId, m.sort_order AS sortOrder, m.file_size_bytes AS fileSizeBytes, m.video_duration_seconds AS videoDurationSeconds, l.id AS lessonId, c.id AS courseId, c.author_user_id AS authorUserId
        FROM lesson_materials m
        JOIN lessons l ON l.id = m.lesson_id
        JOIN courses c ON c.id = l.course_id
        WHERE m.id = ?
      `).get(materialId);

      if (!material) return sendJson(res, 404, { error: 'Material not found' });
      if (material.authorUserId !== auth.user.id) {
        return sendJson(res, 403, { error: 'Only the course author can edit materials' });
      }

      const title = sanitizeText(body.title);
      const description = sanitizeText(body.description);
      if (!title) return sendJson(res, 400, { error: 'Material title is required' });

      const nextSectionId = body.sectionId == null || body.sectionId === '' ? null : String(body.sectionId);
      if (nextSectionId) {
        const sectionExists = db.prepare('SELECT 1 FROM lesson_material_sections WHERE id = ? AND lesson_id = ?').get(nextSectionId, material.lessonId);
        if (!sectionExists) {
          return sendJson(res, 400, { error: 'Folder not found for this lesson' });
        }
      }

      const youtubeUrl = sanitizeText(body.youtubeUrl);
      const replacementFilePayload = body.replacementFile?.fileField
        ? (() => {
            const uploadedFile = uploadedFiles[body.replacementFile.fileField];
            if (!uploadedFile) {
              throw new Error('Replacement file is missing from the request');
            }
            return {
              ...body.replacementFile,
              originalName: uploadedFile.originalName || body.replacementFile.originalName,
              mimeType: uploadedFile.mimeType || body.replacementFile.mimeType,
              buffer: uploadedFile.buffer,
            };
          })()
        : body.replacementFile;
      if (replacementFilePayload) {
        const replacementKind = materialKindFromNameOrMime(replacementFilePayload.originalName, replacementFilePayload.mimeType);
        if (replacementKind === 'video') {
          const videoDurationSeconds = Math.round(Number(replacementFilePayload.videoDurationSeconds || 0));
          if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
            return sendJson(res, 400, { error: 'We could not read the video duration. Please reselect the file and try again.' });
          }
          if (videoDurationSeconds > getHostedVideoLimitSeconds(auth.user)) {
            return sendJson(res, 400, { error: `Hosted lesson videos must be ${Math.round(getHostedVideoLimitSeconds(auth.user) / 60)} minutes or shorter for your current plan.` });
          }
        }
      }
      if (replacementFilePayload) {
        const incomingReplacementBytes = replacementFilePayload.buffer
          ? replacementFilePayload.buffer.length
          : estimateBase64Bytes(replacementFilePayload.base64Data);
        ensureCourseStorageCapacity(material.courseId, incomingReplacementBytes, material.fileSizeBytes);
      }

      const replacement = material.materialKind === 'youtube'
        ? (youtubeUrl ? createYouTubeMaterial({ title, description, youtubeUrl }) : null)
        : replaceLessonMaterialFile(material, replacementFilePayload);

      if (material.materialKind === 'youtube' && !replacement) {
        return sendJson(res, 400, { error: 'Enter a valid YouTube video link' });
      }

      db.prepare(`
        UPDATE lesson_materials
        SET title = ?, description = ?, section_id = ?,
            material_kind = COALESCE(?, material_kind),
            file_path = COALESCE(?, file_path),
            external_url = COALESCE(?, external_url),
            original_name = COALESCE(?, original_name),
            mime_type = COALESCE(?, mime_type),
            file_size_bytes = COALESCE(?, file_size_bytes),
            video_duration_seconds = ?
        WHERE id = ?
      `).run(
        title,
        description,
        nextSectionId,
        replacement?.materialKind ?? null,
        replacement?.filePath ?? null,
        replacement?.externalUrl ?? null,
        replacement?.originalName ?? null,
        replacement?.mimeType ?? null,
        replacement?.fileSizeBytes ?? null,
        replacement ? (replacement.videoDurationSeconds ?? null) : (material.videoDurationSeconds ?? null),
        materialId,
      );

      if (replacement?.filePath && material.materialKind !== 'youtube') {
        removeStoredMaterialIfLocal(material.filePath);
      }
      refreshCourseStorageStats(material.courseId);

      const updated = db.prepare(`
        SELECT id, title, material_kind AS materialKind, file_path AS filePath,
               external_url AS externalUrl, original_name AS originalName, description, mime_type AS mimeType, file_size_bytes AS fileSizeBytes, section_id AS sectionId, sort_order AS sortOrder
        FROM lesson_materials
        WHERE id = ?
      `).get(materialId);

      return sendJson(res, 200, { material: updated });
    }

    if (req.method === 'POST' && /^\/api\/materials\/[^/]+\/reorder$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const materialId = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const direction = sanitizeText(body.direction).toLowerCase();
      if (!['up', 'down'].includes(direction)) {
        return sendJson(res, 400, { error: 'Invalid reorder direction' });
      }

      const material = db.prepare(`
        SELECT m.id, m.lesson_id AS lessonId, m.sort_order AS sortOrder, c.author_user_id AS authorUserId
        FROM lesson_materials m
        JOIN lessons l ON l.id = m.lesson_id
        JOIN courses c ON c.id = l.course_id
        WHERE m.id = ?
      `).get(materialId);

      if (!material) return sendJson(res, 404, { error: 'Material not found' });
      if (material.authorUserId !== auth.user.id) {
        return sendJson(res, 403, { error: 'Only the course author can reorder materials' });
      }

      const target = direction === 'up'
        ? db.prepare(`SELECT id, sort_order AS sortOrder FROM lesson_materials WHERE lesson_id = ? AND sort_order < ? ORDER BY sort_order DESC LIMIT 1`).get(material.lessonId, material.sortOrder)
        : db.prepare(`SELECT id, sort_order AS sortOrder FROM lesson_materials WHERE lesson_id = ? AND sort_order > ? ORDER BY sort_order ASC LIMIT 1`).get(material.lessonId, material.sortOrder);

      if (!target) return sendJson(res, 200, { moved: false });

      db.prepare('UPDATE lesson_materials SET sort_order = ? WHERE id = ?').run(target.sortOrder, material.id);
      db.prepare('UPDATE lesson_materials SET sort_order = ? WHERE id = ?').run(material.sortOrder, target.id);
      return sendJson(res, 200, { moved: true });
    }

    if (req.method === 'POST' && /^\/api\/materials\/[^/]+\/remove$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const materialId = decodeURIComponent(url.pathname.split('/')[3]);
      const material = db.prepare(`
        SELECT m.id, m.file_path AS filePath, c.id AS courseId, c.author_user_id AS authorUserId
        FROM lesson_materials m
        JOIN lessons l ON l.id = m.lesson_id
        JOIN courses c ON c.id = l.course_id
        WHERE m.id = ?
      `).get(materialId);

      if (!material) return sendJson(res, 404, { error: 'Material not found' });
      if (material.authorUserId !== auth.user.id) {
        return sendJson(res, 403, { error: 'Only the course author can remove materials' });
      }

      db.prepare('DELETE FROM lesson_materials WHERE id = ?').run(materialId);
      removeStoredMaterialIfLocal(material.filePath);
      refreshCourseStorageStats(material.courseId);
      return sendJson(res, 200, { removed: true });
    }

    if (req.method === 'POST' && /^\/api\/lessons\/[^/]+\/quiz\/generate$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const lessonId = decodeURIComponent(url.pathname.split('/')[3]);
      const availability = getQuizGenerationAvailability(auth.user);
      if (!availability.available) {
        return sendJson(res, OPENAI_API_KEY ? 403 : 503, { error: availability.reason || 'AI quiz generation is not configured' });
      }

      const body = await readBody(req);
      const lesson = db.prepare(`
        SELECT l.id, c.author_user_id AS authorUserId
        FROM lessons l
        JOIN courses c ON c.id = l.course_id
        WHERE l.id = ?
      `).get(lessonId);

      if (!lesson) return sendJson(res, 404, { error: 'Lesson not found' });
      if (lesson.authorUserId !== auth.user.id) {
        return sendJson(res, 403, { error: 'Only the course author can generate tests with AI' });
      }

      const context = buildLessonQuizGenerationContext(lessonId);
      if (!context) {
        return sendJson(res, 404, { error: 'Lesson not found' });
      }

      try {
        const draft = await generateQuizDraftWithOpenAI(context, body, auth.user.id);
        return sendJson(res, 200, { draft });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not generate test draft';
        return sendJson(res, 502, { error: message });
      }
    }

    if (req.method === 'POST' && /^\/api\/lessons\/[^/]+\/quiz$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const lessonId = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const lesson = db.prepare(`
        SELECT l.id, c.id AS courseId, c.author_user_id AS authorUserId
        FROM lessons l
        JOIN courses c ON c.id = l.course_id
        WHERE l.id = ?
      `).get(lessonId);

      if (!lesson) return sendJson(res, 404, { error: 'Lesson not found' });
      if (lesson.authorUserId !== auth.user.id) {
        return sendJson(res, 403, { error: 'Only the course author can build tests' });
      }

      const title = sanitizeText(body.title);
      const description = sanitizeText(body.description);
      const passingScore = Number(body.passingScore);
      const timeLimitMin = body.timeLimitMin == null || body.timeLimitMin === '' ? null : Number(body.timeLimitMin);
      const maxAttempts = body.maxAttempts == null || body.maxAttempts === '' ? null : Number(body.maxAttempts);
      const accessScope = sanitizeText(body.accessScope) === 'group' ? 'group' : 'course';
      const accessGroupId = sanitizeText(body.accessGroupId) || null;
      const availableFrom = sanitizeText(body.availableFrom) || null;
      const availableTo = sanitizeText(body.availableTo) || null;
      const questions = Array.isArray(body.questions)
        ? body.questions.map((item, index) => sanitizeQuizQuestion(item, index)).filter(question => question.prompt)
        : [];

      if (!title) return sendJson(res, 400, { error: 'Test title is required' });
      if (!Number.isInteger(passingScore) || passingScore < 1 || passingScore > 100) {
        return sendJson(res, 400, { error: 'Passing score must be between 1 and 100' });
      }
      if (timeLimitMin != null && (!Number.isInteger(timeLimitMin) || timeLimitMin <= 0)) {
        return sendJson(res, 400, { error: 'Time limit must be a positive number' });
      }
      if (maxAttempts != null && (!Number.isInteger(maxAttempts) || maxAttempts <= 0)) {
        return sendJson(res, 400, { error: 'Attempts limit must be a positive number or left empty for unlimited' });
      }
      if (availableFrom && Number.isNaN(Date.parse(availableFrom))) {
        return sendJson(res, 400, { error: 'Availability start time is invalid' });
      }
      if (availableTo && Number.isNaN(Date.parse(availableTo))) {
        return sendJson(res, 400, { error: 'Availability end time is invalid' });
      }
      if (availableFrom && availableTo && Date.parse(availableTo) <= Date.parse(availableFrom)) {
        return sendJson(res, 400, { error: 'Availability end time must be later than the start time' });
      }
      if (accessScope === 'group' && !accessGroupId) {
        return sendJson(res, 400, { error: 'Choose a group when test access is limited to a group' });
      }
      if (questions.length === 0) {
        return sendJson(res, 400, { error: 'Add at least one question' });
      }

      if (accessScope === 'group') {
        const group = db.prepare(`
          SELECT id
          FROM learning_groups
          WHERE id = ? AND owner_user_id = ?
        `).get(accessGroupId, auth.user.id);
        if (!group) {
          return sendJson(res, 400, { error: 'Selected group does not belong to you' });
        }
      }

      for (const question of questions) {
        if (!question.prompt) {
          return sendJson(res, 400, { error: 'Each question needs a prompt' });
        }
        if (question.questionType === 'open-answer') {
          if (!question.acceptedAnswer) {
            return sendJson(res, 400, { error: 'Open-answer questions need an accepted answer' });
          }
          continue;
        }
        if (question.questionType === 'true-false') {
          if (question.options.length !== 2) {
            return sendJson(res, 400, { error: 'True/false questions must contain exactly two answers' });
          }
          if (!question.options.some(option => option.isCorrect)) {
            return sendJson(res, 400, { error: 'True/false questions must mark the correct answer' });
          }
          continue;
        }
        if (question.options.length < 2) {
          return sendJson(res, 400, { error: 'Choice questions must have at least two answer options' });
        }
        if (!question.options.some(option => option.isCorrect)) {
          return sendJson(res, 400, { error: 'Choice questions must have at least one correct answer' });
        }
        if (question.questionType === 'single-choice' && question.options.filter(option => option.isCorrect).length !== 1) {
          return sendJson(res, 400, { error: 'Single-choice questions must have exactly one correct answer' });
        }
      }

      const existingQuiz = db.prepare('SELECT id FROM lesson_quizzes WHERE lesson_id = ?').get(lessonId);
      if (existingQuiz) {
        db.prepare('DELETE FROM lesson_quizzes WHERE id = ?').run(existingQuiz.id);
      }

      const quizId = slugId('quiz');
      db.prepare(`
        INSERT INTO lesson_quizzes (id, lesson_id, title, description, passing_score, time_limit_min, max_attempts, access_scope, access_group_id, available_from, available_to)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        quizId,
        lessonId,
        title,
        description,
        Math.round(passingScore),
        timeLimitMin == null ? null : Math.round(timeLimitMin),
        maxAttempts == null ? null : Math.round(maxAttempts),
        accessScope,
        accessScope === 'group' ? accessGroupId : null,
        availableFrom,
        availableTo,
      );

      const insertQuestion = db.prepare(`
        INSERT INTO lesson_quiz_questions (id, quiz_id, prompt, question_type, accepted_answer, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertOption = db.prepare(`
        INSERT INTO lesson_quiz_options (id, question_id, option_text, is_correct, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const question of questions) {
        insertQuestion.run(question.id, quizId, question.prompt, question.questionType, question.acceptedAnswer || '', question.sortOrder);
        for (const option of question.options) {
          insertOption.run(option.id, question.id, option.text, option.isCorrect ? 1 : 0, option.sortOrder);
        }
      }

      return sendJson(res, 201, { quiz: getLessonQuiz(lessonId) });
    }

    if (req.method === 'POST' && /^\/api\/courses\/[^/]+\/publish$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      const owned = db.prepare(`
        SELECT id, publish_status AS publishStatus, visibility, access_type AS accessType, author_user_id AS authorUserId,
               publish_blocked AS publishBlocked, publish_block_message AS publishBlockMessage
        FROM courses
        WHERE id = ? AND author_user_id = ?
      `).get(courseId, auth.user.id);
      if (!owned) return sendJson(res, 404, { error: 'Course not found or access denied' });
      if (owned.publishStatus === 'published') {
        return sendJson(res, 200, { published: true });
      }
      if (Boolean(owned.publishBlocked)) {
        return sendJson(res, 403, { error: sanitizeText(owned.publishBlockMessage) || 'Publishing this course was blocked by Admin.' });
      }
      if (getPublishedOwnedCourseCount(auth.user.id) >= getPublishedCourseLimit(auth.user)) {
        return sendJson(res, 403, { error: `Your current plan allows up to ${getPublishedCourseLimit(auth.user)} published courses. Upgrade to InteLections+ to publish more.` });
      }
      if (owned.accessType === 'paid' && !getSellerConnectState(auth.user.id).sellerBillingReady) {
        return sendJson(res, 403, { error: 'Connect Stripe payouts in Account before publishing a paid course.' });
      }

      db.prepare(`
        UPDATE courses
        SET publish_status = 'published'
        WHERE id = ? AND author_user_id = ?
      `).run(courseId, auth.user.id);

      return sendJson(res, 200, { published: true });
    }

    if (req.method === 'POST' && /^\/api\/courses\/[^/]+\/unpublish$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      const owned = db.prepare(`
        SELECT id, publish_status AS publishStatus
        FROM courses
        WHERE id = ? AND author_user_id = ?
      `).get(courseId, auth.user.id);
      if (!owned) return sendJson(res, 404, { error: 'Course not found or access denied' });
      if (owned.publishStatus !== 'published') {
        return sendJson(res, 200, { unpublished: true });
      }

      db.prepare(`
        UPDATE courses
        SET publish_status = 'draft'
        WHERE id = ? AND author_user_id = ?
      `).run(courseId, auth.user.id);

      return sendJson(res, 200, { unpublished: true });
    }

    if (req.method === 'POST' && /^\/api\/courses\/[^/]+\/enroll$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      const course = db.prepare(`
        SELECT id, publish_status AS publishStatus, author_user_id AS authorUserId, access_type AS accessType, visibility
        FROM courses
        WHERE id = ?
      `).get(courseId);

      if (!course) return sendJson(res, 404, { error: 'Course not found' });
      ensureCourseStatsRow(courseId);
      const accessState = getCourseAccessState(course, auth.user);
      if (!accessState.isPublished && !accessState.isOwner) {
        return sendJson(res, 403, { error: 'Only published courses can be joined' });
      }
      if (!accessState.isOwner && accessState.accessMode === 'class-only') {
        return sendJson(res, 403, { error: 'This course is available only through assigned classes' });
      }
      if (!accessState.isOwner && accessState.accessMode === 'public-paid') {
        return sendJson(res, 403, { error: 'This paid course requires checkout before you can join it publicly' });
      }

      db.prepare(`
        INSERT INTO course_enrollments (id, course_id, user_id, status)
        VALUES (?, ?, ?, 'active')
        ON CONFLICT(course_id, user_id) DO UPDATE SET status = 'active'
      `).run(slugId('enrollment'), courseId, auth.user.id);

      db.prepare(`
        INSERT OR IGNORE INTO saved_courses (user_id, course_id)
        VALUES (?, ?)
      `).run(auth.user.id, courseId);

      db.prepare(`
        UPDATE course_stats
        SET students = (
          SELECT COUNT(*) FROM course_enrollments WHERE course_id = ? AND status = 'active'
        )
        WHERE course_id = ?
      `).run(courseId, courseId);

      return sendJson(res, 200, { enrolled: true, saved: true });
    }

    if (req.method === 'POST' && /^\/api\/courses\/[^/]+\/review$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const title = sanitizeText(body.title);
      const reviewText = sanitizeText(body.text);
      const course = db.prepare(`
        SELECT id, publish_status AS publishStatus, author_user_id AS authorUserId
        FROM courses
        WHERE id = ?
      `).get(courseId);

      if (!course) return sendJson(res, 404, { error: 'Course not found' });
      if (!title && !reviewText) {
        return sendJson(res, 400, { error: 'Write at least a title or review text' });
      }

      syncGroupAssignedCourseEnrollments(auth.user.id);
      ensureCourseStatsRow(courseId);

      const enrollment = db.prepare(`
        SELECT id, status
        FROM course_enrollments
        WHERE course_id = ? AND user_id = ? AND status = 'active'
      `).get(courseId, auth.user.id);
      const hasClassAccess = isCourseAssignedToActiveGroupMember(courseId, auth.user.id);
      const hasPaidAccess = Boolean(getCoursePurchaseAccess(auth.user, courseId));

      if (auth.user.id === course.authorUserId) {
        return sendJson(res, 403, { error: 'Course owners cannot review their own course' });
      }
      if (!canUserRateCourse(course, auth.user.id, enrollment, hasClassAccess, hasPaidAccess)) {
        return sendJson(res, 403, { error: 'Enroll in the course before leaving a review' });
      }
      if (course.publishStatus !== 'published' && !hasClassAccess && !hasPaidAccess) {
        return sendJson(res, 403, { error: 'This course is not available for review yet' });
      }

      const currentStars = getViewerCourseRating(courseId, auth.user.id);
      const stars = body.stars == null || body.stars === '' ? currentStars : Number(body.stars);
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
        return sendJson(res, 400, { error: 'Choose a star rating between 1 and 5 before saving the review' });
      }

      return sendJson(res, 200, upsertCourseRating(courseId, auth.user.id, stars, {
        reviewTitle: title,
        reviewText,
      }, ensureCourseStatsRow));
    }

    if (req.method === 'DELETE' && /^\/api\/courses\/[^/]+\/review$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      const course = db.prepare(`
        SELECT id, author_user_id AS authorUserId
        FROM courses
        WHERE id = ?
      `).get(courseId);

      if (!course) return sendJson(res, 404, { error: 'Course not found' });

      syncGroupAssignedCourseEnrollments(auth.user.id);
      ensureCourseStatsRow(courseId);

      const enrollment = db.prepare(`
        SELECT id, status
        FROM course_enrollments
        WHERE course_id = ? AND user_id = ? AND status = 'active'
      `).get(courseId, auth.user.id);
      const hasClassAccess = isCourseAssignedToActiveGroupMember(courseId, auth.user.id);
      const hasPaidAccess = Boolean(getCoursePurchaseAccess(auth.user, courseId));
      const existing = db.prepare(`
        SELECT 1
        FROM course_ratings
        WHERE course_id = ? AND user_id = ?
          AND (COALESCE(review_title, '') <> '' OR COALESCE(review_text, '') <> '')
      `).get(courseId, auth.user.id);

      if (auth.user.id === course.authorUserId) {
        return sendJson(res, 403, { error: 'Course owners cannot review their own course' });
      }
      if (!canUserRateCourse(course, auth.user.id, enrollment, hasClassAccess, hasPaidAccess)) {
        return sendJson(res, 403, { error: 'Enroll in the course before managing a review' });
      }
      if (!existing) {
        return sendJson(res, 404, { error: 'No written review to delete' });
      }

      return sendJson(res, 200, clearCourseReview(courseId, auth.user.id, ensureCourseStatsRow));
    }

    if (req.method === 'POST' && /^\/api\/courses\/[^/]+\/rating$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const stars = Number(body.stars);
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
        return sendJson(res, 400, { error: 'Choose a star rating between 1 and 5' });
      }

      const course = db.prepare(`
        SELECT id, author_user_id AS authorUserId, publish_status AS publishStatus
        FROM courses
        WHERE id = ?
      `).get(courseId);

      if (!course) return sendJson(res, 404, { error: 'Course not found' });

      syncGroupAssignedCourseEnrollments(auth.user.id);
      ensureCourseStatsRow(courseId);

      const enrollment = db.prepare(`
        SELECT id, status
        FROM course_enrollments
        WHERE course_id = ? AND user_id = ? AND status = 'active'
      `).get(courseId, auth.user.id);
      const hasClassAccess = isCourseAssignedToActiveGroupMember(courseId, auth.user.id);
      const hasPaidAccess = Boolean(getCoursePurchaseAccess(auth.user, courseId));

      if (auth.user.id === course.authorUserId) {
        return sendJson(res, 403, { error: 'Course owners cannot rate their own course' });
      }
      if (!canUserRateCourse(course, auth.user.id, enrollment, hasClassAccess, hasPaidAccess)) {
        return sendJson(res, 403, { error: 'Enroll in the course before leaving a rating' });
      }
      if (course.publishStatus !== 'published' && !hasClassAccess && !hasPaidAccess) {
        return sendJson(res, 403, { error: 'This course is not available for rating yet' });
      }

      return sendJson(res, 200, upsertCourseRating(courseId, auth.user.id, stars, {}, ensureCourseStatsRow));
    }

    if (req.method === 'POST' && /^\/api\/quizzes\/[^/]+\/attempts$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return true;

      const quizId = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);
      const quiz = db.prepare(`
        SELECT q.id, q.title, q.passing_score AS passingScore, l.id AS lessonId,
               c.id AS courseId, c.publish_status AS publishStatus, c.author_user_id AS authorUserId
        FROM lesson_quizzes q
        JOIN lessons l ON l.id = q.lesson_id
        JOIN courses c ON c.id = l.course_id
        WHERE q.id = ?
      `).get(quizId);

      if (!quiz) return sendJson(res, 404, { error: 'Quiz not found' });

      syncGroupAssignedCourseEnrollments(auth.user.id);

      const isEnrolled = db.prepare(`
        SELECT 1 FROM course_enrollments WHERE course_id = ? AND user_id = ? AND status = 'active'
      `).get(quiz.courseId, auth.user.id);
      const hasClassAccess = isCourseAssignedToActiveGroupMember(quiz.courseId, auth.user.id);
      const hasPaidAccess = Boolean(getCoursePurchaseAccess(auth.user, quiz.courseId));

      if (!isEnrolled && !hasClassAccess && !hasPaidAccess && quiz.authorUserId !== auth.user.id) {
        return sendJson(res, 403, { error: 'Enroll in the course before solving this test' });
      }
      if (quiz.publishStatus !== 'published' && quiz.authorUserId !== auth.user.id && !hasClassAccess && !hasPaidAccess) {
        return sendJson(res, 403, { error: 'This course is not published yet' });
      }

      const fullQuiz = getLessonQuiz(quiz.lessonId, auth.user.id);
      if (!fullQuiz) return sendJson(res, 404, { error: 'Quiz not found' });
      if (!fullQuiz.canAttempt && quiz.authorUserId !== auth.user.id) {
        if (fullQuiz.availabilityStatus === 'closed') {
          return sendJson(res, 403, { error: 'This test is no longer available' });
        }
        if (fullQuiz.availabilityStatus === 'scheduled') {
          return sendJson(res, 403, { error: 'This test is not open yet' });
        }
        return sendJson(res, 403, { error: 'This test is available only to the selected group' });
      }
      if (fullQuiz.maxAttempts != null && (fullQuiz.attemptsUsed ?? 0) >= fullQuiz.maxAttempts) {
        return sendJson(res, 403, { error: 'You have used all available attempts for this test' });
      }

      const scoring = scoreQuizAttempt(fullQuiz, body.answers);
      const attemptId = slugId('attempt');

      db.prepare(`
        INSERT INTO quiz_attempts (id, quiz_id, user_id, score_percent, passed, total_questions, correct_answers)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(attemptId, quizId, auth.user.id, scoring.scorePercent, scoring.passed ? 1 : 0, scoring.totalQuestions, scoring.correctAnswers);

      const insertAnswer = db.prepare(`
        INSERT INTO quiz_attempt_answers (id, attempt_id, question_id, answer_text, selected_option_ids, is_correct)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const result of scoring.results) {
        insertAnswer.run(
          slugId('attempt-answer'),
          attemptId,
          result.questionId,
          result.answerText,
          result.selectedOptionIds.join(','),
          result.isCorrect ? 1 : 0,
        );
      }

      return sendJson(res, 201, {
        attempt: {
          id: attemptId,
          scorePercent: scoring.scorePercent,
          passed: scoring.passed,
          totalQuestions: scoring.totalQuestions,
          correctAnswers: scoring.correctAnswers,
        },
      });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/courses/')) {
      const courseId = decodeURIComponent(url.pathname.replace('/api/courses/', ''));
      const payload = getCourseDetailsPayload(courseId, authUserOrNull(req)?.user.id || null);
      if (!payload) return sendJson(res, 404, { error: 'Course not found' });
      sendJson(res, 200, payload);
      return true;
    }

  return false;
}
