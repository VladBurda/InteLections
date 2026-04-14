import Stripe from 'stripe';

export function createStripeService(config, deps) {
  const {
    secretKey = '',
    webhookSecret = '',
    frontendOrigin = '',
    billingReturnUrl = '',
    subscriptionSuccessUrl = '',
    subscriptionCancelUrl = '',
    courseSuccessUrl = '',
    courseCancelUrl = '',
    connectReturnUrl = '',
    connectRefreshUrl = '',
    applicationFeePercent = 1,
    intelectionsPlusPriceId = '',
    defaultCoursePriceCurrency = 'PLN',
  } = config;

  const {
    db,
    slugId,
    hasBillingBypass,
    refreshUserOwnedCourseStorageStats,
  } = deps;

  const stripe = secretKey ? new Stripe(secretKey) : null;

  function isConfigured() {
    return Boolean(stripe && secretKey);
  }

  function getStripeDateTime(value) {
    if (!value) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return new Date(numeric * 1000).toISOString();
  }

  function getSellerStripeAccountRecord(userId) {
    if (!userId) return null;
    const row = db.prepare(`
      SELECT user_id AS userId,
             stripe_account_id AS stripeAccountId,
             details_submitted AS detailsSubmitted,
             charges_enabled AS chargesEnabled,
             payouts_enabled AS payoutsEnabled,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM seller_stripe_accounts
      WHERE user_id = ?
    `).get(userId);

    if (!row) return null;
    return {
      userId: row.userId,
      stripeAccountId: row.stripeAccountId,
      detailsSubmitted: Boolean(row.detailsSubmitted),
      chargesEnabled: Boolean(row.chargesEnabled),
      payoutsEnabled: Boolean(row.payoutsEnabled),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  function getSellerConnectStateFromRecord(record) {
    const sellerStripeConnected = Boolean(record?.stripeAccountId);
    const sellerBillingReady = Boolean(record?.chargesEnabled) && Boolean(record?.payoutsEnabled);
    return {
      sellerStripeConnected,
      sellerStripeAccountId: record?.stripeAccountId || null,
      sellerBillingReady,
      connectedAccountStatus: sellerStripeConnected ? (sellerBillingReady ? 'ready' : 'pending') : 'not_connected',
      canSellPaidCourses: sellerBillingReady,
    };
  }

  function getSellerConnectState(userOrUserId) {
    if (!userOrUserId) {
      return getSellerConnectStateFromRecord(null);
    }

    if (typeof userOrUserId === 'string') {
      return getSellerConnectStateFromRecord(getSellerStripeAccountRecord(userOrUserId));
    }

    if (Object.prototype.hasOwnProperty.call(userOrUserId, 'sellerStripeAccountId') || Object.prototype.hasOwnProperty.call(userOrUserId, 'sellerStripeConnected')) {
      return getSellerConnectStateFromRecord({
        stripeAccountId: userOrUserId.sellerStripeAccountId,
        chargesEnabled: userOrUserId.sellerBillingReady,
        payoutsEnabled: userOrUserId.sellerBillingReady,
      });
    }

    return getSellerConnectStateFromRecord(getSellerStripeAccountRecord(userOrUserId.id || ''));
  }

  function upsertSellerStripeAccountRecord({ userId, stripeAccountId, detailsSubmitted = false, chargesEnabled = false, payoutsEnabled = false }) {
    if (!userId || !stripeAccountId) return;

    db.prepare(`
      INSERT INTO seller_stripe_accounts (user_id, stripe_account_id, details_submitted, charges_enabled, payouts_enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        stripe_account_id = excluded.stripe_account_id,
        details_submitted = excluded.details_submitted,
        charges_enabled = excluded.charges_enabled,
        payouts_enabled = excluded.payouts_enabled,
        updated_at = datetime('now')
    `).run(
      userId,
      stripeAccountId,
      detailsSubmitted ? 1 : 0,
      chargesEnabled ? 1 : 0,
      payoutsEnabled ? 1 : 0,
    );
  }

  async function syncSellerStripeAccountStatus(userId, stripeAccountId = '') {
    if (!isConfigured()) throw new Error('Stripe Connect is not configured on the backend');

    const accountId = stripeAccountId || getSellerStripeAccountRecord(userId)?.stripeAccountId || '';
    if (!accountId) {
      return getSellerConnectStateFromRecord(null);
    }

    const account = await stripe.accounts.retrieve(accountId);
    upsertSellerStripeAccountRecord({
      userId,
      stripeAccountId: account.id,
      detailsSubmitted: Boolean(account.details_submitted),
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
    });

    return getSellerConnectStateFromRecord({
      stripeAccountId: account.id,
      detailsSubmitted: Boolean(account.details_submitted),
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
    });
  }

  async function ensureSellerStripeAccount(user) {
    if (!isConfigured()) throw new Error('Stripe Connect is not configured on the backend');

    const existing = getSellerStripeAccountRecord(user.id);
    if (existing?.stripeAccountId) {
      return existing.stripeAccountId;
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'PL',
      email: user.email || undefined,
      business_type: 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        userId: user.id,
      },
    });

    upsertSellerStripeAccountRecord({
      userId: user.id,
      stripeAccountId: account.id,
      detailsSubmitted: Boolean(account.details_submitted),
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
    });

    return account.id;
  }

  async function createSellerConnectAccessLink(user) {
    if (!isConfigured()) throw new Error('Stripe Connect is not configured on the backend');

    const stripeAccountId = await ensureSellerStripeAccount(user);
    const state = await syncSellerStripeAccountStatus(user.id, stripeAccountId);

    if (state.sellerBillingReady) {
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
      return {
        url: loginLink.url,
        state,
        destination: 'dashboard',
      };
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: connectRefreshUrl,
      return_url: connectReturnUrl,
      type: 'account_onboarding',
    });

    return {
      url: accountLink.url,
      state,
      destination: 'onboarding',
    };
  }

  function getStripeErrorMessage(error, fallback = 'Stripe request failed') {
    if (error && typeof error === 'object') {
      const candidate = error.raw?.message || error.message;
      if (candidate) return String(candidate);
    }
    return fallback;
  }

  function getPlatformApplicationFeeAmount(amountCents) {
    const normalizedAmount = Math.max(0, Math.round(Number(amountCents || 0)));
    if (normalizedAmount <= 0 || applicationFeePercent <= 0) {
      return 0;
    }

    const calculated = Math.round((normalizedAmount * applicationFeePercent) / 100);
    return Math.min(normalizedAmount, Math.max(1, calculated));
  }

  function isSubscriptionActiveStatus(status = '') {
    return ['trialing', 'active', 'past_due'].includes(String(status || '').toLowerCase());
  }

  function getStripeCustomerIdForUser(userId) {
    if (!userId) return '';
    const row = db.prepare(`
      SELECT stripe_customer_id AS stripeCustomerId
      FROM billing_customers
      WHERE user_id = ?
    `).get(userId);
    return row?.stripeCustomerId || '';
  }

  function getUserIdByStripeCustomerId(stripeCustomerId) {
    if (!stripeCustomerId) return '';
    const row = db.prepare(`
      SELECT user_id AS userId
      FROM billing_customers
      WHERE stripe_customer_id = ?
    `).get(stripeCustomerId);
    return row?.userId || '';
  }

  function upsertStripeCustomer(userId, stripeCustomerId) {
    if (!userId || !stripeCustomerId) return;
    db.prepare(`
      INSERT INTO billing_customers (user_id, stripe_customer_id, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        stripe_customer_id = excluded.stripe_customer_id,
        updated_at = datetime('now')
    `).run(userId, stripeCustomerId);
  }

  function setUserSubscriptionPlanFromBilling(userId, active, startedAt = null) {
    if (!userId) return;
    if (active) {
      db.prepare(`
        UPDATE users
        SET subscription_plan = 'plus',
            subscription_started_at = COALESCE(subscription_started_at, ?)
        WHERE id = ?
      `).run(startedAt || new Date().toISOString(), userId);
    } else {
      db.prepare(`
        UPDATE users
        SET subscription_plan = CASE WHEN role = 'Admin' THEN subscription_plan ELSE 'free' END,
            subscription_started_at = CASE WHEN role = 'Admin' THEN subscription_started_at ELSE NULL END
        WHERE id = ?
      `).run(userId);
    }
    refreshUserOwnedCourseStorageStats(userId);
  }

  function upsertBillingSubscriptionRecord({ stripeSubscriptionId, userId, stripeCustomerId, planKey = 'intelections_plus', status, currentPeriodEnd = null, cancelAtPeriodEnd = false }) {
    if (!stripeSubscriptionId || !userId || !stripeCustomerId) return;

    db.prepare(`
      INSERT INTO billing_subscriptions (stripe_subscription_id, user_id, stripe_customer_id, plan_key, status, current_period_end, cancel_at_period_end, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(stripe_subscription_id) DO UPDATE SET
        user_id = excluded.user_id,
        stripe_customer_id = excluded.stripe_customer_id,
        plan_key = excluded.plan_key,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        updated_at = datetime('now')
    `).run(stripeSubscriptionId, userId, stripeCustomerId, planKey, status, currentPeriodEnd, cancelAtPeriodEnd ? 1 : 0);

    setUserSubscriptionPlanFromBilling(userId, isSubscriptionActiveStatus(status));
  }

  async function ensureStripeCustomer(user) {
    if (!isConfigured()) throw new Error('Stripe billing is not configured on the backend');
    const existing = getStripeCustomerIdForUser(user.id);
    if (existing) return existing;

    const customer = await stripe.customers.create({
      email: user.email || undefined,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      metadata: {
        userId: user.id,
      },
    });

    upsertStripeCustomer(user.id, customer.id);
    return customer.id;
  }

  function buildCourseSuccessUrl(courseId, type) {
    return (type === 'cancel' ? courseCancelUrl : courseSuccessUrl).replace('{COURSE_ID}', encodeURIComponent(courseId));
  }

  function upsertCoursePurchaseRecord({ checkoutSessionId, paymentIntentId = '', courseId, userId, amountCents, currency, status = 'pending' }) {
    if (!checkoutSessionId || !courseId || !userId) return;

    db.prepare(`
      INSERT INTO course_purchases (id, course_id, user_id, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, currency, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(stripe_checkout_session_id) DO UPDATE SET
        stripe_payment_intent_id = CASE
          WHEN excluded.stripe_payment_intent_id <> '' THEN excluded.stripe_payment_intent_id
          ELSE course_purchases.stripe_payment_intent_id
        END,
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        status = excluded.status,
        updated_at = datetime('now')
    `).run(
      slugId('purchase'),
      courseId,
      userId,
      checkoutSessionId,
      paymentIntentId,
      Math.max(0, Number(amountCents || 0)),
      String(currency || defaultCoursePriceCurrency).toUpperCase(),
      status,
    );
  }

  function getLatestCoursePurchase(userId, courseId) {
    if (!userId || !courseId) return null;

    const row = db.prepare(`
      SELECT id,
             course_id AS courseId,
             user_id AS userId,
             stripe_checkout_session_id AS checkoutSessionId,
             stripe_payment_intent_id AS paymentIntentId,
             amount_cents AS amountCents,
             currency,
             status,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM course_purchases
      WHERE user_id = ? AND course_id = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `).get(userId, courseId);

    if (!row) return null;

    return {
      id: row.id,
      courseId: row.courseId,
      userId: row.userId,
      checkoutSessionId: row.checkoutSessionId || '',
      paymentIntentId: row.paymentIntentId || '',
      amountCents: Number(row.amountCents || 0),
      currency: row.currency || defaultCoursePriceCurrency,
      status: row.status || 'none',
      createdAt: row.createdAt || '',
      updatedAt: row.updatedAt || '',
    };
  }

  function getCoursePurchaseAccess(userOrUserId, courseId) {
    if (!userOrUserId || !courseId) return null;

    if (typeof userOrUserId !== 'string' && hasBillingBypass(userOrUserId)) {
      return {
        id: `admin-bypass-${courseId}-${userOrUserId.id || 'viewer'}`,
        courseId,
        userId: userOrUserId.id || '',
        checkoutSessionId: '',
        paymentIntentId: '',
        amountCents: 0,
        currency: defaultCoursePriceCurrency,
        status: 'paid',
        createdAt: '',
        updatedAt: '',
      };
    }

    const userId = typeof userOrUserId === 'string' ? userOrUserId : userOrUserId.id;
    const purchase = getLatestCoursePurchase(userId, courseId);
    return purchase?.status === 'paid' ? purchase : null;
  }

  function markCoursePurchaseFailed({ checkoutSessionId = '', paymentIntentId = '', courseId = '', userId = '' }) {
    if (checkoutSessionId) {
      const result = db.prepare(`
        UPDATE course_purchases
        SET status = 'failed', updated_at = datetime('now')
        WHERE stripe_checkout_session_id = ? AND status <> 'paid'
      `).run(checkoutSessionId);
      if ((result.changes || 0) > 0) return;
    }

    if (paymentIntentId) {
      const result = db.prepare(`
        UPDATE course_purchases
        SET status = 'failed', updated_at = datetime('now')
        WHERE stripe_payment_intent_id = ? AND status <> 'paid'
      `).run(paymentIntentId);
      if ((result.changes || 0) > 0) return;
    }

    if (courseId && userId) {
      db.prepare(`
        UPDATE course_purchases
        SET status = 'failed', updated_at = datetime('now')
        WHERE id = (
          SELECT id
          FROM course_purchases
          WHERE course_id = ? AND user_id = ? AND status <> 'paid'
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        )
      `).run(courseId, userId);
    }
  }

  function markCoursePurchasePaid({ checkoutSessionId, paymentIntentId = '', courseId, userId, amountCents, currency }) {
    if (!checkoutSessionId || !courseId || !userId) return;

    upsertCoursePurchaseRecord({
      checkoutSessionId,
      paymentIntentId,
      courseId,
      userId,
      amountCents,
      currency,
      status: 'paid',
    });

    db.prepare(`
      INSERT INTO course_enrollments (id, course_id, user_id, status)
      VALUES (?, ?, ?, 'active')
      ON CONFLICT(course_id, user_id) DO UPDATE SET status = 'active'
    `).run(slugId('enrollment'), courseId, userId);

    db.prepare(`
      INSERT OR IGNORE INTO saved_courses (user_id, course_id)
      VALUES (?, ?)
    `).run(userId, courseId);

    db.prepare(`
      UPDATE course_stats
      SET students = (
        SELECT COUNT(*) FROM course_enrollments WHERE course_id = ? AND status = 'active'
      )
      WHERE course_id = ?
    `).run(courseId, courseId);
  }

  async function syncStripeSubscriptionToUser(subscriptionId, fallbackUserId = '', fallbackCustomerId = '') {
    if (!isConfigured() || !subscriptionId) return;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : (subscription.customer?.id || fallbackCustomerId || '');
    const userId = fallbackUserId || getUserIdByStripeCustomerId(stripeCustomerId) || (subscription.metadata?.userId || '');
    if (!userId || !stripeCustomerId) return;
    upsertStripeCustomer(userId, stripeCustomerId);
    upsertBillingSubscriptionRecord({
      stripeSubscriptionId: subscription.id,
      userId,
      stripeCustomerId,
      status: subscription.status,
      currentPeriodEnd: getStripeDateTime(subscription.current_period_end),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    });
  }

  async function handleStripeWebhookEvent(event) {
    if (!event || !event.type) return;

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.expired') {
      const session = event.data.object;
      const metadata = session.metadata || {};

      if (metadata.kind === 'intelections_plus_subscription' && event.type === 'checkout.session.completed') {
        const userId = metadata.userId || '';
        const stripeCustomerId = typeof session.customer === 'string' ? session.customer : '';
        if (userId && stripeCustomerId) {
          upsertStripeCustomer(userId, stripeCustomerId);
        }
        if (session.subscription) {
          await syncStripeSubscriptionToUser(String(session.subscription), userId, stripeCustomerId);
        }
        return;
      }

      if (metadata.kind === 'course_purchase') {
        if (event.type === 'checkout.session.completed') {
          markCoursePurchasePaid({
            checkoutSessionId: session.id,
            paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : '',
            courseId: metadata.courseId || '',
            userId: metadata.userId || '',
            amountCents: session.amount_total || 0,
            currency: session.currency || defaultCoursePriceCurrency,
          });
        } else {
          markCoursePurchaseFailed({
            checkoutSessionId: session.id,
            paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : '',
            courseId: metadata.courseId || '',
            userId: metadata.userId || '',
          });
        }
        return;
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      const metadata = intent.metadata || {};
      if (metadata.kind === 'course_purchase') {
        const stripeCustomerId = typeof intent.customer === 'string' ? intent.customer : (intent.customer?.id || '');
        markCoursePurchaseFailed({
          paymentIntentId: intent.id,
          courseId: metadata.courseId || '',
          userId: metadata.userId || getUserIdByStripeCustomerId(stripeCustomerId),
        });
        return;
      }
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : (subscription.customer?.id || '');
      const userId = getUserIdByStripeCustomerId(stripeCustomerId) || (subscription.metadata?.userId || '');
      if (!userId || !stripeCustomerId) return;
      upsertStripeCustomer(userId, stripeCustomerId);
      upsertBillingSubscriptionRecord({
        stripeSubscriptionId: subscription.id,
        userId,
        stripeCustomerId,
        status: subscription.status,
        currentPeriodEnd: getStripeDateTime(subscription.current_period_end),
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      });
      return;
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id || '');
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription?.id || '');
      const userId = getUserIdByStripeCustomerId(stripeCustomerId);
      if (userId && subscriptionId) {
        await syncStripeSubscriptionToUser(subscriptionId, userId, stripeCustomerId);
      }
    }
  }

  return {
    client: stripe,
    secretKey,
    webhookSecret,
    intelectionsPlusPriceId,
    subscriptionSuccessUrl,
    subscriptionCancelUrl,
    billingReturnUrl,
    connectReturnUrl,
    connectRefreshUrl,
    frontendOrigin,
    applicationFeePercent,
    defaultCoursePriceCurrency,
    getLatestCoursePurchase,
    getCoursePurchaseAccess,
    isConfigured,
    getSellerConnectStateFromRecord,
    getSellerConnectState,
    syncSellerStripeAccountStatus,
    ensureSellerStripeAccount,
    getPlatformApplicationFeeAmount,
    createSellerConnectAccessLink,
    getStripeErrorMessage,
    getStripeCustomerIdForUser,
    getUserIdByStripeCustomerId,
    ensureStripeCustomer,
    buildCourseSuccessUrl,
    upsertCoursePurchaseRecord,
    markCoursePurchasePaid,
    markCoursePurchaseFailed,
    handleStripeWebhookEvent,
    createWebhookEvent(rawBody, signature) {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    },
  };
}
