const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const env = require("../config/env");

const corsMiddleware = cors({
  origin: env.FRONTEND_ORIGIN,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly.", code: "RATE_LIMITED" }
});

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith("$") && !key.includes("."))
      .map(([key, item]) => [key, sanitizeValue(item)])
  );
}

function sanitizeBody(request, response, next) {
  if (request.body && typeof request.body === "object") {
    request.body = sanitizeValue(request.body);
  }
  next();
}

module.exports = { corsMiddleware, helmetMiddleware: helmet(), sanitizeBody, apiLimiter };
