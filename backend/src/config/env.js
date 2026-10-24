const { z } = require("zod");
const path = require("path");

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().url().default("mongodb://localhost:27017/deployforge"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  PREVIEW_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/i).default("preview.localhost"),
  PREVIEW_SCHEME: z.enum(["http", "https"]).default("http"),
  PREVIEW_PROXY_HOST: z.string().default("127.0.0.1"),
  PREVIEW_PORT_START: z.coerce.number().int().min(1024).max(65535).default(4300),
  PREVIEW_PORT_END: z.coerce.number().int().min(1024).max(65535).default(4399),
  DOCKER_SOCKET: z.string().default("/var/run/docker.sock"),
  DOCKER_BIND_HOST: z.string().default("127.0.0.1"),
  USE_MOCK_DOCKER: z.enum(["true", "false"]).default("false"),
  NGINX_ENABLED: z.enum(["true", "false"]).default("false"),
  NGINX_CONFIG_DIR: z.string().default(path.join(process.cwd(), "deployments")),
  NGINX_MAIN_CONFIG: z.string().default(""),
  NGINX_RELOAD_MODE: z.enum(["host", "systemd", "docker"]).default("host"),
  NGINX_CONTAINER_NAME: z.string().default("deployforge-nginx"),
  TLS_ENABLED: z.enum(["true", "false"]).default("false"),
  TLS_CERT_PATH: z.string().default("/etc/nginx/certs/preview.crt"),
  TLS_KEY_PATH: z.string().default("/etc/nginx/certs/preview.key"),
  BUILD_WORKSPACE: z.string().default("/tmp/deployforge-builds"),
  GIT_CLONE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  BUILD_TIMEOUT_MS: z.coerce.number().int().min(1000).max(1800000).default(300000),
  DEPLOYMENT_READY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
  HEALTHCHECK_INTERVAL_MS: z.coerce.number().int().min(100).max(10000).default(500),
  HEALTHCHECK_HOST: z.string().default("127.0.0.1"),
  DEFAULT_REPOSITORY_URL: z.string().default(""),
  ALLOW_PRIVATE_REPOS: z.enum(["true", "false"]).default("false"),
  ALLOWED_IMAGES: z.string().default("nginx:alpine"),
  API_TOKEN: z.string().default(""),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(300),
  MAX_ACTIVE_DEPLOYMENTS_PER_PROJECT: z.coerce.number().int().min(1).max(500).default(20),
  DOCKER_MEMORY_MB: z.coerce.number().int().min(64).max(8192).default(512),
  DOCKER_CPU_UNITS: z.coerce.number().int().min(100000000).max(4000000000).default(500000000),
  DOCKER_PIDS_LIMIT: z.coerce.number().int().min(16).max(10000).default(100),
  DOCKER_READ_ONLY_ROOTFS: z.enum(["true", "false"]).default("false"),
  DOCKER_NO_NEW_PRIVILEGES: z.enum(["true", "false"]).default("true"),
  DOCKER_DROP_ALL_CAPS: z.enum(["true", "false"]).default("true"),
  DOCKER_CONTAINER_USER: z.string().trim().max(64).default("")
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

if (parsed.data.TLS_ENABLED === "true" && parsed.data.PREVIEW_SCHEME !== "https") {
  console.error("PREVIEW_SCHEME must be https when TLS_ENABLED is true");
  process.exit(1);
}

module.exports = {
  ...parsed.data,
  allowedImages: parsed.data.ALLOWED_IMAGES.split(",").map((image) => image.trim()).filter(Boolean)
};
