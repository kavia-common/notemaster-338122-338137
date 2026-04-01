/**
 * Minimal API client for the Notemaster backend.
 *
 * Uses fetch and an environment-configurable base URL.
 * - REACT_APP_API_BASE_URL: e.g. "http://localhost:3001"
 */

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/+$/, "");

function buildUrl(path) {
  if (!API_BASE_URL) return path; // assume same-origin proxy if configured
  return `${API_BASE_URL}${path}`;
}

async function request(path, options = {}) {
  const resp = await fetch(buildUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const isJson = (resp.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await resp.json() : await resp.text();

  if (!resp.ok) {
    const detail = (body && body.detail) ? body.detail : body;
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }
  return body;
}

// PUBLIC_INTERFACE
export async function listNotes({ q, tag, archived, limit = 50, offset = 0 } = {}) {
  /** List notes with optional filters. */
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (tag) params.set("tag", tag);
  if (archived !== undefined && archived !== null) params.set("archived", String(archived));
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return request(`/notes?${params.toString()}`);
}

// PUBLIC_INTERFACE
export async function getNote(noteId) {
  /** Fetch a single note by ID. */
  return request(`/notes/${noteId}`);
}

// PUBLIC_INTERFACE
export async function createNote(payload) {
  /** Create a note. payload: {title, content, tags: string[]} */
  return request("/notes", { method: "POST", body: JSON.stringify(payload) });
}

// PUBLIC_INTERFACE
export async function updateNote(noteId, payload) {
  /** Update a note. payload: {title?, content?, tags?, is_archived?} */
  return request(`/notes/${noteId}`, { method: "PUT", body: JSON.stringify(payload) });
}

// PUBLIC_INTERFACE
export async function deleteNote(noteId) {
  /** Delete a note. */
  return request(`/notes/${noteId}`, { method: "DELETE" });
}

// PUBLIC_INTERFACE
export async function listTags() {
  /** List tags and note counts. */
  return request("/tags");
}
