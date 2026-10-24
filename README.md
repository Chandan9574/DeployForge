# DeployForge

DeployForge creates a small, self-hosted preview environment for a Git branch. It uses Node.js and JavaScript for the backend, Express.js for the API, MongoDB for state, Docker for isolation, Nginx for routing, and React for the dashboard.

## Project structure

The backend follows the enhanced MVC structure from the project design:

```text
backend/src/
├── config/          environment and database setup
├── controllers/     request handlers
├── errors/          application errors and error middleware
├── middleware/      async, security, and not-found middleware
├── models/          Mongoose schemas
├── repositories/    database access
├── routes/          API routes
├── services/        deployment, Docker, Nginx, and port logic
├── utils/           shared helpers
└── validators/      input validation and allowlists

frontend/
└── src/             React dashboard
```

## Security choices

- Request bodies are limited to 100 KB.
- Helmet adds secure HTTP headers.
- CORS only allows the configured frontend origin.
- API requests are rate limited.
- MongoDB operator injection keys are removed from request bodies.
- Deployment payloads use strict Zod schemas.
- Branch names, project names, URLs, ports, and Docker image names are validated.
- Docker images must be in the `ALLOWED_IMAGES` allowlist.
- Docker is called through its SDK, never through a user-controlled shell command.
- Container names and Nginx filenames are generated from bounded slugs.
- Nginx configuration is validated before reload.
- Docker containers have CPU and memory limits.
- Docker containers also enforce PID limits.
- Containers run with `no-new-privileges`.
- Linux capabilities are dropped by default, with minimal add-back only when needed.
- Root filesystem is read-only with small tmpfs mounts for runtime files.
- Containers are not run in privileged mode.
- Active preview count per project is capped (`MAX_ACTIVE_DEPLOYMENTS_PER_PROJECT`).
- Deployment IDs are checked before database queries.
- Internal error details are not returned to API clients.

The Docker socket is highly privileged. Keep it private and never expose it directly through the frontend.

## Local setup

Requirements:

- Node.js 20+
- Docker

Install dependencies:

```bash
npm run backend:install
npm run frontend:install
cp backend/.env.example backend/.env
```

Start MongoDB:

```bash
docker run -d --name deployforge-mongodb -p 27017:27017 mongo:7
```

Start the backend:

```bash
npm run backend:dev
```

Start the frontend in another terminal:

```bash
npm run frontend:dev
```

Open <http://localhost:5173>.

## Docker Compose

```bash
docker compose up --build
```

Compose uses the MongoDB service name internally. The dashboard can be run separately with `npm run frontend:dev`.

## Demo API

```bash
curl -X POST http://localhost:4000/api/deployments \
  -H 'Content-Type: application/json' \
  -d '{"branchName":"feature/header","image":"nginx:alpine","containerPort":80}'
```

The default `.env` uses mock Docker mode so the API can be demonstrated without creating containers. Set `USE_MOCK_DOCKER=false` to use the local Docker socket.

Container hardening values are configurable in [backend/.env.example](./backend/.env.example) (`DOCKER_MEMORY_MB`, `DOCKER_CPU_UNITS`, `DOCKER_PIDS_LIMIT`, `DOCKER_READ_ONLY_ROOTFS`, `DOCKER_NO_NEW_PRIVILEGES`, `DOCKER_DROP_ALL_CAPS`, `DOCKER_CONTAINER_USER`).

Set `DEPLOYMENT_RUNTIME=agent37` to use Agent37 for branch deployments. In this mode, deployment requests must include a public `repositoryUrl`; the backend creates one persistent Agent37 instance, clones the requested branch, installs Node dependencies when `package.json` exists, runs the package build script when available, starts the application with `PORT=AGENT37_APP_PORT`, verifies `AGENT37_HEALTH_PATH`, creates an Agent37 public port, and stores the returned HTTPS URL with the deployment. Keep `DEPLOYMENT_RUNTIME=local-docker` to use the existing local Docker flow.

## Agent37 integration

The backend includes a server-side Agent37 client and disabled-by-default routes. To enable it locally, set `AGENT37_ENABLED=true`, add `AGENT37_API_KEY`, and set a private `AGENT37_ROUTE_TOKEN` in `backend/.env`. You can optionally set `AGENT37_TEMPLATE`. The Agent37 key and route token are never returned by these routes or sent to frontend code.

Available backend routes:

```text
GET    /api/agent37/instances
POST   /api/agent37/instances
GET    /api/agent37/instances/:id
POST   /api/agent37/instances/:id/exec
POST   /api/agent37/instances/:id/messages
POST   /api/agent37/instances/:id/public-ports
GET    /api/agent37/instances/:id/public-ports
DELETE /api/agent37/instances/:id/public-ports/:port
DELETE /api/agent37/instances/:id
```

Send the route token as `X-DeployForge-Agent-Token`. Public-port URLs are unauthenticated by Agent37, so only expose applications that implement their own access control. The project currently has no user-authentication layer, so the token is an interim server-to-server guard and must be replaced or combined with real user/workspace authorization before exposing these management routes to multiple users.

## Database

Local MongoDB in Docker is the default for the hackathon. MongoDB Atlas remains optional: change only `MONGODB_URI` after adding the server IP to the Atlas network rules. Do not use `0.0.0.0/0` for a real deployment.

## Validation

```bash
npm run backend:check
npm run frontend:build
```