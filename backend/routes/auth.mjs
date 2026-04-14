export async function handleAuthRoutes(ctx, req, res, url) {
  const {
    FRONTEND_ORIGIN,
    OPENAI_API_KEY,
    OPENAI_QUIZ_MODEL,
    DEFAULT_DEMO_PASSWORD,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    STRIPE_PLATFORM_APPLICATION_FEE_PERCENT,
    readBody,
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
    db,
    getQuizGenerationAvailability,
    isGoogleOauthConfigured,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    oauthStates,
    upsertOauthUser,
    stripeService,
  } = ctx;

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readBody(req);
    const email = normalizeEmailAddress(body.email);
    const password = String(body.password || '');
    const firstName = sanitizeText(body.firstName).slice(0, 120);
    const lastName = sanitizeText(body.lastName).slice(0, 120);
    const role = ['Student', 'Teacher', 'Personal'].includes(String(body.role || '')) ? String(body.role) : 'Personal';

    if (!firstName || !lastName) return sendJson(res, 400, { error: 'First name and last name are required.' }), true;
    if (!isValidEmailAddress(email)) return sendJson(res, 400, { error: 'Enter a valid email address.' }), true;
    if (!isValidPassword(password)) return sendJson(res, 400, { error: 'Password must be at least 8 characters long.' }), true;
    if (getAuthUserRowByEmail(email)) return sendJson(res, 409, { error: 'An account with this email already exists.' }), true;

    const userId = `u-${ctx.crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO users (id, email, first_name, last_name, role, password_hash, password_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(userId, email, firstName, lastName, role, hashPassword(password));

    const user = getUserBase(userId);
    const sid = createSession(user.id, user.firstName || 'User');
    sendJson(res, 201, { user }, { 'Set-Cookie': sessionCookieValue(sid) });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req);
    const email = normalizeEmailAddress(body.email);
    const password = String(body.password || '');
    if (!email || !password) return sendJson(res, 400, { error: 'Email and password are required.' }), true;

    const authRow = getAuthUserRowByEmail(email);
    if (!authRow || !verifyPassword(password, authRow.passwordHash)) {
      return sendJson(res, 401, { error: 'Incorrect email or password.' }), true;
    }

    const user = getUserBase(authRow.id);
    const sid = createSession(user.id, user.firstName || 'User');
    sendJson(res, 200, { user }, { 'Set-Cookie': sessionCookieValue(sid) });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
    const body = await readBody(req);
    const email = normalizeEmailAddress(body.email);
    if (!isValidEmailAddress(email)) return sendJson(res, 400, { error: 'Enter a valid email address.' }), true;

    const authRow = getAuthUserRowByEmail(email);
    const responsePayload = { ok: true, message: 'If an account exists for this email, a reset link is ready.' };
    if (!authRow) return sendJson(res, 200, responsePayload), true;

    const { token, expiresAt } = createPasswordResetToken(authRow.id);
    sendJson(res, 200, {
      ...responsePayload,
      resetUrl: `${FRONTEND_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`,
      expiresAt,
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/reset-password') {
    const body = await readBody(req);
    const token = String(body.token || '').trim();
    const password = String(body.password || '');
    if (!token) return sendJson(res, 400, { error: 'Reset token is required.' }), true;
    if (!isValidPassword(password)) return sendJson(res, 400, { error: 'Password must be at least 8 characters long.' }), true;

    const resetRecord = getPasswordResetTokenRecord(token);
    if (!resetRecord || resetRecord.usedAt || Number(resetRecord.expiresAt) <= Date.now()) {
      return sendJson(res, 400, { error: 'This reset link is invalid or has already expired.' }), true;
    }

    updateUserPassword(resetRecord.userId, password);
    markPasswordResetTokenUsed(resetRecord.id);
    revokeAllUserSessions(resetRecord.userId);

    const user = getUserBase(resetRecord.userId);
    const sid = createSession(user.id, user.firstName || 'User');
    sendJson(res, 200, { user }, { 'Set-Cookie': sessionCookieValue(sid) });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/change-password') {
    const auth = requireAuth(req, res);
    if (!auth) return true;

    const body = await readBody(req);
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!currentPassword || !newPassword) return sendJson(res, 400, { error: 'Current password and new password are required.' }), true;
    if (!isValidPassword(newPassword)) return sendJson(res, 400, { error: 'New password must be at least 8 characters long.' }), true;

    const authRow = getAuthUserRowByEmail(auth.user.email);
    if (!authRow || !verifyPassword(currentPassword, authRow.passwordHash)) {
      return sendJson(res, 401, { error: 'Current password is incorrect.' }), true;
    }
    if (verifyPassword(newPassword, authRow.passwordHash)) {
      return sendJson(res, 400, { error: 'Choose a different password than the current one.' }), true;
    }

    updateUserPassword(auth.user.id, newPassword);
    sendJson(res, 200, { ok: true, message: 'Password updated successfully.' });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    deleteSessionFromRequest(req);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookieValue() });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const auth = authUserOrNull(req);
    if (!auth) return sendJson(res, 401, { error: 'Unauthorized' }), true;
    sendJson(res, 200, { user: auth.user });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/ai/status') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    const availability = getQuizGenerationAvailability(auth.user);
    sendJson(res, 200, {
      configured: Boolean(OPENAI_API_KEY),
      quizGenerationAvailable: availability.available,
      reason: availability.reason || '',
      model: availability.available ? OPENAI_QUIZ_MODEL : null,
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/demo-status') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    sendJson(res, 200, {
      environment: 'local-demo',
      demoPasswordConfigured: Boolean(DEFAULT_DEMO_PASSWORD),
      defaultDemoPassword: DEFAULT_DEMO_PASSWORD,
      ai: { configured: Boolean(OPENAI_API_KEY), model: OPENAI_QUIZ_MODEL || null },
      billing: {
        stripeConfigured: Boolean(stripeService.client),
        webhookConfigured: Boolean(STRIPE_WEBHOOK_SECRET),
        sellerMarketplaceFeePercent: STRIPE_PLATFORM_APPLICATION_FEE_PERCENT,
        testModeExpected: Boolean(STRIPE_SECRET_KEY && STRIPE_SECRET_KEY.startsWith('sk_test_')),
      },
      oauth: { googleConfigured: isGoogleOauthConfigured() },
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/oauth/google/url') {
    if (!isGoogleOauthConfigured()) {
      sendJson(res, 400, { error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
      return true;
    }

    const state = ctx.crypto.randomUUID();
    oauthStates.set(state, Date.now());
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.search = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    }).toString();

    sendJson(res, 200, { url: authUrl.toString() });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/oauth/google/callback') {
    const code = url.searchParams.get('code') || '';
    const state = url.searchParams.get('state') || '';
    const oauthError = url.searchParams.get('error');

    if (oauthError) return redirect(res, `${FRONTEND_ORIGIN}/login?error=${encodeURIComponent(oauthError)}`), true;

    const stateCreatedAt = oauthStates.get(state);
    oauthStates.delete(state);
    if (!stateCreatedAt || Date.now() - stateCreatedAt > 10 * 60_000) {
      return redirect(res, `${FRONTEND_ORIGIN}/login?error=invalid_state`), true;
    }
    if (!code) return redirect(res, `${FRONTEND_ORIGIN}/login?error=missing_code`), true;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) return redirect(res, `${FRONTEND_ORIGIN}/login?error=token_exchange_failed`), true;

    const tokenPayload = await tokenResponse.json();
    const accessToken = tokenPayload.access_token;
    if (!accessToken) return redirect(res, `${FRONTEND_ORIGIN}/login?error=missing_access_token`), true;

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileResponse.ok) return redirect(res, `${FRONTEND_ORIGIN}/login?error=profile_fetch_failed`), true;

    const profile = await profileResponse.json();
    const oauthUser = upsertOauthUser({
      email: profile.email,
      givenName: profile.given_name,
      familyName: profile.family_name,
      picture: profile.picture,
      providerUserId: profile.sub,
    });

    const sid = createSession(oauthUser.userId, oauthUser.name);
    redirect(res, `${FRONTEND_ORIGIN}/`, { 'Set-Cookie': sessionCookieValue(sid) });
    return true;
  }

  return false;
}
