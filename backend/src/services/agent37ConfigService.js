const fs = require("fs/promises");
const path = require("path");
const AppError = require("../errors/AppError");
const env = require("../config/env");

const dotenvPath = path.resolve(__dirname, "../../.env");
let configuration = {
  apiKey: env.AGENT37_API_KEY,
  apiBaseUrl: env.AGENT37_API_BASE_URL
};

function publicConfiguration() {
  return {
    configured: Boolean(configuration.apiKey),
    apiBaseUrl: configuration.apiBaseUrl
  };
}

function getConfiguration() {
  return { ...configuration };
}

function validateConfiguration({ apiKey, apiBaseUrl }) {
  if (typeof apiKey !== "string" || apiKey.trim().length < 8 || apiKey.length > 500 || /[\r\n]/.test(apiKey)) {
    throw new AppError("Enter a valid Agent37 API key", 400, "INVALID_AGENT37_KEY");
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(apiBaseUrl || configuration.apiBaseUrl);
  } catch {
    throw new AppError("Enter a valid Agent37 API URL", 400, "INVALID_AGENT37_URL");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new AppError("Agent37 API URL must use HTTPS", 400, "INVALID_AGENT37_URL");
  }
  return { apiKey: apiKey.trim(), apiBaseUrl: parsedUrl.toString().replace(/\/$/, "") };
}

function replaceSetting(content, key, value) {
  const line = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(content) ? content.replace(pattern, line) : `${content.replace(/\s*$/, "")}\n${line}\n`;
}

async function saveConfiguration(next) {
  let content = "";
  try {
    content = await fs.readFile(dotenvPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  content = replaceSetting(content, "AGENT37_ENABLED", "true");
  content = replaceSetting(content, "AGENT37_API_KEY", next.apiKey);
  content = replaceSetting(content, "AGENT37_API_BASE_URL", next.apiBaseUrl);
  const temporaryPath = `${dotenvPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, content, { mode: 0o600 });
  await fs.rename(temporaryPath, dotenvPath);
  configuration = next;
  return publicConfiguration();
}

module.exports = { getConfiguration, publicConfiguration, validateConfiguration, saveConfiguration };
