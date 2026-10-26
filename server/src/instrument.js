import "dotenv/config";
import * as Sentry from "@sentry/node";
import { sanitizeSentryEvent } from "./utils/sentryEventSanitizer.js";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    beforeSend: sanitizeSentryEvent,
  });
}

export { Sentry };
