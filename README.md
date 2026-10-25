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
- Deployment IDs are checked before database queries.
- Internal error details are not returned to API clients.

The Docker socket is highly privileged. Keep it private and never expose it directly through the frontend.

## Local setup

Requirements:

- Node.js 20+
- Docker

Install dependencies and prepare the local environment:

```bash
npm run bootstrap
```

The bootstrap script installs the backend and frontend dependencies, creates a private `backend/.env` from the example, prepares the local deployment workspaces, verifies Docker access, and starts the local MongoDB container. If Docker needs setup, it adds the current user to the local `docker` group and then asks you to sign out and back in before running it again. See `scripts/bootstrap.sh --help` for flags such as `--no-install`, `--no-mongo`, and `--skip-docker-permission-check`.

To start MongoDB manually instead:

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

## Agent37 deployment intelligence

Agent37 preflight reports are optional and remain unavailable until an API key is configured. During `npm run bootstrap`, enter the key when prompted, or use the **Agent37** menu in the dashboard after startup. The dashboard verifies the key with Agent37 before saving it only to `backend/.env`; it never returns the key to the browser. The default Agent37 API URL is `https://api.agent37.com/v1` and can be changed in the menu when using a compatible endpoint.

## Database

Local MongoDB in Docker is the default for the hackathon. MongoDB Atlas remains optional: change only `MONGODB_URI` after adding the server IP to the Atlas network rules. Do not use `0.0.0.0/0` for a real deployment.

## Validation

```bash
npm run backend:check
npm run frontend:build
```
