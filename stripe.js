// routes/stripe.js — Stripe subscriptions + webhook
const express = require("express");
const db = require("../config/db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

function getStripe() {
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}

// Plan configuration
const PLANS = {
  student: { priceId: () => process.env.STRIPE_STUDENT_PRICE_ID, tokens: 25000 },
  pro: { priceId: () => process.env.STRIPE_PRO_PRICE_ID, tokens: 100000 },
};

// ──────────────────────────────────────────────
// Create Stripe Checkout Session
// ──────────────────────────────────────────────
router.post("/create-checkout", authMiddleware, async (req, res) => {
  try {
    const stripe = getStripe();
    const { plan } = req.body;
    const user = req.user;

    if (!PLANS[plan]) {
      return res.status(400).json({ error: "Invalid plan selected." });
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { user_id: String(user.id) },
      });
      customerId = customer.id;

      db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(
        customerId,
        user.id
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: PLANS[plan].priceId(),
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          user_id: String(user.id),
          plan_name: plan,
        },
      },
      success_url: `${process.env.FRONTEND_URL}?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}?payment=cancelled`,
      metadata: {
        user_id: String(user.id),
        plan_name: plan,
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session." });
  }
});

// ──────────────────────────────────────────────
// Get subscription status
// ──────────────────────────────────────────────
router.get("/subscription", authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    subscription_status: u.subscription_status,
    token_quota: u.token_quota,
    tokens_used: u.tokens_used,
    current_period_end: u.current_period_end,
  });
});

// ──────────────────────────────────────────────
// Customer portal (manage/cancel subscription)
// ──────────────────────────────────────────────
router.post("/customer-portal", authMiddleware, async (req, res) => {
  try {
    const stripe = getStripe();
    const user = req.user;

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: "No active subscription found." });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: process.env.FRONTEND_URL,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    console.error("Portal error:", err.message);
    res.status(500).json({ error: "Failed to open customer portal." });
  }
});

// ──────────────────────────────────────────────
// WEBHOOK — Stripe sends events here
// This route uses raw body (configured in server.js)
// ──────────────────────────────────────────────
router.post("/webhook", async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw body buffer
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  switch (event.type) {
    // ── invoice.paid — Subscription payment successful ──
    // This fires after Stripe receives the money and generates an invoice
    case "invoice.paid": {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const subscriptionId = invoice.subscription;

      try {
        // Get subscription details to find the plan
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const planName = subscription.metadata?.plan_name;
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        // Find user by stripe_customer_id
        const user = db
          .prepare("SELECT * FROM users WHERE stripe_customer_id = ?")
          .get(customerId);

        if (!user) {
          console.error(`[Webhook] No user found for customer: ${customerId}`);
          break;
        }

        // Determine token quota based on plan
        let tokenQuota = 500; // free default
        let status = "free";

        if (planName === "pro" || PLANS.pro.priceId() === invoice.lines?.data?.[0]?.price?.id) {
          tokenQuota = 100000;
          status = "pro";
        } else if (planName === "student" || PLANS.student.priceId() === invoice.lines?.data?.[0]?.price?.id) {
          tokenQuota = 25000;
          status = "student";
        }

        // RESET tokens_used to 0 and update quota (new billing period)
        db.prepare(`
          UPDATE users
          SET subscription_status = ?,
              token_quota = ?,
              tokens_used = 0,
              current_period_end = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(status, tokenQuota, periodEnd, user.id);

        console.log(
          `[Webhook] User ${user.email}: plan=${status}, quota=${tokenQuota}, tokens reset to 0, period_end=${periodEnd}`
        );
      } catch (err) {
        console.error("[Webhook] invoice.paid processing error:", err);
      }
      break;
    }

    // ── customer.subscription.deleted — Subscription cancelled ──
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      const user = db
        .prepare("SELECT * FROM users WHERE stripe_customer_id = ?")
        .get(customerId);

      if (user) {
        db.prepare(`
          UPDATE users
          SET subscription_status = 'free',
              token_quota = 500,
              tokens_used = 0,
              current_period_end = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(user.id);

        console.log(`[Webhook] User ${user.email}: subscription cancelled, reverted to free plan.`);
      }
      break;
    }

    // ── customer.subscription.updated — Plan changed ──
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const planName = subscription.metadata?.plan_name;

      if (planName && subscription.status === "active") {
        const user = db
          .prepare("SELECT * FROM users WHERE stripe_customer_id = ?")
          .get(customerId);

        if (user) {
          const plan = PLANS[planName];
          if (plan) {
            const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
            db.prepare(`
              UPDATE users
              SET subscription_status = ?,
                  token_quota = ?,
                  current_period_end = ?,
                  updated_at = datetime('now')
              WHERE id = ?
            `).run(planName, plan.tokens, periodEnd, user.id);

            console.log(`[Webhook] User ${user.email}: plan updated to ${planName}`);
          }
        }
      }
      break;
    }

    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }

  // Acknowledge receipt to Stripe
  res.json({ received: true });
});

module.exports = router;
