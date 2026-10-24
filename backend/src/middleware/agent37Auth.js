const AppError = require("../errors/AppError");
const env = require("../config/env");

function agent37Auth(request, response, next) {
  if (!env.AGENT37_ROUTE_TOKEN) {
    return next(new AppError("Agent37 routes are not configured for access", 503, "AGENT37_ROUTES_NOT_CONFIGURED"));
  }
  if (request.get("X-DeployForge-Agent-Token") !== env.AGENT37_ROUTE_TOKEN) {
    return next(new AppError("Agent37 authorization required", 401, "AGENT37_UNAUTHORIZED"));
  }
  return next();
}

module.exports = agent37Auth;
