const test = require("node:test");
const assert = require("node:assert/strict");
const { slugify, previewSlug, previewHost, previewUrl } = require("../src/utils/preview");
const { validateDeployment } = require("../src/validators/deploymentValidator");
const { renderConfig } = require("../src/services/nginxService");
const { imageTagFor } = require("../src/services/buildService");

const options = {
  allowedImages: ["nginx:alpine"],
  defaultRepositoryUrl: "",
  allowPrivateRepos: false
};

test("branch slugs are bounded and host-safe", () => {
  assert.equal(slugify("Feature/New Header!"), "feature-new-header");
  const slug = previewSlug("My Project", "feature/very/long/branch/name/that/keeps/going");
  assert.ok(slug.length <= 53);
  assert.match(previewHost("demo-app", "feature/header"), /^demo-app-feature-header\.preview\.localhost$/);
  assert.match(previewUrl("demo-app", "feature/header"), /^http:\/\/demo-app-feature-header\.preview\.localhost$/);
});

test("image mode is inferred and allowlisted", () => {
  const input = validateDeployment({ branchName: "feature/header", image: "nginx:alpine" }, options);
  assert.equal(input.deploymentMode, "image");
  assert.throws(
    () => validateDeployment({ branchName: "feature/header", image: "evil:latest" }, options),
    /not allowed/
  );
});

test("dockerfile mode requires a safe repository URL", () => {
  assert.throws(
    () => validateDeployment({ branchName: "feature/header" }, options),
    /repository URL is required/
  );
  const input = validateDeployment({
    branchName: "feature/header",
    repositoryUrl: "https://github.com/team/app"
  }, options);
  assert.equal(input.deploymentMode, "dockerfile");
});

test("traversal paths and unsafe branches are rejected", () => {
  assert.throws(
    () => validateDeployment({
      branchName: "feature/header",
      repositoryUrl: "https://github.com/team/app",
      dockerfilePath: "../../etc/passwd"
    }, options),
    /Invalid Dockerfile path/
  );
  assert.throws(
    () => validateDeployment({
      branchName: "../escape",
      repositoryUrl: "https://github.com/team/app"
    }, options),
    /Invalid branch name/
  );
});

test("nginx renders HTTP and TLS routes safely", () => {
  const http = renderConfig({ host: "demo-feature.preview.localhost", hostPort: 4310, tlsEnabled: false });
  assert.match(http, /listen 80;/);
  assert.match(http, /server_name demo-feature\.preview\.localhost;/);
  assert.match(http, /proxy_pass http:\/\/127\.0\.0\.1:4310;/);

  const tls = renderConfig({ host: "demo-feature.preview.example.com", hostPort: 4311, tlsEnabled: true });
  assert.match(tls, /listen 443 ssl http2;/);
  assert.match(tls, /return 301 https:\/\/\$host\$request_uri;/);
  assert.match(tls, /ssl_certificate /);
});

test("image tags are bounded and deterministic", () => {
  const tag = imageTagFor("My Project", "feature/header", "abcdef1234567890");
  assert.match(tag, /^deployforge\/my-project-feature-header:abcdef123456$/);
});
