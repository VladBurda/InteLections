import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function createStorageService(config, deps) {
  const {
    frontendOrigin,
    avatarsDir,
    courseCoversDir,
    materialsDir,
    learnerMaterialsDir,
    maxStandardMaterialFileBytes,
    maxHostedVideoFileBytes,
  } = config;

  const {
    sanitizeText,
  } = deps;

  function ensureUploadDirectory() {
    fs.mkdirSync(avatarsDir, { recursive: true });
    fs.mkdirSync(courseCoversDir, { recursive: true });
    fs.mkdirSync(materialsDir, { recursive: true });
    fs.mkdirSync(learnerMaterialsDir, { recursive: true });
  }

  function contentTypeForFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.webm') return 'video/webm';
    if (ext === '.mp3') return 'audio/mpeg';
    if (ext === '.wav') return 'audio/wav';
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.doc') return 'application/msword';
    if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === '.xls') return 'application/vnd.ms-excel';
    if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === '.ppt') return 'application/vnd.ms-powerpoint';
    if (ext === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    return 'application/octet-stream';
  }

  function sendFile(res, filePath, sendJson) {
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: 'File not found' });
      return;
    }

    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypeForFile(filePath),
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': frontendOrigin,
      'Access-Control-Allow-Credentials': 'true',
    });
    stream.pipe(res);
  }

  function removeStoredAvatarIfLocal(avatarUrl) {
    const cleanUrl = String(avatarUrl || '');
    if (!cleanUrl.startsWith('/uploads/avatars/')) return;
    const fileName = cleanUrl.replace('/uploads/avatars/', '');
    const filePath = path.join(avatarsDir, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  function removeStoredCourseCoverIfLocal(thumbnailUrl) {
    const cleanUrl = String(thumbnailUrl || '');
    if (!cleanUrl.startsWith('/uploads/course-covers/')) return;
    const fileName = cleanUrl.replace('/uploads/course-covers/', '');
    const filePath = path.join(courseCoversDir, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  function extensionForMimeType(mimeType) {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'image/gif') return 'gif';
    return 'jpg';
  }

  function saveAvatarFile(userId, mimeType, base64Data) {
    const cleanMimeType = String(mimeType || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(cleanMimeType)) throw new Error('Unsupported avatar format');
    const buffer = Buffer.from(String(base64Data || ''), 'base64');
    if (!buffer.length) throw new Error('Avatar image is empty');
    if (buffer.length > 5 * 1024 * 1024) throw new Error('Avatar image must be 5 MB or smaller');
    const extension = extensionForMimeType(cleanMimeType);
    const fileName = `${userId}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
    fs.writeFileSync(path.join(avatarsDir, fileName), buffer);
    return `/uploads/avatars/${fileName}`;
  }

  function saveCourseCoverFile(courseId, mimeType, base64Data) {
    const cleanMimeType = String(mimeType || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(cleanMimeType)) throw new Error('Unsupported cover image format');
    const buffer = Buffer.from(String(base64Data || ''), 'base64');
    if (!buffer.length) throw new Error('Cover image is empty');
    if (buffer.length > 8 * 1024 * 1024) throw new Error('Cover image must be 8 MB or smaller');
    const extension = extensionForMimeType(cleanMimeType);
    const fileName = `${courseId}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
    fs.writeFileSync(path.join(courseCoversDir, fileName), buffer);
    return `/uploads/course-covers/${fileName}`;
  }

  function extensionFromNameOrMime(originalName, mimeType) {
    const extFromName = path.extname(String(originalName || '')).replace('.', '').toLowerCase();
    if (extFromName) return extFromName;
    const cleanMimeType = String(mimeType || '').toLowerCase();
    if (cleanMimeType === 'video/mp4') return 'mp4';
    if (cleanMimeType === 'video/webm') return 'webm';
    if (cleanMimeType === 'audio/mpeg') return 'mp3';
    if (cleanMimeType === 'audio/wav') return 'wav';
    if (cleanMimeType === 'application/pdf') return 'pdf';
    if (cleanMimeType.includes('wordprocessingml')) return 'docx';
    if (cleanMimeType === 'application/msword') return 'doc';
    if (cleanMimeType.includes('spreadsheetml')) return 'xlsx';
    if (cleanMimeType === 'application/vnd.ms-excel') return 'xls';
    if (cleanMimeType.includes('presentationml')) return 'pptx';
    if (cleanMimeType === 'application/vnd.ms-powerpoint') return 'ppt';
    return 'bin';
  }

  function materialKindFromNameOrMime(originalName, mimeType) {
    const ext = extensionFromNameOrMime(originalName, mimeType);
    if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    return 'document';
  }

  function materialFileSizeLimitBytes(originalName, mimeType) {
    return materialKindFromNameOrMime(originalName, mimeType) === 'video' ? maxHostedVideoFileBytes : maxStandardMaterialFileBytes;
  }

  function materialFileSizeLimitLabel(originalName, mimeType) {
    return materialKindFromNameOrMime(originalName, mimeType) === 'video' ? '250 MB' : '20 MB';
  }

  function materialBufferFromPayload(material) {
    if (material?.buffer && Buffer.isBuffer(material.buffer)) return material.buffer;
    return Buffer.from(String(material?.base64Data || ''), 'base64');
  }

  function saveLessonMaterialFile(lessonId, material) {
    const originalName = String(material?.originalName || 'material').trim() || 'material';
    const description = sanitizeText(material?.description);
    const mimeType = String(material?.mimeType || '').toLowerCase();
    const materialKind = materialKindFromNameOrMime(originalName, mimeType);
    const buffer = materialBufferFromPayload(material);
    if (!buffer.length) throw new Error('Material file is empty');
    const fileSizeLimitBytes = materialFileSizeLimitBytes(originalName, mimeType);
    if (buffer.length > fileSizeLimitBytes) {
      if (materialKind === 'video') throw new Error('Hosted lesson videos must be 250 MB or smaller');
      throw new Error(`Each material file must be ${materialFileSizeLimitLabel(originalName, mimeType)} or smaller`);
    }
    const videoDurationSeconds = materialKind === 'video' ? Math.round(Number(material?.videoDurationSeconds || 0)) : null;
    const extension = extensionFromNameOrMime(originalName, mimeType);
    const fileName = `${lessonId}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
    fs.writeFileSync(path.join(materialsDir, fileName), buffer);
    return {
      id: `mat-${crypto.randomUUID()}`,
      title: path.parse(originalName).name || originalName,
      materialKind,
      filePath: `/uploads/materials/${fileName}`,
      externalUrl: '',
      originalName,
      description,
      mimeType,
      fileSizeBytes: buffer.length,
      videoDurationSeconds,
    };
  }

  function replaceLessonMaterialFile(material, replacement) {
    if (!replacement || (!replacement.base64Data && !replacement.buffer)) return null;
    const originalName = String(replacement.originalName || material.originalName || 'material').trim() || 'material';
    const mimeType = String(replacement.mimeType || '').toLowerCase();
    const materialKind = materialKindFromNameOrMime(originalName, mimeType);
    const buffer = materialBufferFromPayload(replacement);
    if (!buffer.length) throw new Error('Replacement file is empty');
    const fileSizeLimitBytes = materialFileSizeLimitBytes(originalName, mimeType);
    if (buffer.length > fileSizeLimitBytes) {
      if (materialKind === 'video') throw new Error('Hosted lesson videos must be 250 MB or smaller');
      throw new Error(`Replacement file must be ${materialFileSizeLimitLabel(originalName, mimeType)} or smaller`);
    }
    const extension = extensionFromNameOrMime(originalName, mimeType);
    const fileName = material.lessonId + '-' + Date.now() + '-' + crypto.randomUUID() + '.' + extension;
    fs.writeFileSync(path.join(materialsDir, fileName), buffer);
    return {
      filePath: '/uploads/materials/' + fileName,
      externalUrl: '',
      originalName,
      materialKind,
      mimeType,
      fileSizeBytes: buffer.length,
      videoDurationSeconds: materialKind === 'video' ? Math.round(Number(replacement.videoDurationSeconds || 0)) : null,
    };
  }

  function removeStoredMaterialIfLocal(filePathValue) {
    const cleanPath = String(filePathValue || '');
    if (!cleanPath.startsWith('/uploads/materials/')) return;
    const fileName = cleanPath.replace('/uploads/materials/', '');
    const filePath = path.join(materialsDir, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  function saveLearnerCourseMaterialFile(courseId, userId, material) {
    const originalName = String(material?.originalName || 'learner-material').trim() || 'learner-material';
    const description = sanitizeText(material?.description);
    const title = sanitizeText(material?.title) || (path.parse(originalName).name || originalName);
    const mimeType = String(material?.mimeType || '').toLowerCase();
    const base64Data = String(material?.base64Data || '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (!buffer.length) throw new Error('Material file is empty');
    if (buffer.length > 20 * 1024 * 1024) throw new Error('Each learner material must be 20 MB or smaller');
    const extension = extensionFromNameOrMime(originalName, mimeType);
    const fileName = courseId + '-' + userId + '-' + Date.now() + '-' + crypto.randomUUID() + '.' + extension;
    fs.writeFileSync(path.join(learnerMaterialsDir, fileName), buffer);
    return {
      id: 'lmat-' + crypto.randomUUID(),
      title,
      description,
      filePath: '/uploads/learner-materials/' + fileName,
      originalName,
      mimeType,
      fileSizeBytes: buffer.length,
    };
  }

  function estimateBase64Bytes(value) {
    return Buffer.from(String(value || ''), 'base64').length;
  }

  return {
    ensureUploadDirectory,
    contentTypeForFile,
    sendFile,
    removeStoredAvatarIfLocal,
    removeStoredCourseCoverIfLocal,
    saveAvatarFile,
    saveCourseCoverFile,
    extensionFromNameOrMime,
    materialKindFromNameOrMime,
    saveLessonMaterialFile,
    replaceLessonMaterialFile,
    removeStoredMaterialIfLocal,
    saveLearnerCourseMaterialFile,
    estimateBase64Bytes,
  };
}
