import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL, URLSearchParams } from 'node:url';
import { createStripeService } from './services/stripe.mjs';
import { createQuizAiService } from './services/quiz-ai.mjs';
import { createStorageService } from './services/storage.mjs';
import { createProfileService } from './services/profiles.mjs';
import { createGroupsService } from './services/groups.mjs';
import { createRatingsService } from './services/ratings.mjs';
import { createCourseStatsService } from './services/course-stats.mjs';
import { handleAuthRoutes } from './routes/auth.mjs';
import { handleBillingRoutes } from './routes/billing.mjs';
import { handleGroupsRoutes } from './routes/groups.mjs';
import { handleCourseRoutes } from './routes/courses.mjs';
import { handleProfileRoutes } from './routes/profiles.mjs';
import { handleAdminRoutes } from './routes/admin.mjs';
import { sendJson as baseSendJson, redirect as baseRedirect, readBody as baseReadBody, readRawBody as baseReadRawBody, readMultipartForm as baseReadMultipartForm } from './utils/http.mjs';
import { openDatabase } from './db.mjs';
import { createYouTubeMaterial, normalizeSubscriptionPlan, sanitizeQuizQuestion, scoreQuizAttempt } from './domain.mjs';

const PORT = Number(process.env.API_PORT || 4000);
const API_ORIGIN = process.env.API_ORIGIN || `http://localhost:${PORT}`;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${API_ORIGIN}/api/auth/oauth/google/callback`;
const SESSION_MAX_AGE_SEC = Number(process.env.SESSION_MAX_AGE_SEC || 60 * 60 * 24 * 7);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_QUIZ_MODEL = process.env.OPENAI_QUIZ_MODEL || 'gpt-5-mini';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_INTELECTIONS_PLUS_PRICE_ID = process.env.STRIPE_INTELECTIONS_PLUS_PRICE_ID || '';
const STRIPE_BILLING_RETURN_URL = process.env.STRIPE_BILLING_RETURN_URL || `${FRONTEND_ORIGIN}/account`;
const STRIPE_SUBSCRIPTION_SUCCESS_URL = process.env.STRIPE_SUBSCRIPTION_SUCCESS_URL || `${FRONTEND_ORIGIN}/account?billing=success`;
const STRIPE_SUBSCRIPTION_CANCEL_URL = process.env.STRIPE_SUBSCRIPTION_CANCEL_URL || `${FRONTEND_ORIGIN}/account?billing=cancelled`;
const STRIPE_COURSE_SUCCESS_URL = process.env.STRIPE_COURSE_SUCCESS_URL || `${FRONTEND_ORIGIN}/course/{COURSE_ID}?checkout=success`;
const STRIPE_COURSE_CANCEL_URL = process.env.STRIPE_COURSE_CANCEL_URL || `${FRONTEND_ORIGIN}/course/{COURSE_ID}?checkout=cancelled`;
const STRIPE_CONNECT_RETURN_URL = process.env.STRIPE_CONNECT_RETURN_URL || `${FRONTEND_ORIGIN}/account?connect=return`;
const STRIPE_CONNECT_REFRESH_URL = process.env.STRIPE_CONNECT_REFRESH_URL || `${FRONTEND_ORIGIN}/account?connect=refresh`;
const STRIPE_PLATFORM_APPLICATION_FEE_PERCENT = Math.max(0, Number(process.env.STRIPE_PLATFORM_APPLICATION_FEE_PERCENT || 1));
const DEFAULT_COURSE_PRICE_CURRENCY = 'PLN';
const FREE_HOSTED_VIDEO_SECONDS = 5 * 60;
const PLUS_HOSTED_VIDEO_SECONDS = 30 * 60;
const MAX_STANDARD_MATERIAL_FILE_BYTES = 20 * 1024 * 1024;
const MAX_HOSTED_VIDEO_FILE_BYTES = 250 * 1024 * 1024;
const FREE_CLASSES_LIMIT = 2;
const FREE_COURSE_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const PLUS_COURSE_STORAGE_LIMIT_BYTES = 25 * 1024 * 1024 * 1024;
const FREE_PUBLISHED_COURSES_LIMIT = 5;
const PLUS_PUBLISHED_COURSES_LIMIT = 20;
const FREE_CLASS_ASSIGNMENTS_LIMIT = 10;
const PLUS_CLASS_ASSIGNMENTS_LIMIT = 30;
const PLUS_AI_MONTHLY_TOKEN_LIMIT = 1000000;
const DEFAULT_DEMO_PASSWORD = process.env.DEFAULT_DEMO_PASSWORD || 'Intelections123!';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SESSION_COOKIE = 'intelections_sid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, 'uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');
const courseCoversDir = path.join(uploadsDir, 'course-covers');
const materialsDir = path.join(uploadsDir, 'materials');
const learnerMaterialsDir = path.join(uploadsDir, 'learner-materials');

const storageService = createStorageService({
  frontendOrigin: FRONTEND_ORIGIN,
  avatarsDir,
  courseCoversDir,
  materialsDir,
  learnerMaterialsDir,
  maxStandardMaterialFileBytes: MAX_STANDARD_MATERIAL_FILE_BYTES,
  maxHostedVideoFileBytes: MAX_HOSTED_VIDEO_FILE_BYTES,
}, { sanitizeText });

storageService.ensureUploadDirectory();

function sendFile(res, filePath) {
  return storageService.sendFile(res, filePath, sendJson);
}

function removeStoredAvatarIfLocal(avatarUrl) {
  return storageService.removeStoredAvatarIfLocal(avatarUrl);
}

function removeStoredCourseCoverIfLocal(thumbnailUrl) {
  return storageService.removeStoredCourseCoverIfLocal(thumbnailUrl);
}

function saveAvatarFile(userId, mimeType, base64Data) {
  return storageService.saveAvatarFile(userId, mimeType, base64Data);
}

function saveCourseCoverFile(courseId, mimeType, base64Data) {
  return storageService.saveCourseCoverFile(courseId, mimeType, base64Data);
}

function extensionFromNameOrMime(originalName, mimeType) {
  return storageService.extensionFromNameOrMime(originalName, mimeType);
}

function materialKindFromNameOrMime(originalName, mimeType) {
  return storageService.materialKindFromNameOrMime(originalName, mimeType);
}

function saveLessonMaterialFile(lessonId, material) {
  return storageService.saveLessonMaterialFile(lessonId, material);
}

function replaceLessonMaterialFile(material, replacement) {
  return storageService.replaceLessonMaterialFile(material, replacement);
}
function removeStoredMaterialIfLocal(filePathValue) {
  return storageService.removeStoredMaterialIfLocal(filePathValue);
}

function saveLearnerCourseMaterialFile(courseId, userId, material) {
  return storageService.saveLearnerCourseMaterialFile(courseId, userId, material);
}

const db = openDatabase();
const oauthStates = new Map();

const courseStatsService = createCourseStatsService({
  freeCourseStorageLimitBytes: FREE_COURSE_STORAGE_LIMIT_BYTES,
  plusCourseStorageLimitBytes: PLUS_COURSE_STORAGE_LIMIT_BYTES,
  defaultCoursePriceCurrency: DEFAULT_COURSE_PRICE_CURRENCY,
}, {
  db,
  displayName,
  getPlatformApplicationFeeAmount,
  formatStorageLimitLabel,
});

const {
  ensureCourseStatsRow,
  refreshCourseStorageStats,
  refreshUserOwnedCourseStorageStats,
  getCourseStorageStats,
  ensureCourseStorageCapacity,
  getTeacherCourseStats,
} = courseStatsService;

const stripeService = createStripeService({
  secretKey: STRIPE_SECRET_KEY,
  webhookSecret: STRIPE_WEBHOOK_SECRET,
  frontendOrigin: FRONTEND_ORIGIN,
  billingReturnUrl: STRIPE_BILLING_RETURN_URL,
  subscriptionSuccessUrl: STRIPE_SUBSCRIPTION_SUCCESS_URL,
  subscriptionCancelUrl: STRIPE_SUBSCRIPTION_CANCEL_URL,
  courseSuccessUrl: STRIPE_COURSE_SUCCESS_URL,
  courseCancelUrl: STRIPE_COURSE_CANCEL_URL,
  connectReturnUrl: STRIPE_CONNECT_RETURN_URL,
  connectRefreshUrl: STRIPE_CONNECT_REFRESH_URL,
  applicationFeePercent: STRIPE_PLATFORM_APPLICATION_FEE_PERCENT,
  intelectionsPlusPriceId: STRIPE_INTELECTIONS_PLUS_PRICE_ID,
  defaultCoursePriceCurrency: DEFAULT_COURSE_PRICE_CURRENCY,
}, {
  db,
  slugId,
  hasBillingBypass,
  refreshUserOwnedCourseStorageStats,
});

const quizAiService = createQuizAiService({
  apiKey: OPENAI_API_KEY,
  model: OPENAI_QUIZ_MODEL,
}, {
  db,
  sanitizeText,
  hasIntelectionsPlus,
  getAiMonthlyTokenLimit,
  getAiMonthlyUsage,
  recordAiMonthlyUsage,
});

const stripe = stripeService.client;

const profileService = createProfileService({ db }, {
  getUserBase,
  isAdmin,
  slugId,
  sanitizeText,
});

const {
  getFullProfile,
  sanitizeAchievement,
  sanitizeCertificate,
  sanitizeActivity,
  sanitizeSocialLink,
} = profileService;

const ratingsService = createRatingsService({ db }, {
  displayName,
});

const {
  getViewerCourseRating,
  getViewerCourseReview,
  getCourseReviews,
  canUserRateCourse,
  upsertCourseRating,
  clearCourseReview,
} = ratingsService;

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map(x => x.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const idx = item.indexOf('=');
      if (idx < 0) return acc;
      const key = item.slice(0, idx);
      const value = decodeURIComponent(item.slice(idx + 1));
      acc[key] = value;
      return acc;
    }, {});
}

function sessionCookieValue(sessionId) {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}`;
}

