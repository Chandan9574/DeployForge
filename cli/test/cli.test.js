const test = require("node:test");
const assert = require("node:assert/strict");
const { matchesPattern, normalizeRemoteUrl } = require("../src/git");
const { resolveConfig } = require("../src/config");
const { statePath } = require("../src/state");

test("branch glob patterns match expected names", () => {
  assert.equal(matchesPattern("feature/header", "feature/*"), true);
  assert.equal(matchesPattern("main", "feature/*"), false);
  assert.equal(matchesPattern("release/v1.2", "release/v1.?"), true);
  assert.equal(matchesPattern("anything", "*"), true);
});

test("CLI config resolves API, project, and interval", () => {
  const config = resolveConfig({ repo: "/tmp/example-app", api: "http://localhost:4010/", interval: "5" });
  assert.equal(config.apiUrl, "http://localhost:4010");
  assert.equal(config.project, "example-app");
  assert.equal(config.intervalMs, 5000);
  assert.equal(config.repo, "/tmp/example-app");
});

test("watcher state remains inside the repository and is Git-ignorable", () => {
  assert.equal(statePath("/tmp/example-app"), "/tmp/example-app/.deployforge/state.json");
});

test("remote URLs keep git suffixes and convert SSH", () => {
  assert.equal(normalizeRemoteUrl("git@github.com:team/app.git"), "https://github.com/team/app.git");
  assert.equal(normalizeRemoteUrl("https://github.com/team/app.git"), "https://github.com/team/app.git");
});
