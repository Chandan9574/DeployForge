const crypto = require("crypto");
const env = require("../config/env");
const AppError = require("../errors/AppError");

function apiAuth(request, response, next) {
  if (!env.API_TOKEN) return next();

  const header = request.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : request.get("x-deployforge-token") || "";
  const expected = Buffer.from(env.API_TOKEN);
  const received = Buffer.from(token);

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return next(new AppError("Unauthorized", 401, "UNAUTHORIZED"));
  }
  return next();
}

module.exports = apiAuth;
