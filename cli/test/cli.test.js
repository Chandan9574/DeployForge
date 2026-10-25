const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const { matchesPattern, normalizeRemoteUrl } = require("../src/git");
const {
  configPath,
  ensureProjectIgnored,
  normalizeApiUrl,
  readProjectConfig,
  resolveConfig,
  statePath,
  writeProjectConfig
} = require("../src/config");
const { loadState, saveState } = require("../src/state");
const { isActiveAtCommit, resolveDeployment } = require("../src/deployments");
const { createClient, ApiError } = require("../src/api");
const init = require("../src/commands/init");

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "deployforge-cli-test-"));
}

test("branch glob patterns match expected names", () => {
  assert.equal(matchesPattern("feature/header", "feature/*"), true);
  assert.equal(matchesPattern("main", "feature/*"), false);
  assert.equal(matchesPattern("release/v1.2", "release/v1.?"), true);
  assert.equal(matchesPattern("anything", "*"), true);
});

test("remote URLs convert SSH and git protocols to HTTPS", () => {
  assert.equal(normalizeRemoteUrl("git@github.com:team/app.git"), "https://github.com/team/app.git");
  assert.equal(normalizeRemoteUrl("ssh://git@github.com/team/app.git"), "https://github.com/team/app.git");
  assert.equal(normalizeRemoteUrl("git://github.com/team/app.git"), "https://github.com/team/app.git");
  assert.equal(normalizeRemoteUrl("https://github.com/team/app.git"), "https://github.com/team/app.git");
});

test("CLI config resolves flags, environment, and project config", () => {
  const repo = temporaryDirectory();
  writeProjectConfig(repo, {
    apiUrl: "http://localhost:4010/api/",
    project: "stored-project",
    repositoryUrl: "https://github.com/team/stored",
    dockerfilePath: "docker/Dockerfile",
    buildContext: "docker",
    healthcheckPath: "/health",
    pattern: "feature/*"
  });

  const stored = resolveConfig({ repo });
  assert.equal(stored.apiUrl, "http://localhost:4010");
  assert.equal(stored.project, "stored-project");
  assert.equal(stored.dockerfilePath, "docker/Dockerfile");
  assert.equal(stored.healthPath, "/health");
  assert.equal(stored.pattern, "feature/*");

  const overridden = resolveConfig({ repo, api: "http://localhost:4020/", project: "flag-project" });
  assert.equal(overridden.apiUrl, "http://localhost:4020");
  assert.equal(overridden.project, "flag-project");

  const previous = process.env.DEPLOYFORGE_PROJECT;
  process.env.DEPLOYFORGE_PROJECT = "env-project";
  try {
    assert.equal(resolveConfig({ repo }).project, "env-project");
    assert.equal(resolveConfig({ repo, project: "flag-project" }).project, "flag-project");
  } finally {
    if (previous === undefined) delete process.env.DEPLOYFORGE_PROJECT;
    else process.env.DEPLOYFORGE_PROJECT = previous;
  }
});

test("project configuration stays inside .deployforge", () => {
  const repo = temporaryDirectory();
  const file = writeProjectConfig(repo, { project: "demo" });
  assert.equal(file, configPath(repo));
  assert.equal(readProjectConfig(repo).project, "demo");
  assert.equal(statePath(repo), path.join(repo, ".deployforge", "state.json"));
  assert.match(fs.readFileSync(file, "utf8"), /"project": "demo"/);
});

test("init writes config, adds a gitignore entry, and checks the API", async () => {
  const repo = temporaryDirectory();
  let healthRequests = 0;
  const server = http.createServer((request, response) => {
    healthRequests += 1;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    await init(repo, {
      api: `http://127.0.0.1:${port}`,
      repoUrl: "https://github.com/team/app.git",
      project: "demo-app"
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const stored = readProjectConfig(repo);
  assert.equal(stored.project, "demo-app");
  assert.equal(stored.repositoryUrl, "https://github.com/team/app.git");
  assert.equal(stored.apiUrl, `http://127.0.0.1:${port}`);
  assert.equal(stored.deploymentMode, "dockerfile");
  assert.match(fs.readFileSync(path.join(repo, ".gitignore"), "utf8"), /\.deployforge\//);
  assert.equal(healthRequests, 1);
});

test("ensureProjectIgnored does not duplicate entries", () => {
  const repo = temporaryDirectory();
  assert.equal(ensureProjectIgnored(repo), true);
  assert.equal(ensureProjectIgnored(repo), false);
});

test("watcher state round-trips inside the repository", async () => {
  const repo = temporaryDirectory();
  await saveState(repo, { project: "demo-app", branches: { main: { sha: "abc" } } });
  const state = await loadState(repo);
  assert.equal(state.project, "demo-app");
  assert.equal(state.branches.main.sha, "abc");
});

test("deployments resolve by id, branch, and active commit", async () => {
  const deployments = [
    { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", branchName: "main", status: "stopped", commitSha: "1111111" },
    { _id: "bbbbbbbbbbbbbbbbbbbbbbbb", branchName: "feature/header", status: "running", commitSha: "abcdef123" }
  ];
  const client = {
    list: async () => deployments,
    get: async (id) => deployments.find((deployment) => deployment._id === id)
  };

  assert.equal((await resolveDeployment(client, "demo", "feature/header"))._id, "bbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal((await resolveDeployment(client, "demo", "feature/head"))._id, "bbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal((await resolveDeployment(client, "demo", "bbbbbbbbbbbbbbbbbbbbbbbb"))._id, "bbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(isActiveAtCommit(deployments[1], "abcdef"), true);
  assert.equal(isActiveAtCommit(deployments[1], "123456"), false);
  await assert.rejects(() => resolveDeployment(client, "demo", "missing"), /No deployment found/);
});

test("API client sends bearer auth and surfaces API errors", async () => {
  const server = http.createServer((request, response) => {
    const authorized = request.headers.authorization === "Bearer secret";
    response.writeHead(authorized ? 200 : 401, { "Content-Type": "application/json" });
    response.end(JSON.stringify(authorized ? [{ branchName: "main" }] : { message: "Unauthorized" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const client = createClient({ apiUrl: `http://127.0.0.1:${port}`, token: "secret" });
    assert.deepEqual(await client.list("demo"), [{ branchName: "main" }]);

    const anonymous = createClient({ apiUrl: `http://127.0.0.1:${port}` });
    await assert.rejects(() => anonymous.list("demo"), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 401);
      return true;
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("API URLs normalize to a base without /api", () => {
  assert.equal(normalizeApiUrl("http://localhost:4000/"), "http://localhost:4000");
  assert.equal(normalizeApiUrl("http://localhost:4000/api/"), "http://localhost:4000");
});
