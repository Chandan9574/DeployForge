const { z } = require("zod");
const AppError = require("../errors/AppError");

const branchPattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/;
const imagePattern = /^[a-z0-9./:_-]{1,128}$/i;
const commitPattern = /^[a-f0-9]{7,40}$/i;
const relativePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]{1,200}$/;

const deploymentSchema = z.object({
  projectName: z.string().trim().min(1).max(60).regex(/^[a-zA-Z0-9._-]+$/).default("demo-app"),
  repositoryUrl: z.union([
    z.literal(""),
    z.string().trim().url().refine((value) => /^https?:\/\//i.test(value), "Only HTTP(S) repository URLs are allowed")
  ]).default(""),
  branchName: z.string().trim().regex(branchPattern, "Invalid branch name"),
  commitSha: z.union([z.literal(""), z.string().trim().regex(commitPattern, "Invalid commit SHA")]).default(""),
  deploymentMode: z.enum(["dockerfile", "image"]).default("dockerfile"),
  dockerfilePath: z.string().trim().regex(relativePathPattern, "Invalid Dockerfile path").default("Dockerfile"),
  buildContext: z.string().trim().regex(relativePathPattern, "Invalid build context").default("."),
  healthcheckPath: z.string().trim().max(200).regex(/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*$/, "Invalid health check path").default("/"),
  image: z.string().trim().regex(imagePattern, "Invalid Docker image name").optional().default("nginx:alpine"),
  containerPort: z.coerce.number().int().min(1).max(65535).optional()
}).strict();

function validateDeployment(input = {}, options) {
  const inferredMode = input.deploymentMode || (
    input.repositoryUrl ? "dockerfile" : input.image ? "image" : "dockerfile"
  );
  const result = deploymentSchema.safeParse({ ...input, deploymentMode: inferredMode });
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400, "INVALID_DEPLOYMENT");
  }

  const data = result.data;
  if (data.deploymentMode === "dockerfile") {
    if (!data.repositoryUrl && options.defaultRepositoryUrl) {
      data.repositoryUrl = options.defaultRepositoryUrl;
    }
    if (!data.repositoryUrl) {
      throw new AppError("A repository URL is required to build a branch preview", 400, "REPOSITORY_REQUIRED");
    }
    if (!/^https:\/\//i.test(data.repositoryUrl) && !options.allowPrivateRepos) {
      throw new AppError("Repository URLs must use HTTPS", 400, "REPOSITORY_REQUIRES_HTTPS");
    }
  } else if (!options.allowedImages.includes(data.image)) {
    throw new AppError("This Docker image is not allowed", 400, "IMAGE_NOT_ALLOWED");
  }

  return data;
}

const redeploySchema = z.object({
  repositoryUrl: z.union([
    z.literal(""),
    z.string().trim().url().refine((value) => /^https?:\/\//i.test(value), "Only HTTP(S) repository URLs are allowed")
  ]).optional(),
  commitSha: z.union([z.literal(""), z.string().trim().regex(commitPattern, "Invalid commit SHA")]).optional()
}).strict();

function validateRedeploy(input) {
  const result = redeploySchema.safeParse(input || {});
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400, "INVALID_REDEPLOY");
  }
  return result.data;
}

module.exports = { validateDeployment, validateRedeploy };
