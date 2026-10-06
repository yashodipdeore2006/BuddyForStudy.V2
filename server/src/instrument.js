import "dotenv/config";
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || "development", tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1) });
}

export { Sentry };
