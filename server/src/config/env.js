import dotenv from "dotenv";
dotenv.config();
const required = ["MONGO_URI", "JWT_SECRET"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);

export const env = {
  nodeEnv: process.env.NODE_ENV || "development", port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI, jwtSecret: process.env.JWT_SECRET, jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "", googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "", googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  smtpHost: process.env.SMTP_HOST || "", smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "true", smtpUser: process.env.SMTP_USER || "", smtpPass: process.env.SMTP_PASS || "",
  mailFrom: process.env.MAIL_FROM || process.env.SMTP_USER || "",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || ""
};