function clearSessionCookieValue() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function cleanupExpiredSessions() {
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(Date.now());
}

function createSession(userId, userName) {
  cleanupExpiredSessions();
  const sid = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_MAX_AGE_SEC * 1000;

  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, user_name, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sid, userId, userName, now, expiresAt);

  return sid;
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return null;

  const row = db.prepare(`
    SELECT id AS sid, user_id AS userId, user_name AS userName, created_at AS createdAt, expires_at AS expiresAt
    FROM auth_sessions
    WHERE id = ?
  `).get(sid);

  if (!row) return null;

  if (Number(row.expiresAt) <= Date.now()) {
    db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(sid);
    return null;
  }

  return row;
}

function deleteSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sid = cookies[SESSION_COOKIE];
  if (sid) {
    db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(sid);
  }
}

function normalizeEmailAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmailAddress(value) {
  return EMAIL_PATTERN.test(normalizeEmailAddress(value));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const raw = String(storedHash || '');
  const parts = raw.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHash] = parts;
  const actualHash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

function isValidPassword(password) {
  return String(password || '').trim().length >= 8;
}

function backfillUsersWithoutPasswordHash() {
  const missingUsers = db.prepare(`
    SELECT id
    FROM users
    WHERE COALESCE(password_hash, '') = ''
  `).all();

  if (missingUsers.length === 0) return;

  const update = db.prepare(`
    UPDATE users
    SET password_hash = ?, password_updated_at = datetime('now')
    WHERE id = ?
  `);

  const transaction = db.transaction(rows => {
    for (const row of rows) {
      update.run(hashPassword(DEFAULT_DEMO_PASSWORD), row.id);
    }
  });

  transaction(missingUsers);
}

function getAuthUserRowByEmail(email) {
  return db.prepare(`
    SELECT id, password_hash AS passwordHash
    FROM users
    WHERE email = ?
  `).get(normalizeEmailAddress(email));
}

function cleanupExpiredPasswordResetTokens() {
  db.prepare('DELETE FROM password_reset_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').run(Date.now());
}

function hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function createPasswordResetToken(userId) {
  cleanupExpiredPasswordResetTokens();
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + 1000 * 60 * 30;
  db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(`prt-${crypto.randomUUID()}`, userId, hashPasswordResetToken(token), now, expiresAt);
  return { token, expiresAt };
}

function getPasswordResetTokenRecord(token) {
  cleanupExpiredPasswordResetTokens();
  return db.prepare(`
    SELECT id, user_id AS userId, expires_at AS expiresAt, used_at AS usedAt
    FROM password_reset_tokens
    WHERE token_hash = ?
  `).get(hashPasswordResetToken(token));
}

function markPasswordResetTokenUsed(tokenId) {
  db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(Date.now(), tokenId);
}

function updateUserPassword(userId, password) {
  db.prepare(`
    UPDATE users
    SET password_hash = ?, password_updated_at = datetime('now')
    WHERE id = ?
  `).run(hashPassword(password), userId);
}

function revokeAllUserSessions(userId) {
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
}

backfillUsersWithoutPasswordHash();

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  return baseSendJson(res, statusCode, payload, { corsOrigin: FRONTEND_ORIGIN, extraHeaders });
}

function redirect(res, location, extraHeaders = {}) {
  return baseRedirect(res, location, extraHeaders);
}

function readBody(req, maxLength = 1_000_000) {
  return baseReadBody(req, maxLength);
}

function readRawBody(req, maxLength = 1_000_000) {
  return baseReadRawBody(req, maxLength);
}

function readMultipartForm(req, maxLength = 1_000_000) {
  return baseReadMultipartForm(req, maxLength);
}

function mapUser(row) {

  if (!row) return null;
  const sellerStripeConnected = Boolean(row.sellerStripeConnected || row.sellerStripeAccountId);
  const sellerBillingReady = Boolean(row.sellerChargesEnabled) && Boolean(row.sellerPayoutsEnabled);
  const connectedAccountStatus = sellerStripeConnected
    ? (sellerBillingReady ? 'ready' : 'pending')
    : 'not_connected';
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    role: row.role,
    subscriptionPlan: row.subscriptionPlan || 'free',
    subscriptionStartedAt: row.subscriptionStartedAt || null,
    billingManaged: Boolean(row.billingManaged),
    sellerStripeConnected,
    sellerStripeAccountId: row.sellerStripeAccountId || null,
    sellerBillingReady,
    connectedAccountStatus,
    canSellPaidCourses: sellerBillingReady,
    profileBlocked: Boolean(row.profileBlocked),
    avatarUrl: row.avatarUrl || '',
    bio: row.bio || '',
    location: row.location || '',
    birthday: row.birthday || '',
    headline: row.headline || '',
    website: row.website || '',
    institution: row.institution || '',
    specialization: row.specialization || '',
  };
}

function getUserBase(userId) {
  const row = db.prepare(`
    SELECT id, first_name AS firstName, last_name AS lastName, email, role,
           subscription_plan AS subscriptionPlan, subscription_started_at AS subscriptionStartedAt,
           EXISTS(SELECT 1 FROM billing_customers bc WHERE bc.user_id = users.id) AS billingManaged,
           EXISTS(SELECT 1 FROM seller_stripe_accounts ssa WHERE ssa.user_id = users.id) AS sellerStripeConnected,
           (SELECT stripe_account_id FROM seller_stripe_accounts ssa WHERE ssa.user_id = users.id) AS sellerStripeAccountId,
           COALESCE((SELECT details_submitted FROM seller_stripe_accounts ssa WHERE ssa.user_id = users.id), 0) AS sellerDetailsSubmitted,
           COALESCE((SELECT charges_enabled FROM seller_stripe_accounts ssa WHERE ssa.user_id = users.id), 0) AS sellerChargesEnabled,
           COALESCE((SELECT payouts_enabled FROM seller_stripe_accounts ssa WHERE ssa.user_id = users.id), 0) AS sellerPayoutsEnabled,
           profile_blocked AS profileBlocked,
           avatar_url AS avatarUrl, bio, location, birth_date AS birthday,
           headline, website, institution, specialization
    FROM users
    WHERE id = ?
  `).get(userId);

  return mapUser(row);
}

