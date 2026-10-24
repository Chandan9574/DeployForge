# DeployForge

DeployForge turns a Git branch into an isolated Docker preview with a public HTTPS URL. A CLI daemon watches branches, the backend builds the branch Dockerfile through the Docker socket, starts a resource-limited container, configures Nginx, and prints the URL in the terminal. A React dashboard shows status, commits, live CPU/memory, logs, and cleanup actions.

## Architecture

```text
Developer checkout
      |  branch/commit polling
      v
deployforge watch  --->  Express API  --->  Git clone + Docker build
                              |             container + health check
                              |             Nginx route + reload
                              |             MongoDB state
                              v
React dashboard  <---  REST polling (3s)
Nginx  <---  wildcard TLS  --->  public preview URL
```

## Project structure

```text
backend/src/
├── config/          environment and database setup
├── controllers/     request handlers
├── errors/          application errors and error middleware
├── middleware/      security, async, auth, and not-found handling
├── models/          Mongoose schemas
├── repositories/    database access
├── routes/          API routes
├── services/        deployment, Docker, build, Git, health, Nginx, ports
├── utils/           shared helpers
└── validators/      Zod schemas and allowlists

cli/                 deployforge commands and branch watcher
frontend/src/        React dashboard
infra/nginx/         Nginx container configuration
```

## Preview pipeline

1. Validate the branch, repository URL, Dockerfile path, and build context.
2. Reserve a port atomically and create the deployment record.
3. Clone the branch at the requested commit into a temporary workspace.
4. Build the branch Dockerfile with Docker layer caching.
5. Start a uniquely named container with CPU, memory, PID, capability, and privilege limits.
6. Write an Nginx route, validate it with `nginx -t`, and reload Nginx.
7. Run a TCP/HTTP readiness check and mark the preview `running`.
8. On failure, remove the container, image, workspace, and route; on delete, release everything.

The status flow is `pending -> cloning -> building -> starting -> checking -> running`, with `failed` and `stopped` terminal states. `POST /api/deployments` returns `201` with `pending` immediately; clients poll the deployment to follow the pipeline.

## Local setup

Requirements: Node.js 20+, Git, Docker, and a source repository containing a Dockerfile.

```bash
npm run backend:install
npm run frontend:install
npm run cli:install
cp backend/.env.example backend/.env
```

Start MongoDB:

```bash
docker run -d --name deployforge-mongodb -p 127.0.0.1:27017:27017 mongo:7
```

Start the backend and dashboard:

```bash
npm run backend:dev
npm run frontend:dev
```

Open <http://localhost:5173>. The API runs on <http://localhost:4000>. With `NGINX_ENABLED=false`, previews are reachable directly at `http://localhost:<hostPort>`; the printed preview hostname requires Nginx routing.

For local development without the Docker socket, set `USE_MOCK_DOCKER=true` and use image mode:

```bash
curl -X POST http://localhost:4000/api/deployments \
  -H 'Content-Type: application/json' \
  -d '{"projectName":"demo-app","branchName":"feature/header","image":"nginx:alpine","containerPort":80}'
```

When `repositoryUrl` is present and no image is supplied, DeployForge uses Dockerfile mode.

## CLI

Link the command globally:

```bash
npm run cli:link
```

Deploy one branch and wait for its URL:

```bash
deployforge deploy feature/header --repo .
```

Watch branches and deploy new commits automatically:

```bash
deployforge watch --repo . --pattern "feature/*"
```

Other commands:

```bash
deployforge list --stats
deployforge logs feature/header --follow
deployforge open feature/header --browser
deployforge destroy feature/header
```

Environment variables:

- `DEPLOYFORGE_API_URL` defaults to `http://localhost:4000`.
- `DEPLOYFORGE_PROJECT` defaults to the repository directory name.
- `DEPLOYFORGE_TOKEN` is sent as a bearer token when `API_TOKEN` is configured.
- `DEPLOYFORGE_POLL_MS` sets the watcher interval in milliseconds.

