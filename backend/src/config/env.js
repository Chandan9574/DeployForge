const { z } = require("zod");

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().url().default("mongodb://localhost:27017/deployforge"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  PREVIEW_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/i).default("preview.localhost"),
  PREVIEW_PORT_START: z.coerce.number().int().min(1024).max(65535).default(4300),
  PREVIEW_PORT_END: z.coerce.number().int().min(1024).max(65535).default(4399),
  DOCKER_SOCKET: z.string().default("/var/run/docker.sock"),
  USE_MOCK_DOCKER: z.enum(["true", "false"]).default("false"),
  NGINX_ENABLED: z.enum(["true", "false"]).default("false"),
  ALLOWED_IMAGES: z.string().default("nginx:alpine")
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (parsed.data.PREVIEW_PORT_START > parsed.data.PREVIEW_PORT_END) {
  console.error("PREVIEW_PORT_START must be less than or equal to PREVIEW_PORT_END");
  process.exit(1);
}

module.exports = {
  ...parsed.data,
  allowedImages: parsed.data.ALLOWED_IMAGES.split(",").map((image) => image.trim()).filter(Boolean)
};
