const fs = require("fs/promises");
const path = require("path");
const dns = require("dns").promises;
const net = require("net");
const { execFile } = require("child_process");
const { promisify } = require("util");
const env = require("../config/env");
const AppError = require("../errors/AppError");

const execFileAsync = promisify(execFile);

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  if (net.isIPv6(address)) {
    const value = address.toLowerCase();
    return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80");
  }
  return false;
}

async function assertRepositoryUrl(repositoryUrl) {
  let parsed;
  try {
    parsed = new URL(repositoryUrl);
  } catch {
    throw new AppError("Invalid repository URL", 400, "INVALID_REPOSITORY");
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new AppError("Only HTTP(S) repository URLs are allowed", 400, "INVALID_REPOSITORY");
  }
  if (parsed.username || parsed.password) {
    throw new AppError("Repository credentials must not be embedded in the URL", 400, "INVALID_REPOSITORY");
  }

  if (env.ALLOW_PRIVATE_REPOS === "true") return;

  if (parsed.protocol !== "https:") {
    throw new AppError("Repository URLs must use HTTPS", 400, "REPOSITORY_REQUIRES_HTTPS");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new AppError("Private repository hosts are not allowed", 400, "PRIVATE_REPOSITORY");
  }

  let addresses;
  try {
    addresses = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true });
  } catch {
    throw new AppError("Repository host could not be resolved", 400, "REPOSITORY_UNREACHABLE");
  }

  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new AppError("Private repository hosts are not allowed", 400, "PRIVATE_REPOSITORY");
  }
}

function workspacePath(deploymentId) {
  const root = path.resolve(env.BUILD_WORKSPACE);
  const workspace = path.resolve(root, `deployment-${deploymentId}`);
  if (!workspace.startsWith(`${root}${path.sep}`)) {
    throw new AppError("Invalid build workspace", 500, "INVALID_WORKSPACE");
  }
  return workspace;
}

async function runGit(args, options = {}) {
  const result = await execFileAsync("git", args, {
    timeout: env.GIT_CLONE_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "true"
    },
    ...options
  });
  return result.stdout.trim();
}

async function cloneBranch({ deploymentId, repositoryUrl, branchName, commitSha }) {
  await assertRepositoryUrl(repositoryUrl);
  const workspace = workspacePath(deploymentId);
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(path.dirname(workspace), { recursive: true });

  try {
    await runGit([
      "clone",
      "--depth",
      "1",
      "--single-branch",
      "--branch",
      branchName,
      "--no-tags",
      repositoryUrl,
      workspace
    ]);
  } catch (error) {
    await fs.rm(workspace, { recursive: true, force: true });
    if (error.killed || error.signal === "SIGTERM" || /timed out/i.test(error.message || "")) {
      throw new AppError("Git clone timed out", 504, "GIT_CLONE_TIMEOUT");
    }
    throw new AppError("Unable to clone the branch", 400, "GIT_CLONE_FAILED");
  }

  try {
    const head = await runGit(["-C", workspace, "rev-parse", "HEAD"]);
    if (commitSha && !head.toLowerCase().startsWith(commitSha.toLowerCase())) {
      await runGit(["-C", workspace, "fetch", "--depth", "1", "origin", commitSha]);
      await runGit(["-C", workspace, "checkout", "--detach", commitSha]);
    }
    const resolvedSha = await runGit(["-C", workspace, "rev-parse", "HEAD"]);
    return { workspace, commitSha: resolvedSha };
  } catch {
    await fs.rm(workspace, { recursive: true, force: true });
    throw new AppError("Unable to check out the requested commit", 400, "GIT_CHECKOUT_FAILED");
  }
}

async function removeWorkspace(workspace) {
  if (!workspace) return;
  const root = path.resolve(env.BUILD_WORKSPACE);
  const target = path.resolve(workspace);
  if (target.startsWith(`${root}${path.sep}`)) {
    await fs.rm(target, { recursive: true, force: true });
  }
}

module.exports = { assertRepositoryUrl, cloneBranch, removeWorkspace, workspacePath, runGit };
