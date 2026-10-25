const AppError = require("../errors/AppError");
const config = require("./agent37ConfigService");

const requestTimeoutMs = 15000;

function ensureConfigured() {
  const current = config.getConfiguration();
  if (!current.apiKey) {
    throw new AppError("Configure an Agent37 API key to use deployment intelligence", 428, "AGENT37_NOT_CONFIGURED");
  }
  return current;
}

async function request(path, options = {}) {
  const current = ensureConfigured();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${current.apiBaseUrl}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${current.apiKey}`, "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new AppError(response.status === 401 || response.status === 403 ? "Agent37 rejected the API key" : "Agent37 is unavailable", response.status === 401 || response.status === 403 ? 401 : 502, "AGENT37_REQUEST_FAILED");
    }
    return response;
  } catch (error) {
    if (error.name === "AbortError") throw new AppError("Agent37 request timed out", 504, "AGENT37_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyAccess() {
  await request("/instances");
  return true;
}

async function verifyCandidate(candidate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${candidate.apiBaseUrl}/instances`, {
      headers: { Authorization: `Bearer ${candidate.apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new AppError(response.status === 401 || response.status === 403 ? "Agent37 rejected the API key" : "Agent37 is unavailable", response.status === 401 || response.status === 403 ? 401 : 502, "AGENT37_REQUEST_FAILED");
  } catch (error) {
    if (error.name === "AbortError") throw new AppError("Agent37 request timed out", 504, "AGENT37_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { ensureConfigured, verifyAccess, verifyCandidate };