function authUserOrNull(req) {
  const session = getSessionFromRequest(req);
  if (!session) return null;

  const user = getUserBase(session.userId);
  if (!user) return null;

  return { session, user };
}

function requireAuth(req, res) {
  const auth = authUserOrNull(req);
  if (!auth) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return auth;
}

function isGoogleOauthConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function upsertOauthUser({ email, givenName, familyName, picture, providerUserId }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('Google profile is missing email');
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  let userId = existing?.id;

  if (!userId) {
    userId = `u-${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO users (id, email, first_name, last_name, role, avatar_url)
      VALUES (?, ?, ?, ?, 'Personal', ?)
    `).run(
      userId,
      cleanEmail,
      String(givenName || 'User').slice(0, 120),
      String(familyName || '').slice(0, 120),
      String(picture || ''),
    );
  } else {
    db.prepare(`
      UPDATE users
      SET first_name = ?, last_name = ?, avatar_url = ?
      WHERE id = ?
    `).run(
      String(givenName || 'User').slice(0, 120),
      String(familyName || '').slice(0, 120),
      String(picture || ''),
      userId,
    );
  }

  db.prepare(`
    INSERT INTO oauth_identities (provider, provider_user_id, user_id)
    VALUES ('google', ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET user_id = excluded.user_id
  `).run(String(providerUserId || ''), userId);

  return {
    userId,
    name: String(givenName || 'User'),
  };
}

function getCurrentUserId(req) {
  const auth = authUserOrNull(req);
  return auth?.user.id || null;
}

function slugId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function sanitizeText(value) {
  return String(value || '').trim();
}

function hasIntelectionsPlus(user) {
  return normalizeSubscriptionPlan(user?.subscriptionPlan) === 'plus';
}

function getHostedVideoLimitSeconds(user) {
  return hasIntelectionsPlus(user) ? PLUS_HOSTED_VIDEO_SECONDS : FREE_HOSTED_VIDEO_SECONDS;
}

function getAiUsageMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getAiMonthlyTokenLimit(user) {
  return hasIntelectionsPlus(user) ? PLUS_AI_MONTHLY_TOKEN_LIMIT : 0;
}

function getAiMonthlyUsage(userId, monthKey = getAiUsageMonthKey()) {
  if (!userId) {
    return { requestCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  const row = db.prepare(`
    SELECT request_count AS requestCount, input_tokens AS inputTokens, output_tokens AS outputTokens, total_tokens AS totalTokens
    FROM ai_monthly_usage
    WHERE user_id = ? AND month_key = ?
  `).get(userId, monthKey);

  return {
    requestCount: Number(row?.requestCount || 0),
    inputTokens: Number(row?.inputTokens || 0),
    outputTokens: Number(row?.outputTokens || 0),
    totalTokens: Number(row?.totalTokens || 0),
  };
}

function extractOpenAiUsage(response = {}) {
  const usage = response?.usage ?? {};
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? usage.outputTokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens ?? (inputTokens + outputTokens));

  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function recordAiMonthlyUsage(userId, usage, monthKey = getAiUsageMonthKey()) {
  if (!userId) return;

  const inputTokens = Math.max(0, Number(usage?.inputTokens || 0));
  const outputTokens = Math.max(0, Number(usage?.outputTokens || 0));
  const totalTokens = Math.max(0, Number(usage?.totalTokens || (inputTokens + outputTokens)));

  db.prepare(`
    INSERT INTO ai_monthly_usage (user_id, month_key, request_count, input_tokens, output_tokens, total_tokens, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, month_key) DO UPDATE SET
      request_count = ai_monthly_usage.request_count + 1,
      input_tokens = ai_monthly_usage.input_tokens + excluded.input_tokens,
      output_tokens = ai_monthly_usage.output_tokens + excluded.output_tokens,
      total_tokens = ai_monthly_usage.total_tokens + excluded.total_tokens,
      updated_at = datetime('now')
  `).run(userId, monthKey, inputTokens, outputTokens, totalTokens);
}

function isAdmin(user) {
  return user?.role === 'Admin';
}

function hasBillingBypass(user) {
  return isAdmin(user);
}

function isStripeConfigured() {
  return stripeService.isConfigured();
}

function getSellerConnectState(userOrUserId) {
  return stripeService.getSellerConnectState(userOrUserId);
}

async function syncSellerStripeAccountStatus(userId, stripeAccountId = '') {
  return stripeService.syncSellerStripeAccountStatus(userId, stripeAccountId);
}

async function ensureSellerStripeAccount(user) {
  return stripeService.ensureSellerStripeAccount(user);
}

function getPlatformApplicationFeeAmount(amountCents) {
  return stripeService.getPlatformApplicationFeeAmount(amountCents);
}

async function ensureStripeCustomer(user) {
  return stripeService.ensureStripeCustomer(user);
}

function buildCourseSuccessUrl(courseId, type) {
  return stripeService.buildCourseSuccessUrl(courseId, type);
}

function getLatestCoursePurchase(userId, courseId) {
  return stripeService.getLatestCoursePurchase(userId, courseId);
}

function getCoursePurchaseAccess(userOrUserId, courseId) {
  return stripeService.getCoursePurchaseAccess(userOrUserId, courseId);
}

function upsertCoursePurchaseRecord(record) {
  return stripeService.upsertCoursePurchaseRecord(record);
}

function markCoursePurchasePaid(record) {
  return stripeService.markCoursePurchasePaid(record);
}

function markCoursePurchaseFailed(record) {
  return stripeService.markCoursePurchaseFailed(record);
}

async function handleStripeWebhookEvent(event) {
  return stripeService.handleStripeWebhookEvent(event);
}

function formatStorageLimitLabel(bytes) {

  return String(Math.round(bytes / (1024 * 1024 * 1024))) + ' GB';
}

function getPublishedCourseLimit(user) {
  return hasIntelectionsPlus(user) ? PLUS_PUBLISHED_COURSES_LIMIT : FREE_PUBLISHED_COURSES_LIMIT;
}

function getClassAssignmentLimit(user) {
  return hasIntelectionsPlus(user) ? PLUS_CLASS_ASSIGNMENTS_LIMIT : FREE_CLASS_ASSIGNMENTS_LIMIT;
}

function getCourseStorageLimitBytes(user) {
  return hasIntelectionsPlus(user) ? PLUS_COURSE_STORAGE_LIMIT_BYTES : FREE_COURSE_STORAGE_LIMIT_BYTES;
}

function normalizeCourseAccessMode(value) {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'public-free' || normalized === 'public-paid' || normalized === 'class-only') {
    return normalized;
  }
  return '';
}

function resolveCourseAccessConfig(body = {}) {
  const requestedAccessMode = normalizeCourseAccessMode(body.accessMode);
  if (requestedAccessMode === 'public-paid') {
    return { accessMode: 'public-paid', visibility: 'public', accessType: 'paid' };
  }
  if (requestedAccessMode === 'class-only') {
    return { accessMode: 'class-only', visibility: 'private', accessType: 'free' };
  }
  if (requestedAccessMode === 'public-free') {
    return { accessMode: 'public-free', visibility: 'public', accessType: 'free' };
  }

  const legacyAccessType = sanitizeText(body.accessType).toLowerCase() === 'paid' ? 'paid' : 'free';
  return {
    accessMode: legacyAccessType === 'paid' ? 'public-paid' : 'public-free',
    visibility: 'public',
    accessType: legacyAccessType,
  };
}

function getCourseAccessMode(course) {
  if (!course) return 'class-only';

  const visibility = sanitizeText(course.visibility).toLowerCase();
  const accessType = sanitizeText(course.accessType || course.access_type).toLowerCase();
  if (visibility !== 'public') {
    return 'class-only';
  }
  return accessType === 'paid' ? 'public-paid' : 'public-free';
}

function getCourseAccessState(course, viewer = null, enrollment = null, hasClassAccess = false, purchase = null) {
  const accessMode = getCourseAccessMode(course);
  const viewerId = viewer?.id || null;
  const hasAdminBypass = hasBillingBypass(viewer);
  const isOwner = Boolean(viewerId && course.authorUserId === viewerId);
  const isPublished = course.publishStatus === 'published';
  const purchaseStatus = hasAdminBypass ? 'paid' : String(purchase?.status || 'none');
  const hasPaidAccess = purchaseStatus === 'paid';
  const isEnrolled = Boolean(enrollment || hasPaidAccess);
  const canAccessPaidContents = hasAdminBypass || isOwner || Boolean(hasClassAccess) || hasPaidAccess || isEnrolled;

  return {
    accessMode,
    isOwner,
    isPublished,
    isEnrolled,
    canAccessPaidContents,
    hasAdminBypass,
    hasClassAccess: Boolean(hasClassAccess),
    purchaseStatus,
    hasPaidAccess,
    canPublicEnroll: !hasAdminBypass && !isOwner && isPublished && accessMode === 'public-free' && !isEnrolled,
    requiresPurchase: !hasAdminBypass && !isOwner && isPublished && accessMode === 'public-paid' && !isEnrolled && !hasClassAccess,
    checkoutEligible: !hasAdminBypass && !isOwner && isPublished && accessMode === 'public-paid' && !isEnrolled && !hasClassAccess,
  };
}

function getOwnedLearningGroupCount(userId) {
  const row = db.prepare('SELECT COUNT(*) AS count FROM learning_groups WHERE owner_user_id = ?').get(userId);
  return Number(row?.count || 0);
}

function getPublishedOwnedCourseCount(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM courses
    WHERE author_user_id = ? AND publish_status = 'published'
  `).get(userId);
  return Number(row?.count || 0);
}

function getOwnedCourseAssignmentCount(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM group_course_assignments
    WHERE assigned_by_user_id = ?
  `).get(userId);
  return Number(row?.count || 0);
}

