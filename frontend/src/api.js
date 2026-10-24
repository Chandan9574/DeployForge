const API_TOKEN = import.meta.env.VITE_API_TOKEN || "";

async function request(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`;

  const response = await fetch(`/api${path}`, { ...options, headers });
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
    throw new Error(data.message || `Request failed with HTTP ${response.status}`);
  }
  return data;
}

export const api = {
  config: () => request("/config"),
  list: () => request("/deployments"),
  create: (payload) => request("/deployments", { method: "POST", body: JSON.stringify(payload) }),
  remove: (id) => request(`/deployments/${id}`, { method: "DELETE" }),
  restart: (id) => request(`/deployments/${id}/restart`, { method: "POST", body: "{}" }),
  stats: (id) => request(`/deployments/${id}/stats`),
  logs: (id) => request(`/deployments/${id}/logs`)
};
