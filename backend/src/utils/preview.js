const env = require("../config/env");

function slugify(value, maxLength = 50) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength);
}

function previewSlug(projectName, branchName) {
  const project = slugify(projectName, 20) || "app";
  const branch = slugify(branchName, 32) || "preview";
  return `${project}-${branch}`;
}

function previewHost(projectName, branchName) {
  return `${env.PREVIEW_HOST_PREFIX}-${previewSlug(projectName, branchName)}.${env.PREVIEW_DOMAIN}`.toLowerCase();
}

function previewUrl(projectName, branchName, port) {
  const portSuffix = port ? `:${port}` : "";
  return `${env.PREVIEW_SCHEME}://${previewHost(projectName, branchName)}${portSuffix}`;
}

module.exports = { slugify, previewSlug, previewHost, previewUrl };
