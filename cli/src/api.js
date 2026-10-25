class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function createClient({ apiUrl, token, timeoutMs = 60000 }) {
  async function request(method, path, body, timeout = timeoutMs) {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout)
      });
    } catch (error) {
      const reason = error.name === "TimeoutError" ? "timed out" : "is unreachable";
      throw new ApiError(`The DeployForge API at ${apiUrl} ${reason}`, 0, "API_UNREACHABLE");
    }

    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 200) };
      }
    }
    if (!response.ok) {
      throw new ApiError(data.message || `Request failed with HTTP ${response.status}`, response.status, data.code);
    }
    return data;
  }

  return {
    health: () => request("GET", "/api/health", undefined, 5000),
    config: () => request("GET", "/api/config"),
    list: (project) => request("GET", `/api/deployments${project ? `?project=${encodeURIComponent(project)}` : ""}`),
    get: (id) => request("GET", `/api/deployments/${id}`),
    branches: (repo) => request("GET", `/api/deployments/branches?repo=${encodeURIComponent(repo)}`, undefined, 45000),
    create: (input) => request("POST", "/api/deployments", input),
    restart: (id, input) => request("POST", `/api/deployments/${id}/restart`, input || {}),
    stop: (id) => request("POST", `/api/deployments/${id}/stop`, {}),
    remove: (id) => request("DELETE", `/api/deployments/${id}`),
    logs: (id) => request("GET", `/api/deployments/${id}/logs`),
    stats: (id) => request("GET", `/api/deployments/${id}/stats`)
  };
}

module.exports = { createClient, ApiError };
