const assert = require("node:assert/strict");
const test = require("node:test");

process.env.AGENT37_ENABLED = "true";
process.env.AGENT37_API_KEY = "test-key";
process.env.AGENT37_API_BASE_URL = "https://api.agent37.test/v1";

const agent37 = require("../src/services/agent37Service");

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}

test("creates a public port and returns Agent37's URL", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return response(201, { port: 3000, url: "https://preview.agent37.test" });
  };

  const result = await agent37.createPublicPort("instance-1", 3000, "preview-one", "DeployForge");

  assert.equal(result.url, "https://preview.agent37.test");
  assert.equal(calls[0].url, "https://api.agent37.test/v1/instances/instance-1/public-ports");
  assert.equal(JSON.parse(calls[0].options.body).port, 3000);
});

test("reuses an existing public port after a duplicate response", async () => {
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) return response(409, { message: "already exposed" });
    return response(200, [{ port: 3000, url: "https://existing.agent37.test" }]);
  };

  const result = await agent37.createPublicPort("instance-1", 3000);

  assert.equal(result.url, "https://existing.agent37.test");
  assert.equal(callCount, 2);
});

test("rejects Agent37's restricted port", async () => {
  await assert.rejects(
    agent37.createPublicPort("instance-1", 22022),
    (error) => error.code === "INVALID_AGENT37_PORT"
  );
});