function estimateBase64Bytes(value) {
  return storageService.estimateBase64Bytes(value);
}

function getQuizGenerationAvailability(user = null) {
  return quizAiService.getQuizGenerationAvailability(user);
}

function buildLessonQuizGenerationContext(lessonId) {
  return quizAiService.buildLessonQuizGenerationContext(lessonId);
}

async function generateQuizDraftWithOpenAI(context, controls, userId = '') {
  return quizAiService.generateQuizDraftWithOpenAI(context, controls, userId);
}

function getQuizAttemptCount(quizId, userId) {
  if (!quizId || !userId) return 0;

  const row = db.prepare('SELECT COUNT(*) AS count FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?').get(quizId, userId);
  return Number(row?.count || 0);
}

function getOwnedLearningGroups(userId) {
  if (!userId) return [];

  return db.prepare(`
    SELECT id, name
    FROM learning_groups
    WHERE owner_user_id = ?
    ORDER BY name ASC
  `).all(userId);
}

function isCourseAssignedToActiveGroupMember(courseId, userId) {
  if (!courseId || !userId) return false;

  return Boolean(db.prepare(`
    SELECT 1
    FROM learning_group_members gm
    JOIN group_course_assignments a ON a.group_id = gm.group_id
    WHERE a.course_id = ? AND gm.user_id = ? AND gm.status = 'active'
    LIMIT 1
  `).get(courseId, userId));
}

function syncGroupAssignedCourseEnrollments(userId) {
  if (!userId) return;

  const assignedCourses = db.prepare(`
    SELECT DISTINCT a.course_id AS courseId
    FROM learning_group_members gm
    JOIN group_course_assignments a ON a.group_id = gm.group_id
    WHERE gm.user_id = ? AND gm.status = 'active'
  `).all(userId);

  if (assignedCourses.length === 0) return;

  const insertEnrollment = db.prepare(`
    INSERT INTO course_enrollments (id, course_id, user_id, status)
    VALUES (?, ?, ?, 'active')
    ON CONFLICT(course_id, user_id) DO UPDATE SET status = 'active'
  `);
  const updateStats = db.prepare(`
    UPDATE course_stats
    SET students = (
      SELECT COUNT(*) FROM course_enrollments WHERE course_id = ? AND status = 'active'
    )
    WHERE course_id = ?
  `);

  assignedCourses.forEach(item => {
    insertEnrollment.run(slugId('enrollment'), item.courseId, userId);
    updateStats.run(item.courseId, item.courseId);
  });
}

function syncLearningGroupMemberEnrollments(groupId) {
  if (!groupId) return;

  const members = db.prepare(`
    SELECT user_id AS userId
    FROM learning_group_members
    WHERE group_id = ? AND member_role = 'student' AND status = 'active'
  `).all(groupId);

  members.forEach(member => {
    syncGroupAssignedCourseEnrollments(member.userId);
  });
}

function getTeacherAssignableCourses(userId) {
  return db.prepare(`
    SELECT id, title, category, level, publish_status AS publishStatus
    FROM courses
    WHERE author_user_id = ?
    ORDER BY CASE WHEN publish_status = 'published' THEN 0 ELSE 1 END, title ASC
  `).all(userId);
}

function getClassInviteInbox(userId) {
  let preference = db.prepare(`
    SELECT hide_class_invite_messages AS hideClassInviteMessages
    FROM user_ui_preferences
    WHERE user_id = ?
  `).get(userId);

  if (!preference) {
    db.prepare(`
      INSERT INTO user_ui_preferences (user_id, hide_class_invite_messages)
      VALUES (?, 0)
      ON CONFLICT(user_id) DO NOTHING
    `).run(userId);
    preference = { hideClassInviteMessages: 0 };
  }

  const invites = db.prepare(`
    SELECT i.id, i.group_id AS groupId, i.created_at AS createdAt,
           g.name AS className, g.focus_area AS focusArea, g.meeting_label AS meetingLabel,
           g.location_label AS locationLabel, g.room_link AS roomLink,
           owner.first_name AS teacherFirstName, owner.last_name AS teacherLastName
    FROM learning_group_invites i
    JOIN learning_groups g ON g.id = i.group_id
    JOIN users owner ON owner.id = g.owner_user_id
    WHERE i.recipient_user_id = ? AND i.status = 'pending'
    ORDER BY i.created_at DESC, i.id DESC
  `).all(userId).map(row => ({
    id: row.id,
    groupId: row.groupId,
    className: row.className,
    focusArea: row.focusArea || '',
    meetingLabel: row.meetingLabel || '',
    locationLabel: row.locationLabel || '',
    roomLink: row.roomLink || '',
    teacherName: displayName(row.teacherFirstName, row.teacherLastName),
    createdAt: row.createdAt || '',
  }));

  return {
    hideClassInviteMessages: Boolean(preference?.hideClassInviteMessages),
    pendingCount: invites.length,
    invites,
  };
}

function setHideClassInviteMessages(userId, hideClassInviteMessages) {
  db.prepare(`
    INSERT INTO user_ui_preferences (user_id, hide_class_invite_messages)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET hide_class_invite_messages = excluded.hide_class_invite_messages
  `).run(userId, hideClassInviteMessages ? 1 : 0);
}

