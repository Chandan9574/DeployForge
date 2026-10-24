const path = require("path");
const fs = require("fs");
const tar = require("tar-fs");
const Docker = require("dockerode");
const env = require("../config/env");
const AppError = require("../errors/AppError");

const docker = new Docker({ socketPath: env.DOCKER_SOCKET });

const EXCLUDED_BUILD_PATHS = new Set([
  ".git",
  "node_modules",
  ".cache",
  ".npm",
  ".pnpm-store",
  ".yarn",
  "coverage",
  ".next",
  ".nuxt"
]);

const EXCLUDED_BUILD_FILES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".npmrc",
  ".pypirc",
  "id_rsa",
  "id_ed25519"
]);

function useMockDocker() {
  return env.USE_MOCK_DOCKER === "true";
}

function imageTagFor(projectName, branchName, commitSha) {
  const project = projectName.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 30);
  const branch = branchName.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 30);
  const revision = (commitSha || Date.now().toString()).slice(0, 12);
  return `deployforge/${project}-${branch}:${revision}`;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function buildContextPaths(workspace, buildContext, dockerfilePath) {
  const root = path.resolve(workspace);
  const context = path.resolve(root, buildContext || ".");
  const dockerfile = path.resolve(context, dockerfilePath || "Dockerfile");

  if (!isInside(root, context) || !isInside(context, dockerfile)) {
    throw new AppError("Build paths must stay inside the repository", 400, "INVALID_BUILD_PATH");
  }
  if (!fs.existsSync(context) || !fs.statSync(context).isDirectory()) {
    throw new AppError("The build context does not exist", 400, "INVALID_BUILD_CONTEXT");
  }
  if (!fs.existsSync(dockerfile) || !fs.statSync(dockerfile).isFile()) {
    throw new AppError("The Dockerfile does not exist", 400, "DOCKERFILE_NOT_FOUND");
  }

  return {
    context,
    dockerfile: path.relative(context, dockerfile) || "Dockerfile"
  };
}

async function followBuild(stream, onLog) {
  await new Promise((resolve, reject) => {
    let settled = false;
    let buildFailure = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      stream.destroy();
      reject(new AppError("Docker build timed out", 500, "BUILD_TIMEOUT"));
    }, env.BUILD_TIMEOUT_MS);

    docker.modem.followProgress(
      stream,
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else if (buildFailure) reject(new AppError(buildFailure, 500, "BUILD_FAILED"));
        else resolve();
      },
      (event) => {
        const failure = event.errorDetail?.message || event.error || "";
        if (failure) buildFailure = String(failure);
        const line = event.stream || event.status || (failure ? `ERROR: ${failure}` : "");
        if (line) onLog(line.replace(/\r/g, "").trim());
      }
    );
  });
}

async function buildImage({ workspace, buildContext, dockerfilePath, projectName, branchName, commitSha, onLog }) {
  const tag = imageTagFor(projectName, branchName, commitSha);
  if (useMockDocker()) {
    onLog(`[mock] Built image ${tag}`);
    return tag;
  }

  const paths = buildContextPaths(workspace, buildContext, dockerfilePath);
  const contextRoot = paths.context;
  const pack = tar.pack(contextRoot, {
    ignore(name) {
      const relative = path.relative(contextRoot, name);
      const segments = relative.split(path.sep);
      return segments.some((segment) => EXCLUDED_BUILD_PATHS.has(segment)) ||
        EXCLUDED_BUILD_FILES.has(segments.at(-1)) ||
        segments.at(-1).endsWith(".pem") ||
        segments.at(-1).endsWith(".key");
    }
  });

  const stream = await docker.buildImage(pack, {
    t: tag,
    dockerfile: paths.dockerfile,
    pull: false,
    rm: true
  });

  try {
    await followBuild(stream, onLog);
  } catch (error) {
    throw new AppError(error.message || "Docker build failed", 500, "BUILD_FAILED");
  }
  return tag;
}

async function imageExposedPort(image) {
  if (useMockDocker()) return 80;
  try {
    const details = await docker.getImage(image).inspect();
    const ports = Object.keys(details.Config?.ExposedPorts || {});
    if (ports.length === 0) return 80;
    return Number.parseInt(ports[0].split("/")[0], 10) || 80;
  } catch {
    return 80;
  }
}

async function removeImage(image) {
  if (useMockDocker() || !image) return;
  try {
    await docker.getImage(image).remove({ force: true });
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
}

module.exports = { buildImage, imageExposedPort, imageTagFor, removeImage };
