export async function handleBillingRoutes(ctx, req, res, url) {
  const {
    FRONTEND_ORIGIN,
    DEFAULT_COURSE_PRICE_CURRENCY,
    readRawBody,
    sendJson,
    requireAuth,
    hasBillingBypass,
    hasIntelectionsPlus,
    isStripeConfigured,
    ensureStripeCustomer,
    handleStripeWebhookEvent,
    getSellerConnectState,
    getLatestCoursePurchase,
    getCourseAccessMode,
    getPlatformApplicationFeeAmount,
    buildCourseSuccessUrl,
    upsertCoursePurchaseRecord,
    markCoursePurchasePaid,
    getUserBase,
    db,
    stripe,
    stripeService,
  } = ctx;

  if (req.method === 'POST' && url.pathname === '/api/billing/webhook') {
    if (!isStripeConfigured() || !stripeService.webhookSecret) {
      sendJson(res, 503, { error: 'Stripe webhooks are not configured' });
      return true;
    }

    const signature = req.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) {
      sendJson(res, 400, { error: 'Missing Stripe signature' });
      return true;
    }

    try {
      const rawBody = await readRawBody(req, 2_000_000);
      const event = stripeService.createWebhookEvent(rawBody, signature);
      await handleStripeWebhookEvent(event);
      sendJson(res, 200, { received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid Stripe webhook';
      console.error('[stripe webhook]', message);
      sendJson(res, 400, { error: message });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/billing/intelections-plus/checkout') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (hasBillingBypass(auth.user)) return sendJson(res, 200, { bypassed: true, url: `${FRONTEND_ORIGIN}/account` }), true;
    if (!isStripeConfigured() || !stripeService.intelectionsPlusPriceId) {
      return sendJson(res, 503, { error: 'Stripe subscription billing is not configured yet' }), true;
    }
    if (hasIntelectionsPlus(auth.user)) {
      return sendJson(res, 200, { alreadyActive: true, url: `${FRONTEND_ORIGIN}/account` }), true;
    }

    try {
      const customerId = await ensureStripeCustomer(auth.user);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        success_url: stripeService.subscriptionSuccessUrl,
        cancel_url: stripeService.subscriptionCancelUrl,
        line_items: [{ price: stripeService.intelectionsPlusPriceId, quantity: 1 }],
        metadata: { kind: 'intelections_plus_subscription', userId: auth.user.id },
        subscription_data: { metadata: { kind: 'intelections_plus_subscription', userId: auth.user.id } },
        allow_promotion_codes: true,
      });

      sendJson(res, 200, { url: session.url });
    } catch (error) {
      sendJson(res, 502, { error: stripeService.getStripeErrorMessage(error, 'Could not open Stripe Checkout right now.') });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/billing/portal') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (hasBillingBypass(auth.user)) return sendJson(res, 200, { bypassed: true, url: `${FRONTEND_ORIGIN}/account` }), true;
    if (!isStripeConfigured()) return sendJson(res, 503, { error: 'Stripe billing portal is not configured yet' }), true;

    const customerId = stripeService.getStripeCustomerIdForUser(auth.user.id);
    if (!customerId) return sendJson(res, 400, { error: 'No Stripe customer exists for this account yet' }), true;

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: stripeService.billingReturnUrl,
      });

      sendJson(res, 200, { url: session.url });
    } catch (error) {
      sendJson(res, 502, { error: stripeService.getStripeErrorMessage(error, 'Could not open Stripe billing portal right now.') });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/billing/link-existing-plus') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (hasBillingBypass(auth.user)) return sendJson(res, 200, { bypassed: true, linked: true, url: `${FRONTEND_ORIGIN}/account` }), true;
    if (!isStripeConfigured()) return sendJson(res, 503, { error: 'Stripe billing is not configured yet' }), true;
    if (!hasIntelectionsPlus(auth.user)) return sendJson(res, 400, { error: 'Only existing InteLections+ accounts can be linked' }), true;

    const existingCustomerId = stripeService.getStripeCustomerIdForUser(auth.user.id);
    const customerId = existingCustomerId || await ensureStripeCustomer(auth.user);
    sendJson(res, 200, {
      linked: true,
      customerId,
      message: 'This account is now linked to Stripe customer data. You can continue with billing from this linked profile.',
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/billing/seller-connect/onboarding') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (!isStripeConfigured()) return sendJson(res, 503, { error: 'Stripe Connect is not configured yet' }), true;
    if (auth.user.role === 'Student') return sendJson(res, 403, { error: 'Student mode cannot onboard as a course seller' }), true;

    try {
      const link = await stripeService.createSellerConnectAccessLink(auth.user);
      sendJson(res, 200, link);
    } catch (error) {
      sendJson(res, 502, { error: stripeService.getStripeErrorMessage(error, 'Could not open Stripe seller setup right now.') });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/billing/seller-connect/sync') {
    const auth = requireAuth(req, res);
    if (!auth) return true;
    if (!isStripeConfigured()) return sendJson(res, 503, { error: 'Stripe Connect is not configured yet' }), true;

    const existingAccount = stripeService.getSellerConnectState(auth.user.id);
    if (existingAccount?.sellerStripeAccountId) {
      await ctx.syncSellerStripeAccountStatus(auth.user.id, existingAccount.sellerStripeAccountId);
    }

    sendJson(res, 200, { user: getUserBase(auth.user.id) });
    return true;
  }

  if (req.method === 'POST' && /^\/api\/courses\/[^/]+\/checkout$/.test(url.pathname)) {
    const auth = requireAuth(req, res);
    if (!auth) return true;

    const courseId = decodeURIComponent(url.pathname.split('/')[3]);
    const course = db.prepare(`
      SELECT id, title, description, publish_status AS publishStatus, visibility, access_type AS accessType, price_cents AS priceCents, currency, author_user_id AS authorUserId
      FROM courses
      WHERE id = ?
    `).get(courseId);

    if (!course) return sendJson(res, 404, { error: 'Course not found' }), true;
    if (hasBillingBypass(auth.user)) {
      markCoursePurchasePaid({
        checkoutSessionId: `admin-bypass-${courseId}-${auth.user.id}`,
        courseId,
        userId: auth.user.id,
        amountCents: Number(course.priceCents || 0),
        currency: course.currency || DEFAULT_COURSE_PRICE_CURRENCY,
      });
      return sendJson(res, 200, { bypassed: true, purchaseStatus: 'paid', url: `${FRONTEND_ORIGIN}/course/${encodeURIComponent(courseId)}` }), true;
    }
    if (!isStripeConfigured()) return sendJson(res, 503, { error: 'Stripe payments are not configured yet' }), true;
    if (course.authorUserId === auth.user.id) return sendJson(res, 403, { error: 'Course owners do not need to purchase their own course' }), true;
    if (course.publishStatus !== 'published' || getCourseAccessMode(course) !== 'public-paid') {
      return sendJson(res, 400, { error: 'This course is not available for paid public checkout' }), true;
    }
    if (Math.max(0, Number(course.priceCents || 0)) <= 0) {
      return sendJson(res, 400, { error: 'This paid course does not have a valid checkout price yet' }), true;
    }

    const sellerConnectState = getSellerConnectState(course.authorUserId);
    if (!sellerConnectState.sellerBillingReady || !sellerConnectState.sellerStripeAccountId) {
      return sendJson(res, 409, { error: 'The course author has not finished Stripe payouts onboarding yet, so this paid checkout is not available right now.' }), true;
    }

    const existingPurchase = getLatestCoursePurchase(auth.user.id, courseId);
    if (existingPurchase?.status === 'paid') {
      return sendJson(res, 200, { alreadyPurchased: true, purchaseStatus: 'paid', url: `${FRONTEND_ORIGIN}/course/${encodeURIComponent(courseId)}` }), true;
    }

    try {
      const customerId = await ensureStripeCustomer(auth.user);
      const amountCents = Math.max(0, Number(course.priceCents || 0));
      const courseCurrency = String(course.currency || DEFAULT_COURSE_PRICE_CURRENCY).toLowerCase();
      const applicationFeeAmount = getPlatformApplicationFeeAmount(amountCents);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        payment_method_types: ['card'],
        success_url: buildCourseSuccessUrl(courseId, 'success'),
        cancel_url: buildCourseSuccessUrl(courseId, 'cancel'),
        line_items: [{
          price_data: {
            currency: courseCurrency,
            unit_amount: amountCents,
            product_data: {
              name: course.title,
              description: course.description || undefined,
              metadata: { courseId: course.id, kind: 'course_purchase' },
            },
          },
          quantity: 1,
        }],
        metadata: {
          kind: 'course_purchase',
          courseId: course.id,
          userId: auth.user.id,
          sellerStripeAccountId: sellerConnectState.sellerStripeAccountId,
        },
        payment_intent_data: {
          metadata: {
            kind: 'course_purchase',
            courseId: course.id,
            userId: auth.user.id,
            sellerStripeAccountId: sellerConnectState.sellerStripeAccountId,
          },
          application_fee_amount: applicationFeeAmount,
          transfer_data: { destination: sellerConnectState.sellerStripeAccountId },
        },
        allow_promotion_codes: true,
      });

      upsertCoursePurchaseRecord({
        checkoutSessionId: session.id,
        paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : '',
        courseId: course.id,
        userId: auth.user.id,
        amountCents,
        currency: course.currency || DEFAULT_COURSE_PRICE_CURRENCY,
        status: 'pending',
      });

      sendJson(res, 200, { url: session.url, purchaseStatus: 'pending' });
    } catch (error) {
      sendJson(res, 502, { error: stripeService.getStripeErrorMessage(error, 'Could not open paid course checkout right now.') });
    }
    return true;
  }

  return false;
}