function getQuizAvailability(quiz, userId = null) {
  const isOwner = Boolean(userId && userId === quiz.authorUserId);
  const availableFrom = sanitizeText(quiz.availableFrom) || null;
  const availableTo = sanitizeText(quiz.availableTo) || null;
  const parsedAvailableFrom = availableFrom ? Date.parse(availableFrom) : NaN;
  const parsedAvailableTo = availableTo ? Date.parse(availableTo) : NaN;
  const startsLater = Number.isFinite(parsedAvailableFrom) && parsedAvailableFrom > Date.now();
  const endedAlready = Number.isFinite(parsedAvailableTo) && parsedAvailableTo <= Date.now();
  const isGroupScoped = quiz.accessScope === 'group' && Boolean(quiz.accessGroupId);

  let isInGroup = false;
  if (isGroupScoped && userId) {
    isInGroup = Boolean(db.prepare(`
      SELECT 1
      FROM learning_group_members
      WHERE group_id = ? AND user_id = ? AND status = 'active'
    `).get(quiz.accessGroupId, userId));
  }

  let availabilityStatus = 'open';
  if (isGroupScoped && (!isOwner && !isInGroup)) {
    availabilityStatus = 'group-only';
  } else if (endedAlready) {
    availabilityStatus = 'closed';
  } else if (startsLater) {
    availabilityStatus = 'scheduled';
  } else if (isGroupScoped) {
    availabilityStatus = 'group-only';
  }

  return {
    availableFrom,
    availableTo,
    availabilityStatus,
    canAttempt: isOwner || (!startsLater && !endedAlready && (!isGroupScoped || isInGroup)),
  };
}

function getLessonQuiz(lessonId, userId = null) {
  const quiz = db.prepare(`
    SELECT q.id, q.title, q.description, q.passing_score AS passingScore, q.time_limit_min AS timeLimitMin,
           q.max_attempts AS maxAttempts, q.access_scope AS accessScope, q.access_group_id AS accessGroupId,
           q.available_from AS availableFrom, q.available_to AS availableTo, g.name AS accessGroupName, c.author_user_id AS authorUserId
    FROM lesson_quizzes q
    LEFT JOIN learning_groups g ON g.id = q.access_group_id
    JOIN lessons l ON l.id = q.lesson_id
    JOIN courses c ON c.id = l.course_id
    WHERE q.lesson_id = ?
  `).get(lessonId);

  if (!quiz) return null;

  const questions = db.prepare(`
    SELECT id, prompt, question_type AS questionType, accepted_answer AS acceptedAnswer
    FROM lesson_quiz_questions
    WHERE quiz_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(quiz.id).map(question => ({
    ...question,
    options: db.prepare(`
      SELECT id, option_text AS text, is_correct AS isCorrect
      FROM lesson_quiz_options
      WHERE question_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(question.id).map(option => ({
      ...option,
      isCorrect: Boolean(option.isCorrect),
    })),
  }));

  const availability = getQuizAvailability(quiz, userId);

  return {
    ...quiz,
    timeLimitMin: quiz.timeLimitMin == null ? null : Number(quiz.timeLimitMin),
    maxAttempts: quiz.maxAttempts == null ? null : Number(quiz.maxAttempts),
    attemptsUsed: userId ? getQuizAttemptCount(quiz.id, userId) : 0,
    accessGroupId: quiz.accessGroupId || null,
    accessGroupName: quiz.accessGroupName || null,
    questions,
    ...availability,
  };
}

function getLatestQuizAttempt(quizId, userId) {
  if (!quizId || !userId) return null;

  const attempt = db.prepare(`
    SELECT id, score_percent AS scorePercent, passed, total_questions AS totalQuestions,
           correct_answers AS correctAnswers, submitted_at AS submittedAt
    FROM quiz_attempts
    WHERE quiz_id = ? AND user_id = ?
    ORDER BY submitted_at DESC, id DESC
    LIMIT 1
  `).get(quizId, userId);

  if (!attempt) return null;
  return {
    ...attempt,
    passed: Boolean(attempt.passed),
  };
}

function displayName(firstName, lastName, fallback = 'User') {
  const name = sanitizeText(String(firstName || '') + ' ' + String(lastName || ''));
  return name || fallback;
}

const groupsService = createGroupsService({ db, freeClassesLimit: FREE_CLASSES_LIMIT }, {
  getUserBase,
  displayName,
  getTeacherAssignableCourses,
  getOwnedCourseAssignmentCount,
  getClassAssignmentLimit,
  getOwnedLearningGroupCount,
  hasIntelectionsPlus,
  syncGroupAssignedCourseEnrollments,
  getCourseAccessMode,
});

const {
  getTeacherClassrooms,
  getTeacherClassDetail,
  getStudentClassDetail,
  getStudentClassrooms,
  getStudentAssignedCourses,
  getStudentRecentAttempts,
  getGroupsClassesPayload,
} = groupsService;

const routeContext = {
  crypto,
  db,
  stripe,
  stripeService,
  FRONTEND_ORIGIN,
  OPENAI_API_KEY,
  OPENAI_QUIZ_MODEL,
  DEFAULT_DEMO_PASSWORD,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PLATFORM_APPLICATION_FEE_PERCENT,
  DEFAULT_COURSE_PRICE_CURRENCY,
  FREE_CLASSES_LIMIT,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  oauthStates,
  readBody,
  readRawBody,
  readMultipartForm,
  sendJson,
  redirect,
  requireAuth,
  authUserOrNull,
  normalizeEmailAddress,
  sanitizeText,
  isValidEmailAddress,
  isValidPassword,
  getAuthUserRowByEmail,
  hashPassword,
  verifyPassword,
  getUserBase,
  createSession,
  sessionCookieValue,
  clearSessionCookieValue,
  deleteSessionFromRequest,
  createPasswordResetToken,
  getPasswordResetTokenRecord,
  updateUserPassword,
  markPasswordResetTokenUsed,
  revokeAllUserSessions,
  slugId,
  getQuizGenerationAvailability,
  isGoogleOauthConfigured,
  upsertOauthUser,
  hasBillingBypass,
  hasIntelectionsPlus,
  isStripeConfigured,
  ensureStripeCustomer,
  handleStripeWebhookEvent,
  getSellerConnectState,
  ensureSellerStripeAccount,
  syncSellerStripeAccountStatus,
  getLatestCoursePurchase,
  getCourseAccessMode,
  getPlatformApplicationFeeAmount,
  buildCourseSuccessUrl,
  upsertCoursePurchaseRecord,
  markCoursePurchasePaid,
  getClassInviteInbox,
  setHideClassInviteMessages,
  syncGroupAssignedCourseEnrollments,
  syncLearningGroupMemberEnrollments,
  getGroupsClassesPayload,
  getTeacherClassDetail,
  getStudentClassDetail,
  getTeacherClassrooms,
  courseStatsService,
  getOwnedLearningGroupCount,
  getOwnedCourseAssignmentCount,
  getClassAssignmentLimit,
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
  sanitizeQuizQuestion,
  getLessonQuiz,
  isAdmin,
  getPublishedOwnedCourseCount,
  getPublishedCourseLimit,
  saveAvatarFile,
  removeStoredAvatarIfLocal,
  getFullProfile,
  getCurrentUserId,
  sanitizeAchievement,
  sanitizeCertificate,
  sanitizeActivity,
  sanitizeSocialLink,
  normalizeSubscriptionPlan,
  refreshUserOwnedCourseStorageStats,
  getCourseAccessState,
  isCourseAssignedToActiveGroupMember,
  getCoursePurchaseAccess,
  ratingsService,
  scoreQuizAttempt,
  getCourseDetailsPayload: (courseId, userId = null) => routes.courseDetails(courseId, userId),
};

