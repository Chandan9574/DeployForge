const { z } = require("zod");
const AppError = require("../errors/AppError");

const branchPattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/;
const imagePattern = /^[a-z0-9./:_-]{1,128}$/i;

const deploymentSchema = z.object({
  projectName: z.string().trim().min(1).max(60).regex(/^[a-zA-Z0-9._-]+$/).default("demo-app"),
  repositoryUrl: z.union([
    z.literal(""),
    z.string().trim().url().refine((value) => /^https?:\/\//i.test(value), "Only HTTP(S) repository URLs are allowed")
  ]).default(""),
  branchName: z.string().trim().regex(branchPattern, "Invalid branch name"),
  image: z.string().trim().regex(imagePattern, "Invalid Docker image name").optional().default("nginx:alpine"),
  containerPort: z.coerce.number().int().min(1).max(65535).optional().default(80)
}).strict();

function validateDeployment(input, allowedImages) {
  const result = deploymentSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400, "INVALID_DEPLOYMENT");
  }
  if (!allowedImages.includes(result.data.image)) {
    throw new AppError("This Docker image is not allowed", 400, "IMAGE_NOT_ALLOWED");
  }
  return result.data;
}

module.exports = { validateDeployment };
