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
  ALLOWED_IMAGES: z.string().default("nginx:alpine"),
  MAX_ACTIVE_DEPLOYMENTS_PER_PROJECT: z.coerce.number().int().min(1).max(500).default(20),
  DOCKER_MEMORY_MB: z.coerce.number().int().min(64).max(8192).default(512),
  DOCKER_CPU_UNITS: z.coerce.number().int().min(100000000).max(4000000000).default(500000000),
  DOCKER_PIDS_LIMIT: z.coerce.number().int().min(16).max(10000).default(100),
  DOCKER_READ_ONLY_ROOTFS: z.enum(["true", "false"]).default("true"),
  DOCKER_NO_NEW_PRIVILEGES: z.enum(["true", "false"]).default("true"),
  DOCKER_DROP_ALL_CAPS: z.enum(["true", "false"]).default("true"),
  DOCKER_CONTAINER_USER: z.string().trim().max(64).default(""),
  DEPLOYMENT_RUNTIME: z.enum(["local-docker", "agent37"]).default("local-docker"),
  AGENT37_ENABLED: z.enum(["true", "false"]).default("false"),
  AGENT37_API_KEY: z.string().trim().default(""),
  AGENT37_API_BASE_URL: z.string().url().default("https://api.agent37.com/v1"),
  AGENT37_INSTANCE_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/i).default("agent37.app"),
  AGENT37_TEMPLATE: z.string().trim().max(128).default(""),
  AGENT37_ROUTE_TOKEN: z.string().trim().default(""),
  AGENT37_APP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  AGENT37_HEALTH_PATH: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/).default("/ping")
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

if (parsed.data.DEPLOYMENT_RUNTIME === "agent37" && (parsed.data.AGENT37_ENABLED !== "true" || !parsed.data.AGENT37_API_KEY)) {
  console.error("DEPLOYMENT_RUNTIME=agent37 requires AGENT37_ENABLED=true and AGENT37_API_KEY");
  process.exit(1);
}

module.exports = {
  ...parsed.data,
  allowedImages: parsed.data.ALLOWED_IMAGES.split(",").map((image) => image.trim()).filter(Boolean)
};
