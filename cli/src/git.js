const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function git(repo, args, timeout = 15000) {
  try {
    const result = await execFileAsync("git", ["-C", repo, ...args], {
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
    });
    return result.stdout.trim();
  } catch (error) {
    throw new Error((error.stderr || error.message || "Git command failed").trim().split("\n")[0]);
  }
}

async function isRepository(repo) {
  try {
    await git(repo, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

async function remoteUrl(repo) {
  try {
    return await git(repo, ["remote", "get-url", "origin"]);
  } catch {
    return "";
  }
}

function normalizeRemoteUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^git@[^:]+:.+/.test(value)) {
    const separator = value.indexOf(":");
    const host = value.slice(4, separator);
    const repositoryPath = value.slice(separator + 1);
    return `https://${host}/${repositoryPath}`;
  }
  if (value.startsWith("ssh://git@")) {
    return value.replace(/^ssh:\/\/git@/, "https://");
  }
  if (value.startsWith("git://")) {
    return value.replace(/^git:\/\//, "https://");
  }
  return value;
}

async function localBranches(repo) {
  const output = await git(repo, ["for-each-ref", "--format=%(refname:short) %(objectname)", "refs/heads"]);
  return output.split("\n").filter(Boolean).map((line) => {
    const [name, sha] = line.split(/\s+/);
    return { name, sha };
  });
}

async function remoteBranches(repo) {
  const url = await remoteUrl(repo);
  if (!url) return [];
  const output = await git(repo, ["ls-remote", "--heads", "origin"], 20000);
  return output.split("\n").filter(Boolean).map((line) => {
    const [sha, ref] = line.split(/\s+/);
    return { name: ref.replace("refs/heads/", ""), sha };
  });
}

async function currentBranch(repo) {
  try {
    return await git(repo, ["branch", "--show-current"]);
  } catch {
    return "";
  }
}

function matchesPattern(name, pattern) {
  if (!pattern || pattern === "*") return true;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(name);
}

async function discoverBranches(repo, pattern, preferRemote) {
  const local = await localBranches(repo);
  if (!preferRemote) {
    return local
      .filter((branch) => matchesPattern(branch.name, pattern))
      .map((branch) => ({ ...branch, source: "local", localOnly: false }));
  }

  let remote = [];
  try {
    remote = await remoteBranches(repo);
  } catch {
    remote = [];
  }
  const byName = new Map();
  for (const branch of local) byName.set(branch.name, { ...branch, source: "local", localOnly: true });
  for (const branch of remote) byName.set(branch.name, { ...branch, source: "remote", localOnly: false });
  return [...byName.values()]
    .filter((branch) => matchesPattern(branch.name, pattern))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveBranchCommit(repo, branch, preferRemote) {
  if (preferRemote) {
    try {
      const remote = await remoteBranches(repo);
      const match = remote.find((item) => item.name === branch);
      if (match) return match.sha;
    } catch {
      // Fall back to the local branch.
    }
  }
  return (await git(repo, ["rev-parse", branch])).trim();
}

module.exports = {
  currentBranch,
  isRepository,
  remoteUrl,
  normalizeRemoteUrl,
  localBranches,
  remoteBranches,
  discoverBranches,
  resolveBranchCommit,
  matchesPattern
};
