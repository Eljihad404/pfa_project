// src/docs.js
import React, { useEffect, useMemo, useState } from "react";
import { Search, RefreshCcw, Upload, Download, Trash2, Layers, Tag, FolderOpen, X } from "lucide-react";
import {
  listDocs,
  uploadDocs,
  deleteDoc as apiDeleteDoc,
  reindexDoc as apiReindexDoc,
  downloadDocUrl,
} from "./api/docs";

const asArray = (x) => (Array.isArray(x) ? x : []);
const asString = (x) => (typeof x === "string" ? x : "");
const asTags = (x) => asArray(x).map((t) => asString(t)).filter(Boolean);
const bytes = (n) => {
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
};

export default function Docs() {
  // state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  // filters (match AdminDashboard toolbar style)
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");

  // pagination (server-side)
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // upload box
  const [files, setFiles] = useState([]);
  const [source, setSource] = useState("");
  const [newTag, setNewTag] = useState("");
  const [tags, setTags] = useState([]);

  const allTags = useMemo(() => {
    const s = new Set();
    asArray(items).forEach((it) => asTags(it?.tags).forEach((t) => s.add(t)));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [items]);

  // fetch
  async function load() {
    try {
      setError("");
      setLoading(true);
      const skip = (page - 1) * pageSize;
      const res = await listDocs({ q: q || undefined, tag: tag || undefined, skip, limit: pageSize });
      const safeItems = asArray(res?.items).map((d) => ({
        id: d?.id ?? d?._id ?? "",
        filename: asString(d?.filename),
        ext: asString(d?.ext),
        source: asString(d?.source),
        tags: asTags(d?.tags),
        size_bytes: Number.isFinite(d?.size_bytes) ? d.size_bytes : 0,
        uploaded_at: d?.uploaded_at ?? null,
        uploaded_by: asString(d?.uploaded_by),
      }));
      setItems(safeItems);
      setTotal(Number.isFinite(res?.total) ? res.total : safeItems.length);
    } catch (e) {
      setError(e?.message || "Failed to load documents");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]); // keep server-side pagination consistent

  // actions
  const refresh = async () => {
    setPage(1);
    await load();
  };

  const onSelectFiles = (e) => setFiles(e?.target?.files ? Array.from(e.target.files) : []);
  const addTag = () => {
    const t = newTag.trim();
    if (!t) return;
    setTags((p) => Array.from(new Set([...p, t])));
    setNewTag("");
  };
  const removeTag = (t) => setTags((p) => p.filter((x) => x !== t));

  const upload = async () => {
    if (!files?.length) return;
    try {
      await uploadDocs({ files, source: asString(source), tags: asTags(tags) });
      setFiles([]); setSource(""); setTags([]); setNewTag("");
      await refresh();
    } catch (e) {
      setError(e?.message || "Upload failed");
    }
  };

  const reindex = async (id) => {
    try {
      await apiReindexDoc(id);
    } catch (e) {
      setError(e?.message || "Reindex failed");
    }
  };

  const del = async (id, name) => {
    if (!window.confirm(`Delete "${name || id}"? This cannot be undone.`)) return;
    try {
      await apiDeleteDoc(id);
      await refresh();
    } catch (e) {
      setError(e?.message || "Delete failed");
    }
  };

  // local search trigger (hit Enter like Users page)
  const onSearchEnter = (e) => {
    if (e.key === "Enter") {
      setPage(1);
      load();
    }
  };

  return (
    <section className="space-y-6">
      {error && (
        <div className="p-3 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Upload card — same card style as AdminDashboard sections */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">Upload Documents</h2>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <FolderOpen className="w-5 h-5" />
            <input type="file" multiple onChange={onSelectFiles} />
          </label>

          <input
            placeholder="Source (optional)"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
          />

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Tag className="w-4 h-4 absolute left-2 top-2 text-gray-500" />
              <input
                placeholder="Add tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
                className="pl-8 pr-2 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
              />
            </div>
            <button
              onClick={addTag}
              className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Add
            </button>
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-700/40 text-indigo-700 dark:text-indigo-200 text-xs"
                >
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:opacity-100 opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={upload}
            disabled={!files?.length}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
          >
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>

        {!!files?.length && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Selected: {files.length} file{files.length > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Filters + refresh */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-500" />
              <input
                type="text"
                placeholder="Search by filename…"
                className="w-full pl-8 pr-2 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-900 dark:border-gray-700"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onSearchEnter}
              />
            </div>

            <input
              type="text"
              placeholder="Filter by tag"
              list="doc-tags"
              className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-900 dark:border-gray-700"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={onSearchEnter}
            />
            <datalist id="doc-tags">
              {allTags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPage(1); load(); }}
              className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Apply
            </button>
            <button
              onClick={refresh}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Refresh"
            >
              <RefreshCcw className={`w-4 h-4`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* List (table, like your Users/Logs sections) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">Documents</h2>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {loading ? "Loading…" : `${items.length} / ${total} items`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-gray-600 dark:text-gray-300">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Size</th>
                <th className="py-2 pr-4">Tags</th>
                <th className="py-2 pr-4">Uploaded</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-800 dark:text-gray-100">
              {loading ? (
                <tr><td className="py-4" colSpan={6}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="py-4" colSpan={6}>No documents</td></tr>
              ) : items.map((d) => (
                <tr key={d.id} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{d.filename || "Untitled"}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{d.ext?.replace(".", "").toUpperCase()}</div>
                  </td>
                  <td className="py-2 pr-4">{d.source || "—"}</td>
                  <td className="py-2 pr-4">{bytes(d.size_bytes)}</td>
                  <td className="py-2 pr-4">
                    {asTags(d.tags).length ? asTags(d.tags).map((t) => (
                      <span key={`${d.id}-${t}`} className="inline-block px-2 py-1 mr-1 rounded bg-indigo-100 dark:bg-indigo-700/40 text-indigo-700 dark:text-indigo-200">
                        {t}
                      </span>
                    )) : <span className="text-gray-500">—</span>}
                  </td>
                  <td className="py-2 pr-4">
                    {d.uploaded_at ? new Date(d.uploaded_at).toLocaleString() : "—"}
                    <div className="text-xs text-gray-500">{d.uploaded_by || ""}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={downloadDocUrl(d.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Download className="w-4 h-4" /> Download
                      </a>
                      <button
                        onClick={() => reindex(d.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Layers className="w-4 h-4" /> Reindex
                      </button>
                      <button
                        onClick={() => del(d.id, d.filename)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-red-300 dark:border-red-400 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Page {page} · {pageSize} per page
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Prev
            </button>
            <button
              disabled={loading || page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
