// src/api/docs.js
const API = process.env.REACT_APP_RESTAPI_ENDPOINT || "http://localhost:8000";
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const safeJson = async (res) => {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Expected JSON, got ${ct}. Body: ${text.slice(0,120)}…`);
  }
  return res.json();
};

export async function listDocs({ q, tag, skip = 0, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (tag) params.set("tag", tag);
  params.set("skip", String(skip));
  params.set("limit", String(limit));

  const res = await fetch(`${API}/docs?${params.toString()}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return safeJson(res);
}

export async function uploadDocs({ files, source, tags }) {
  const fd = new FormData();
  for (const f of files || []) fd.append("files", f);
  if (source) fd.append("source", source);
  if (Array.isArray(tags) && tags.length) fd.append("tags", tags.join(","));
  const res = await fetch(`${API}/docs/upload`, { method: "POST", headers: { ...authHeaders() }, body: fd });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Upload failed: ${res.status} ${t}`);
  }
  return safeJson(res);
}

export async function deleteDoc(id) {
  const res = await fetch(`${API}/docs/${id}`, { method: "DELETE", headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return safeJson(res);
}

export async function reindexDoc(id) {
  const res = await fetch(`${API}/docs/reindex/${id}`, { method: "POST", headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Reindex failed: ${res.status}`);
  return safeJson(res);
}

export function downloadDocUrl(id) {
  return `${API}/docs/download/${id}`;
}
