function asDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const numeric = Number(value);
    value = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  } else value = new Date(value);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function formatBillingNotificationDate(value) {
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata"
  }).format(date) : "";
}

function str(value) {
  return value === null || value === undefined ? "" : String(value);
}

function amountText(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)
    : str(value);
}

export function buildCoursePurchaseNotificationPayload({ userId, payment, course, enrollment }) {
  const courseId = str(course?._id || payment?.course);
  const paymentId = str(payment?._id);
  const courseTitle = str(course?.title) || "your course";
  const currency = (str(payment?.currency) || "INR").toUpperCase();
  const amount = str(payment?.amount);
  const purchaseDate = formatBillingNotificationDate(payment?.paidAt || payment?.createdAt);
  const paymentReference = str(payment?.providerPaymentId) || paymentId || "Not available";
  const enrollmentId = str(enrollment?._id);
  return {
    userId: str(userId || payment?.user),
    title: "Course purchase confirmed",
    message: "Your payment of " + currency + " " + amountText(payment?.amount) +
      " for \"" + courseTitle + "\"" + (purchaseDate ? " was verified on " + purchaseDate : " was verified") +
      ". Payment reference: " + paymentReference + ". Your enrollment is confirmed. Open your course roadmap to start learning.",
    type: "billing",
    link: "/courses/" + courseId + "/roadmap",
    eventKey: "course-purchase-confirmed:" + paymentId,
    emailSubject: "Your BuddyForStudy course purchase is confirmed",
    metadata: { paymentId, courseId, courseTitle, amount, currency, purchaseDate, paymentReference, enrollmentId },
    templateKeys: { notification: "course-purchase-confirmed-in-app", email: "course-purchase-confirmed-email" }
  };
}

export function buildSubscriptionActivatedNotificationPayload({ userId, payment, plan, subscription, subscriptionId }) {
  const resolvedSubscriptionId = str(subscriptionId || subscription?.providerSubscriptionId || subscription?.id || payment?.providerOrderId);
  const planName = str(plan?.name) || "BuddyForStudy";
  const billingInterval = str(plan?.billingInterval) || "recurring";
  const currency = (str(payment?.currency || plan?.currency) || "INR").toUpperCase();
  const amount = str(payment?.amount ?? plan?.price);
  const currentPeriodStart = formatBillingNotificationDate(subscription?.currentPeriodStart ?? subscription?.current_start);
  const currentPeriodEnd = formatBillingNotificationDate(subscription?.currentPeriodEnd ?? subscription?.current_end);
  let periodSummary = "See Billing for the current billing period dates.";
  if (currentPeriodStart && currentPeriodEnd) periodSummary = currentPeriodStart + " – " + currentPeriodEnd;
  else if (currentPeriodStart) periodSummary = "Starting " + currentPeriodStart + "; the end date was not provided by the payment provider.";
  else if (currentPeriodEnd) periodSummary = "Ending " + currentPeriodEnd + "; the start date was not provided by the payment provider.";
  return {
    userId: str(userId || payment?.user),
    title: "Your subscription is active",
    message: "Your " + planName + " plan is active with " + billingInterval + " billing. Payment of " +
      currency + " " + amountText(payment?.amount ?? plan?.price) + " is confirmed. Current billing period: " + periodSummary,
    type: "billing",
    link: "/billing",
    eventKey: "subscription-activated:" + resolvedSubscriptionId,
    emailSubject: "Your BuddyForStudy subscription is active",
    metadata: {
      paymentId: str(payment?._id), subscriptionId: resolvedSubscriptionId,
      planId: str(plan?._id || payment?.plan), planName, billingInterval, amount, currency,
      currentPeriodStart, currentPeriodEnd, periodSummary
    },
    templateKeys: { notification: "subscription-activated-in-app", email: "subscription-activated-email" }
  };
}