const routes = {
  health: () => ({ ok: true, service: 'intelections-api' }),

  homeCourses: userId => {
    return db.prepare(`
      SELECT c.id, c.title, c.category, c.thumbnail_url AS thumbnailUrl, c.template_key AS templateKey,
             c.allow_learner_uploads AS allowLearnerUploads,
             u.id AS authorId, u.first_name || ' ' || u.last_name AS author,
             sc.rowid AS addedSeq,
             CASE WHEN cs.course_id IS NULL THEN 0 ELSE 1 END AS starred
      FROM saved_courses sc
      JOIN courses c ON c.id = sc.course_id
      JOIN users u ON u.id = c.author_user_id
      LEFT JOIN course_stars cs ON cs.course_id = c.id AND cs.user_id = ?
      WHERE sc.user_id = ?
      ORDER BY sc.rowid DESC
    `).all(userId, userId).map(row => ({
        ...row,
        starred: Boolean(row.starred),
        allowLearnerUploads: Boolean(row.allowLearnerUploads),
      }));
  },

  discover: (searchParams, userId) => {
    const query = (searchParams.get('query') || '').toLowerCase();
    const category = searchParams.get('category') || 'All';
    const author = (searchParams.get('author') || '').toLowerCase();

    const base = db.prepare(`
      SELECT c.id, c.title, c.category, c.country, c.thumbnail_url AS thumbnailUrl, c.template_key AS templateKey, c.is_trending AS isTrending, c.is_popular_pl AS isPopular,
             c.access_type AS accessType, c.visibility, c.price_cents AS priceCents, c.currency,
             CASE WHEN sc.course_id IS NULL THEN 0 ELSE 1 END AS saved,
             CASE WHEN ce.course_id IS NULL THEN 0 ELSE 1 END AS enrolled,
             u.id AS authorId,
             u.profile_blocked AS authorProfileBlocked,
             u.first_name || ' ' || u.last_name AS author
      FROM courses c
      JOIN users u ON u.id = c.author_user_id
      LEFT JOIN saved_courses sc ON sc.course_id = c.id AND sc.user_id = ?
      LEFT JOIN course_enrollments ce ON ce.course_id = c.id AND ce.user_id = ? AND ce.status = 'active'
      WHERE c.publish_status = 'published'
        AND c.visibility = 'public'
        AND (? = '' OR lower(c.title) LIKE '%' || ? || '%' OR lower(c.description) LIKE '%' || ? || '%')
        AND (? = 'All' OR c.category = ?)
        AND (? = '' OR lower(u.first_name || ' ' || u.last_name) LIKE '%' || ? || '%')
    `).all(userId || '', userId || '', query, query, query, category, category, author, author);

    const clean = base.map(({ isTrending, isPopular, saved, enrolled, authorProfileBlocked, ...rest }) => ({
      ...rest,
      authorProfileBlocked: Boolean(authorProfileBlocked),
      accessMode: getCourseAccessMode(rest),
      isTrending: Boolean(isTrending),
      isPopular: Boolean(isPopular),
      saved: Boolean(saved),
      enrolled: Boolean(enrolled),
    }));

    const stripFlags = ({ isTrending: _a, isPopular: _b, ...item }) => item;
    const trends = clean.filter(r => r.isTrending).map(stripFlags);
    const popular = clean.filter(r => r.isPopular).map(stripFlags);
    const humanities = clean
      .filter(r => ['History', 'Humanities', 'Art'].includes(r.category))
      .sort((a, b) => Number(b.isTrending) - Number(a.isTrending) || Number(b.isPopular) - Number(a.isPopular) || a.title.localeCompare(b.title))
      .map(stripFlags);

    const categoryRows = db.prepare("SELECT DISTINCT category FROM courses WHERE publish_status = 'published' AND visibility = 'public' ORDER BY category").all();
    const categories = ['All', ...categoryRows.map(r => r.category)];

    return { trends, popular, humanities, categories };
  },

  myProducts: (userId, query) => {
    return db.prepare(`
      SELECT c.id, c.title,
             c.description,
             c.category,
             c.level,
             c.thumbnail_url AS thumbnailUrl,
             c.template_key AS templateKey,
             c.allow_learner_uploads AS allowLearnerUploads,
             c.learner_upload_note AS learnerUploadNote,
             c.access_type AS accessType,
             c.visibility,
             c.publish_blocked AS publishBlocked,
             c.publish_block_message AS publishBlockMessage,
             c.price_cents AS priceCents,
             c.currency,
             c.rowid AS addedSeq,
             u.first_name || ' ' || u.last_name AS author,
             CASE WHEN c.publish_status = 'published' THEN 'Published' ELSE 'Non posted' END AS status,
             CASE WHEN cs.course_id IS NULL THEN 0 ELSE 1 END AS starred
      FROM courses c
      JOIN users u ON u.id = c.author_user_id
      LEFT JOIN course_stars cs ON cs.course_id = c.id AND cs.user_id = ?
      WHERE c.author_user_id = ?
        AND (? = '' OR lower(c.title) LIKE '%' || ? || '%' OR lower(c.publish_status) LIKE '%' || ? || '%')
      ORDER BY c.rowid DESC
    `).all(userId, userId, query, query, query)
      .map(row => ({
        ...row,
        accessMode: getCourseAccessMode(row),
        starred: Boolean(row.starred),
        allowLearnerUploads: Boolean(row.allowLearnerUploads),
      }));
  },

  courseDetails: (courseId, userId = null) => {
    const course = db.prepare(`
      SELECT c.id, c.title, c.description, c.category, c.level, c.thumbnail_url AS thumbnailUrl, c.template_key AS templateKey, c.access_type AS accessType,
             c.allow_learner_uploads AS allowLearnerUploads, c.learner_upload_note AS learnerUploadNote,
             c.publish_status AS publishStatus, c.visibility,
             c.publish_blocked AS publishBlocked, c.publish_block_message AS publishBlockMessage,
             c.author_user_id AS authorUserId,
             c.price_cents AS priceCents, c.currency,
             u.id AS authorId,
             u.profile_blocked AS authorProfileBlocked,
             u.first_name || ' ' || u.last_name AS author,
             s.students, s.rating, s.reviews
      FROM courses c
      JOIN users u ON u.id = c.author_user_id
      LEFT JOIN course_stats s ON s.course_id = c.id
      WHERE c.id = ?
    `).get(courseId);

    if (!course) return null;

    if (userId) {
      syncGroupAssignedCourseEnrollments(userId);
    }

    ensureCourseStatsRow(courseId);

    const viewer = userId ? getUserBase(userId) : null;
    const hasClassAccess = Boolean(userId && isCourseAssignedToActiveGroupMember(courseId, userId));
    const enrollment = userId
      ? db.prepare(`
          SELECT id, status, enrolled_at AS enrolledAt
          FROM course_enrollments
          WHERE course_id = ? AND user_id = ?
        `).get(courseId, userId)
      : null;
    const purchase = userId ? getLatestCoursePurchase(userId, courseId) : null;
    const accessState = getCourseAccessState(course, viewer, enrollment, hasClassAccess, purchase);
    const { accessMode, isOwner, isPublished } = accessState;
    const viewerRating = userId ? getViewerCourseRating(courseId, userId) : null;
    const viewerReview = userId ? getViewerCourseReview(courseId, userId) : null;
    const canRate = canUserRateCourse(course, userId, enrollment, hasClassAccess, accessState.hasPaidAccess);

    if (!isPublished && !isOwner && !hasClassAccess && !accessState.hasAdminBypass && !accessState.hasPaidAccess) return null;

    const courseGroups = isOwner
      ? db.prepare(`
          SELECT g.id, g.name, g.meeting_label AS meetingLabel, g.location_label AS locationLabel
          FROM group_course_assignments a
          JOIN learning_groups g ON g.id = a.group_id
          WHERE a.course_id = ?
          ORDER BY g.created_at DESC, g.name ASC
        `).all(courseId)
      : userId
        ? db.prepare(`
            SELECT g.id, g.name, g.meeting_label AS meetingLabel, g.location_label AS locationLabel
            FROM learning_group_members gm
            JOIN learning_groups g ON g.id = gm.group_id
            JOIN group_course_assignments a ON a.group_id = g.id
            WHERE gm.user_id = ? AND gm.status = 'active' AND gm.member_role = 'student' AND a.course_id = ?
            ORDER BY g.created_at DESC, g.name ASC
          `).all(userId, courseId)
        : [];

    const learnerMaterials = userId
      ? db.prepare(`
          SELECT lm.id, lm.title, lm.description, lm.file_path AS filePath, lm.original_name AS originalName,
                 lm.mime_type AS mimeType, lm.file_size_bytes AS fileSizeBytes, lm.created_at AS uploadedAt,
                 u.id AS uploadedById, u.first_name || ' ' || u.last_name AS uploadedByName
          FROM course_learner_materials lm
          JOIN users u ON u.id = lm.user_id
          WHERE lm.course_id = ? AND (? = 1 OR lm.user_id = ?)
          ORDER BY lm.created_at DESC, lm.id DESC
        `).all(courseId, isOwner ? 1 : 0, userId)
      : [];

    const storage = isOwner ? getCourseStorageStats(courseId) : null;

    const lessons = db.prepare(`
      SELECT id, title, duration_min AS durationMin, is_free_preview AS isFreePreview
      FROM lessons
      WHERE course_id = ?
      ORDER BY position ASC
    `).all(courseId).map(l => {
      const materialSections = db.prepare(`
        SELECT id, title, description, is_paid_content AS isPaidContent, sort_order AS sortOrder
        FROM lesson_material_sections
        WHERE lesson_id = ?
        ORDER BY sort_order ASC, created_at ASC, id ASC
      `).all(l.id).map(section => ({
        ...section,
        isPaidContent: Boolean(section.isPaidContent),
      }));
      const lockedSectionIds = new Set(
        materialSections.filter(section => section.isPaidContent && !accessState.canAccessPaidContents).map(section => section.id),
      );
      const materials = db.prepare(`
        SELECT id, title, material_kind AS materialKind, file_path AS filePath,
               external_url AS externalUrl, original_name AS originalName, description, mime_type AS mimeType, file_size_bytes AS fileSizeBytes,
               video_duration_seconds AS videoDurationSeconds, section_id AS sectionId, sort_order AS sortOrder
        FROM lesson_materials
        WHERE lesson_id = ?
        ORDER BY sort_order ASC, created_at ASC, id ASC
      `).all(l.id).map(material => {
        const locked = material.sectionId && lockedSectionIds.has(material.sectionId);
        if (!locked) return material;
        return {
          ...material,
          filePath: '',
          externalUrl: '',
        };
      });
      const quiz = getLessonQuiz(l.id, userId);

      return {
        ...l,
        isFreePreview: Boolean(l.isFreePreview),
        materialSections,
        materials,
        quiz,
        latestAttempt: quiz && userId ? getLatestQuizAttempt(quiz.id, userId) : null,
      };
    });

    return {
      id: course.id,
      title: course.title,
      author: course.author,
      authorId: course.authorId,
      authorProfileBlocked: Boolean(course.authorProfileBlocked),
      category: course.category,
      level: course.level,
      description: course.description,
      priceCents: course.priceCents == null ? null : Number(course.priceCents),
      currency: course.currency || DEFAULT_COURSE_PRICE_CURRENCY,
      accessMode,
      accessType: course.accessType,
      publishStatus: course.publishStatus,
      visibility: course.visibility,
      publishBlocked: Boolean(course.publishBlocked),
      publishBlockMessage: course.publishBlockMessage || '',
      allowLearnerUploads: Boolean(course.allowLearnerUploads),
      learnerUploadNote: course.learnerUploadNote || '',
      viewerSubscriptionPlan: normalizeSubscriptionPlan(viewer?.subscriptionPlan),
      quizGenerationAvailable: isOwner && getQuizGenerationAvailability(viewer).available,
      quizGenerationReason: isOwner ? getQuizGenerationAvailability(viewer).reason : '',
      isOwner,
      isPublished,
      isEnrolled: accessState.isEnrolled,
      canAccessPaidContents: accessState.canAccessPaidContents,
      canPublicEnroll: accessState.canPublicEnroll,
      requiresPurchase: accessState.requiresPurchase,
      purchaseStatus: accessState.purchaseStatus,
      hasPaidAccess: accessState.hasPaidAccess,
      checkoutEligible: accessState.checkoutEligible,
      hasAdminBypass: accessState.hasAdminBypass,
      viewerRole: viewer?.role || '',
      hasClassAccess: accessState.hasClassAccess,
      canRate,
      viewerRating,
      viewerReview,
      enrollment,
      ownerGroups: isOwner ? getOwnedLearningGroups(userId) : [],
      courseGroups,
      learnerMaterials,
      storage: isOwner && storage ? {
        usedMb: Math.round((storage.usedBytes / (1024 * 1024)) * 10) / 10,
        remainingGb: Math.max(0, Math.round(((storage.limitBytes - storage.usedBytes) / (1024 * 1024 * 1024)) * 100) / 100),
        limitGb: Math.round((storage.limitBytes / (1024 * 1024 * 1024)) * 100) / 100,
        usagePercent: storage.limitBytes > 0 ? Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100)) : 0,
      } : null,
      lessons,
      stats: {
        students: course.students || 0,
        rating: course.rating || 0,
        reviews: course.reviews || 0,
      },
      courseReviews: getCourseReviews(courseId),
    };
  },
};

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url || !req.method) {
      return sendJson(res, 400, { error: 'Invalid request' });
    }

    if (req.method === 'OPTIONS') {
      return sendJson(res, 204, {});
    }

    const url = new URL(req.url, API_ORIGIN);

    if (req.method === 'GET' && url.pathname.startsWith('/uploads/avatars/')) {
      const fileName = path.basename(url.pathname);
      return sendFile(res, path.join(avatarsDir, fileName));
    }

    if (req.method === 'GET' && url.pathname.startsWith('/uploads/course-covers/')) {
      const fileName = path.basename(url.pathname);
      return sendFile(res, path.join(courseCoversDir, fileName));
    }

    if (req.method === 'GET' && url.pathname.startsWith('/uploads/materials/')) {
      const fileName = path.basename(url.pathname);
      return sendFile(res, path.join(materialsDir, fileName));
    }

    if (req.method === 'GET' && url.pathname.startsWith('/uploads/learner-materials/')) {
      const fileName = path.basename(url.pathname);
      return sendFile(res, path.join(learnerMaterialsDir, fileName));
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, routes.health());
    }

    if (await handleBillingRoutes(routeContext, req, res, url)) return;
    if (await handleAuthRoutes(routeContext, req, res, url)) return;
    if (await handleGroupsRoutes(routeContext, req, res, url)) return;
    if (await handleAdminRoutes(routeContext, req, res, url)) return;
    if (await handleProfileRoutes(routeContext, req, res, url)) return;
    if (await handleCourseRoutes(routeContext, req, res, url)) return;

    if (req.method === 'GET' && url.pathname === '/api/home-courses') {
      const userId = getCurrentUserId(req);
      if (!userId) return sendJson(res, 401, { error: 'Unauthorized' });

      const query = (url.searchParams.get('query') || '').toLowerCase();
      const items = routes.homeCourses(userId).filter(c =>
        query === '' ||
        c.title.toLowerCase().includes(query) ||
        c.author.toLowerCase().includes(query),
      );

      return sendJson(res, 200, items);
    }

    if (req.method === 'POST' && /^\/api\/home-courses\/[^/]+\/remove$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return;

      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      db.prepare(`
        DELETE FROM saved_courses
        WHERE user_id = ? AND course_id = ?
      `).run(auth.user.id, courseId);

      return sendJson(res, 200, { removed: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/discover') {
      const userId = getCurrentUserId(req);
      return sendJson(res, 200, routes.discover(url.searchParams, userId));
    }

    if (req.method === 'POST' && /^\/api\/discover\/[^/]+\/save$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return;

      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      const exists = db.prepare('SELECT 1 FROM courses WHERE id = ?').get(courseId);
      if (!exists) return sendJson(res, 404, { error: 'Course not found' });

      db.prepare(`
        INSERT OR IGNORE INTO saved_courses (user_id, course_id)
        VALUES (?, ?)
      `).run(auth.user.id, courseId);

      return sendJson(res, 200, { saved: true });
    }

    if (req.method === 'POST' && /^\/api\/discover\/[^/]+\/unsave$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return;

      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      db.prepare(`
        DELETE FROM saved_courses
        WHERE user_id = ? AND course_id = ?
      `).run(auth.user.id, courseId);

      return sendJson(res, 200, { removed: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/my-products') {
      const auth = requireAuth(req, res);
      if (!auth) return;

      const query = (url.searchParams.get('query') || '').toLowerCase();
      return sendJson(res, 200, routes.myProducts(auth.user.id, query));
    }

    if (req.method === 'POST' && url.pathname === '/api/my-products/create') {
      const auth = requireAuth(req, res);
      if (!auth) return;

      const userId = auth.user.id;
      const body = await readBody(req);
      const id = body.id || `new-${Date.now()}`;
      const title = sanitizeText(body.title);
      const description = sanitizeText(body.description);
      const category = sanitizeText(body.category) || 'History';
      const level = sanitizeText(body.level) || 'beginner';
      const { accessMode, accessType, visibility } = resolveCourseAccessConfig(body);
      const templateKey = sanitizeText(body.templateKey) || 'classic';
      const allowLearnerUploads = Boolean(body.allowLearnerUploads);
      const learnerUploadNote = sanitizeText(body.learnerUploadNote);
      const coverImage = body.coverImage && typeof body.coverImage === 'object' ? body.coverImage : null;
      const currency = accessType === 'paid' ? sanitizeText(body.currency || 'PLN').toUpperCase() : null;
      const priceCents = accessType === 'paid' ? Number(body.priceCents || 0) : null;

      if (!title) return sendJson(res, 400, { error: 'Course title is required' });
      if (!['beginner', 'intermediate', 'advanced'].includes(level)) {
        return sendJson(res, 400, { error: 'Invalid level' });
      }
      if (!['public-free', 'public-paid', 'class-only'].includes(accessMode)) {
        return sendJson(res, 400, { error: 'Invalid access mode' });
      }
      if (accessType === 'paid' && (!Number.isFinite(priceCents) || Number(priceCents) <= 0)) {
        return sendJson(res, 400, { error: 'Paid course requires positive price' });
      }
      if (accessType === 'paid' && !getSellerConnectState(userId).sellerBillingReady) {
        return sendJson(res, 403, { error: 'Connect Stripe payouts in Account before creating a paid course.' });
      }

      const thumbnailUrl = coverImage ? saveCourseCoverFile(id, coverImage.mimeType, coverImage.base64Data) : '';

      db.prepare(`
        INSERT INTO courses (
          id, title, description, author_user_id, category, level, publish_status, visibility, access_type, price_cents, currency, thumbnail_url, template_key, allow_learner_uploads, learner_upload_note
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, title, description, userId, category, level, visibility, accessType, accessType === 'paid' ? Math.round(Number(priceCents)) : null, currency, thumbnailUrl, templateKey, allowLearnerUploads ? 1 : 0, learnerUploadNote);
      ensureCourseStatsRow(id);
      refreshCourseStorageStats(id);

      return sendJson(res, 201, { id, title });
    }

    if (req.method === 'PUT' && /^\/api\/my-products\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return;

      const userId = auth.user.id;
      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      const body = await readBody(req);

      const owned = db.prepare('SELECT id, thumbnail_url AS thumbnailUrl, access_type AS accessType FROM courses WHERE id = ? AND author_user_id = ?').get(courseId, userId);
      if (!owned) return sendJson(res, 404, { error: 'Course not found or access denied' });

      const title = sanitizeText(body.title);
      const description = sanitizeText(body.description);
      const category = sanitizeText(body.category) || 'History';
      const level = sanitizeText(body.level) || 'beginner';
      const { accessMode, accessType, visibility } = resolveCourseAccessConfig(body);
      const templateKey = sanitizeText(body.templateKey) || 'classic';
      const allowLearnerUploads = Boolean(body.allowLearnerUploads);
      const learnerUploadNote = sanitizeText(body.learnerUploadNote);
      const coverImage = body.coverImage && typeof body.coverImage === 'object' ? body.coverImage : null;
      const removeCoverImage = Boolean(body.removeCoverImage);
      const currency = accessType === 'paid' ? sanitizeText(body.currency || 'PLN').toUpperCase() : null;
      const priceCents = accessType === 'paid' ? Number(body.priceCents || 0) : null;

      if (!title) return sendJson(res, 400, { error: 'Course title is required' });
      if (!['beginner', 'intermediate', 'advanced'].includes(level)) {
        return sendJson(res, 400, { error: 'Invalid level' });
      }
      if (!['public-free', 'public-paid', 'class-only'].includes(accessMode)) {
        return sendJson(res, 400, { error: 'Invalid access mode' });
      }
      if (accessType === 'paid' && (!Number.isFinite(priceCents) || Number(priceCents) <= 0)) {
        return sendJson(res, 400, { error: 'Paid course requires positive price' });
      }
      if (accessType === 'paid' && owned.accessType !== 'paid' && !getSellerConnectState(userId).sellerBillingReady) {
        return sendJson(res, 403, { error: 'Connect Stripe payouts in Account before switching a course to paid access.' });
      }

      let nextThumbnailUrl = owned.thumbnailUrl || '';
      if (coverImage) {
        nextThumbnailUrl = saveCourseCoverFile(courseId, coverImage.mimeType, coverImage.base64Data);
        removeStoredCourseCoverIfLocal(owned.thumbnailUrl);
      } else if (removeCoverImage) {
        removeStoredCourseCoverIfLocal(owned.thumbnailUrl);
        nextThumbnailUrl = '';
      }

      db.prepare(`
        UPDATE courses
        SET title = ?, description = ?, category = ?, level = ?, visibility = ?, access_type = ?, price_cents = ?, currency = ?, thumbnail_url = ?, template_key = ?, allow_learner_uploads = ?, learner_upload_note = ?
        WHERE id = ? AND author_user_id = ?
      `).run(
        title,
        description,
        category,
        level,
        visibility,
        accessType,
        accessType === 'paid' ? Math.round(Number(priceCents)) : null,
        currency,
        nextThumbnailUrl,
        templateKey,
        allowLearnerUploads ? 1 : 0,
        learnerUploadNote,
        courseId,
        userId,
      );

      return sendJson(res, 200, { id: courseId, title });
    }

    if (req.method === 'POST' && /^\/api\/my-products\/[^/]+\/remove$/.test(url.pathname)) {
      const auth = requireAuth(req, res);
      if (!auth) return;

      const userId = auth.user.id;
      const courseId = decodeURIComponent(url.pathname.split('/')[3]);
      const owned = db.prepare('SELECT id FROM courses WHERE id = ? AND author_user_id = ?').get(courseId, userId);
      if (!owned) return sendJson(res, 404, { error: 'Course not found or access denied' });

      db.prepare('DELETE FROM saved_courses WHERE course_id = ?').run(courseId);
      db.prepare('DELETE FROM course_stars WHERE course_id = ?').run(courseId);
      db.prepare('DELETE FROM courses WHERE id = ? AND author_user_id = ?').run(courseId, userId);

      return sendJson(res, 200, { removed: true });
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/my-products/') && url.pathname.endsWith('/toggle-star')) {
      const auth = requireAuth(req, res);
      if (!auth) return;

      const userId = auth.user.id;
      const courseId = url.pathname.split('/')[3];
      const exists = db.prepare('SELECT 1 FROM course_stars WHERE user_id = ? AND course_id = ?').get(userId, courseId);

      if (exists) {
        db.prepare('DELETE FROM course_stars WHERE user_id = ? AND course_id = ?').run(userId, courseId);
      } else {
        db.prepare('INSERT INTO course_stars (user_id, course_id) VALUES (?, ?)').run(userId, courseId);
      }

      return sendJson(res, 200, { starred: !exists });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return sendJson(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`InteLections API running on ${API_ORIGIN}`);
});
