#!/usr/bin/env node
/**
 * Production hard-fail env audit.
 *
 * This script is intentionally stricter than local/dev checks. It should run
 * before production deploys and before `verify-production-schema.mjs`.
 */

const required = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "NODE_ENV",
  "TRUST_PROXY",
  "SESSION_BEHIND_PROXY",
  "CORS_ALLOWED_ORIGINS",
  "IYZICO_API_KEY",
  "IYZICO_SECRET_KEY",
  "SENTRY_DSN",
  "RELEASE_VERSION",
];

const missing = required.filter((key) => !String(process.env[key] || "").trim());
const errors = [];

if (missing.length > 0) {
  errors.push(`Missing required env: ${missing.join(", ")}`);
}

if (process.env.NODE_ENV !== "production") {
  errors.push("NODE_ENV must be production for deploy gate");
}

if (process.env.SKIP_SCHEMA_VERIFY === "1") {
  errors.push("SKIP_SCHEMA_VERIFY=1 is forbidden for production deploy gate");
}

if (process.env.BILLING_ALLOW_MOCK_IN_PRODUCTION === "true") {
  errors.push("BILLING_ALLOW_MOCK_IN_PRODUCTION=true is forbidden for normal production launch");
}

if (process.env.IYZICO_MODE && process.env.IYZICO_MODE.toLowerCase() === "mock") {
  errors.push("IYZICO_MODE=mock is forbidden for production deploy gate");
}

const sessionSecret = String(process.env.SESSION_SECRET || "");
if (sessionSecret && sessionSecret.length < 32) {
  errors.push("SESSION_SECRET must be at least 32 characters");
}

const release = String(process.env.RELEASE_VERSION || "");
if (release && ["dev", "development", "local", "latest"].includes(release.toLowerCase())) {
  errors.push("RELEASE_VERSION must be a real immutable release label, not dev/local/latest");
}

const cors = String(process.env.CORS_ALLOWED_ORIGINS || "");
if (cors.includes("localhost") || cors.includes("*")) {
  errors.push("CORS_ALLOWED_ORIGINS must not include localhost or wildcard in production");
}

if (errors.length > 0) {
  console.error("verify-production-env: FAILED");
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log("verify-production-env: OK");