The watcher stores seen commits in `.deployforge/state.json` (ignored by Git) to avoid duplicate deployments after restart. Branches must exist on the `origin` remote because the backend clones the repository.

## Docker Compose

```bash
docker compose up --build
```

Compose runs MongoDB, the backend, and an Nginx sidecar using host networking. The backend writes Nginx routes into `backend/deployments`, which is mounted into Nginx. Nginx is reloaded through the Docker socket. The backend reaches preview ports through `host.docker.internal`, so preview ports are published on `0.0.0.0`; firewall the configured `PREVIEW_PORT_START`-`PREVIEW_PORT_END` range if the host is internet-facing. Nginx needs host ports 80/443 available.

Compose defaults to HTTP on `*.preview.localhost`. For production, set `PREVIEW_DOMAIN`, `PREVIEW_SCHEME=https`, `TLS_ENABLED=true`, and mount the wildcard certificate at `infra/certs/preview.crt` and `infra/certs/preview.key`. Point `*.preview.example.com` DNS at the instance.

The backend container needs `git` and access to `/var/run/docker.sock`. The Docker socket is root-equivalent; never expose it or the backend API directly to the public internet without authentication.

## HTTPS

Recommended production setup:

1. Create a wildcard DNS record such as `*.preview.example.com`.
2. Issue a wildcard certificate with Certbot DNS-01, or install a certificate from your provider.
3. Set:
   ```env
   PREVIEW_DOMAIN=preview.example.com
   PREVIEW_SCHEME=https
   TLS_ENABLED=true
   TLS_CERT_PATH=/etc/nginx/certs/preview.crt
   TLS_KEY_PATH=/etc/nginx/certs/preview.key
   NGINX_ENABLED=true
   ```
4. Put the certificate files in `infra/certs/` for Compose, or update the paths for host Nginx.
5. Include `/etc/nginx/deployforge/*.conf` in the host Nginx `http` block and reload Nginx.

With host Nginx, use `NGINX_RELOAD_MODE=host`; with systemd-managed Nginx, use `systemd`.

## API

- `GET /api/health`
- `GET /api/config`
- `GET /api/deployments?project=demo-app`
- `POST /api/deployments`
- `GET /api/deployments/:id`
- `GET /api/deployments/:id/stats`
- `GET /api/deployments/:id/logs`
- `POST /api/deployments/:id/restart`
- `DELETE /api/deployments/:id`

Create request:

```json
{
  "projectName": "demo-app",
  "repositoryUrl": "https://github.com/team/app",
  "branchName": "feature/header",
  "commitSha": "",
  "deploymentMode": "dockerfile",
  "dockerfilePath": "Dockerfile",
  "buildContext": ".",
  "healthcheckPath": "/"
}
```

## Security choices

- Strict Zod schemas reject unknown keys and unsafe paths.
- Repository URLs must use HTTPS; loopback and private hosts are rejected unless `ALLOW_PRIVATE_REPOS=true`.
- Git commands and Nginx commands use `execFile` with fixed arguments, never a shell.
- Docker images are built from the cloned workspace; image mode remains allowlisted.
- Containers run without privileges, with CPU/memory/PID limits, `no-new-privileges`, and all Linux capabilities dropped except the minimum needed for common images (`CHOWN`, `SETGID`, `SETUID`, plus `NET_BIND_SERVICE` when binding a port below 1024).
- Root filesystems can be made read-only with `DOCKER_READ_ONLY_ROOTFS=true`; writable is the compatibility default for arbitrary Dockerfiles.
- Preview host ports are intended to be reached through Nginx. In Compose they bind on `0.0.0.0` for container-to-host health checks, so restrict the preview port range with a firewall.
- Nginx configuration is written atomically and validated before every reload.
- Deployment errors returned to clients are generic; internal details stay in logs.
- `API_TOKEN` can protect mutation endpoints for the CLI and dashboard.

## Validation

```bash
npm run backend:check
npm run backend:test
npm run cli:check
npm run cli:test
npm run frontend:build
```

The 15-second target applies to cached image builds and fast health checks. Cold builds can take longer; the dashboard and CLI show elapsed time and build progress.
