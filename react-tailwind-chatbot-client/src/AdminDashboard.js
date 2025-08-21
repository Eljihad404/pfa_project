// src/AdminDashboard.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import ThemeToggle from './components/ThemeToggle';
import { Bell, User, MessageSquare, FileText, Settings, BarChart2, List, RefreshCcw, ToggleRight, File } from 'lucide-react';
import Docs from "./docs";
import ChatConsole from "./components/ChatConsole";

const API = process.env.REACT_APP_RESTAPI_ENDPOINT || 'http://localhost:8000';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePage, setActivePage] = useState('Dashboard');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const [metrics, setMetrics] = useState({ Users: 0, Chats: 0, Tokens: 0, Docs: 0 });
  const [tokenUsageData, setTokenUsageData] = useState([]);

  // Users
  const [allUsers, setAllUsers] = useState([]); // raw from API
  const [users, setUsers] = useState([]);       // filtered for the table
  const [usersLoading, setUsersLoading] = useState(false);

  // Search + Filters
  const [userQuery, setUserQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');   // debounce typing
  const [roleFilter, setRoleFilter] = useState('all');        // 'all' or role name
  const [activeFilter, setActiveFilter] = useState('all');    // 'all' | 'active' | 'inactive'
const [typingKey, setTypingKey] = useState(0);

  // Chat console
  const [selectedUser, setSelectedUser] = useState('');
  const [userChats, setUserChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState('');
  const [chatMsgs, setChatMsgs] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const token = localStorage.getItem('token');
  const roles = JSON.parse(localStorage.getItem('roles') || '[]');

  // Guard
  useEffect(() => {
    if (!token) return navigate('/auth', { replace: true });
    if (!roles.includes('admin')) return navigate('/chat', { replace: true });
  }, [token, roles, navigate]);

  // Dashboard data
  async function loadDashboard(isRefresh = false) {
    try {
      setError('');
      isRefresh ? setRefreshing(true) : setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      const [mRes, uRes] = await Promise.all([
        fetch(`${API}/admin/metrics`, { headers }),
        fetch(`${API}/admin/token-usage`, { headers }),
      ]);
      if (mRes.status === 401) return navigate('/auth', { replace: true });
      if (mRes.status === 403) return navigate('/chat', { replace: true });
      if (!mRes.ok || !uRes.ok) throw new Error('Failed to fetch admin data');

      const m = await mRes.json();
      const u = await uRes.json();
      setMetrics({ Users: m.Users ?? 0, Chats: m.Chats ?? 0, Tokens: m.Tokens ?? 0, Docs: m.Docs ?? 0 });
      setTokenUsageData(Array.isArray(u) ? u : []);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Users
async function loadUsers() {
  try {
    setUsersLoading(true);
    const qs = userQuery ? `?q=${encodeURIComponent(userQuery.trim())}` : '';
    const res = await fetch(`${API}/admin/users${qs}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load users');
    const data = await res.json();
    setAllUsers(Array.isArray(data) ? data : []);
  } catch (e) {
    setError(e.message || 'Failed to load users');
    setAllUsers([]);
  } finally {
    setUsersLoading(false);
  }
}
// Debounce search + filters when on "Users" page
useEffect(() => {
  const id = setTimeout(() => {
    setDebouncedQuery(userQuery.trim().toLowerCase());
  }, 300);
  return () => clearTimeout(id);
}, [userQuery]);
useEffect(() => {
  const filtered = allUsers.filter(u => {
    const q = debouncedQuery;
    const name = (u.username || '').toLowerCase();
    const email = (u.email || '').toLowerCase();

    const matchQ = !q || name.includes(q) || email.includes(q);
    const matchRole =
      roleFilter === 'all' ||
      (Array.isArray(u.roles) && u.roles.includes(roleFilter));
    const matchActive =
      activeFilter === 'all' ||
      (activeFilter === 'active' ? !!u.is_active : !u.is_active);

    return matchQ && matchRole && matchActive;
  });

  setUsers(filtered);
}, [allUsers, debouncedQuery, roleFilter, activeFilter]);


  async function toggleActive(u) {
    const body = { is_active: !u.is_active };
    const res = await fetch(`${API}/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) loadUsers();
  }
const [editingId, setEditingId] = useState(null);        // user.id being edited
const [editDraft, setEditDraft] = useState(null);        // { username, email, roles }
const [roleInput, setRoleInput] = useState("");          // input for adding a role
const [savingId, setSavingId] = useState(null);          // disable buttons while saving

function startEdit(u) {
  setEditingId(u.id);
  setEditDraft({
    username: u.username || "",
    email: u.email || "",
    roles: Array.isArray(u.roles) ? [...u.roles] : [],
  });
  setRoleInput("");
}

function cancelEdit() {
  setEditingId(null);
  setEditDraft(null);
  setRoleInput("");
}

function handleEditChange(field, value) {
  setEditDraft(d => ({ ...d, [field]: value }));
}

function removeRoleFromDraft(role) {
  setEditDraft(d => ({ ...d, roles: d.roles.filter(r => r !== role) }));
}

function addRoleToDraft(raw) {
  const r = (raw || "").trim();
  if (!r) return;
  setEditDraft(d => {
    if (d.roles.includes(r)) return d; // no duplicates
    return { ...d, roles: [...d.roles, r] };
  });
  setRoleInput("");
}

function handleRoleKeyDown(e) {
  if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
    e.preventDefault();
    addRoleToDraft(roleInput);
  }
}

function sameRoles(a = [], b = []) {
  const A = [...a].map(x => x.trim()).filter(Boolean).sort();
  const B = [...b].map(x => x.trim()).filter(Boolean).sort();
  return A.length === B.length && A.every((x, i) => x === B[i]);
}

async function saveUserDraft(originalUser) {
  if (!editingId || !editDraft) return;

  // Always send username & email, plus roles if present
  const body = {
    username: (editDraft.username || "").trim(),
    email: (editDraft.email || "").trim(),
  };
  // Only send roles if you allow changing them (we do)
  if (Array.isArray(editDraft.roles)) body.roles = editDraft.roles;

  try {
    setSavingId(editingId);
    const res = await fetch(`${API}/admin/users/${originalUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) throw new Error(j.detail || "Username/email already in use");
      throw new Error(j.detail || "Failed to save user changes");
    }

    cancelEdit();
    await loadUsers();
  } catch (e) {
    setError(e.message || "Failed to save user changes");
  } finally {
    setSavingId(null);
  }
}

  // Chat console
  async function loadChatsForUser(uid) {
    setSelectedUser(uid);
    setSelectedChat('');
    setChatMsgs([]);
    if (!uid) { setUserChats([]); return; }
    const res = await fetch(`${API}/admin/users/${uid}/chats`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setUserChats(await res.json());
  }

  async function loadMessages(chatId) {
    setSelectedChat(chatId);
    const res = await fetch(`${API}/admin/chats/${chatId}/messages`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setChatMsgs(await res.json());
  }

  async function sendReply() {
    const t = replyText.trim();
    if (!t || !selectedChat) return;
    setSending(true);
    const res = await fetch(`${API}/admin/chats/${selectedChat}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: t }),
    });
    setSending(false);
    if (res.ok) {
      setReplyText('');
      loadMessages(selectedChat);
    }
  }

  // Logs
  async function loadLogs() {
    try {
      setLogsLoading(true);
      const res = await fetch(`${API}/admin/logs?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load logs');
      setLogs(await res.json());
    } catch (e) {
      setError(e.message || 'Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  }

  // initial + interval
  useEffect(() => {
    loadDashboard(false);
    const id = setInterval(() => loadDashboard(true), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activePage === 'Users') loadUsers();
    if (activePage === 'Chat Console') { loadUsers(); setUserChats([]); setChatMsgs([]); }
    if (activePage === 'Logs') loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  const navItems = [
    { label: 'Dashboard', icon: <BarChart2 className="w-5 h-5" /> },
    { label: 'Users', icon: <User className="w-5 h-5" /> },
    { label: 'Chat Console', icon: <MessageSquare className="w-5 h-5" /> },
    { label: 'Docs', icon: <File className="w-5 h-5" />,path: "/docs" },
    { label: 'Logs', icon: <FileText className="w-5 h-5" /> },
    { label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  const metricCards = [
    { key: 'Users', title: 'Users', value: metrics.Users, icon: <User className="w-6 h-6" /> },
    { key: 'Chats', title: 'Chats', value: metrics.Chats, icon: <MessageSquare className="w-6 h-6" /> },
    { key: 'Tokens', title: 'Tokens', value: metrics.Tokens, icon: <BarChart2 className="w-6 h-6" /> },
    { key: 'Docs', title: 'Docs', value: metrics.Docs, icon: <FileText className="w-6 h-6" /> },
  ];

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300`}>
  <div className="p-4 flex items-center justify-between">
    {sidebarOpen && (
      <h2 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
        Admin
      </h2>
    )}
    <button 
      onClick={() => setSidebarOpen(!sidebarOpen)} 
      className="focus:outline-none ml-auto"
    >
      <List />
    </button>
  </div>
  <nav className="mt-2">
    {navItems.map((item) => (
      <div
        key={item.label}
        onClick={() => setActivePage(item.label)}
        className={`flex items-center px-4 py-2 cursor-pointer space-x-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 ${activePage === item.label ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
      >
        {item.icon}
        {sidebarOpen && <span>{item.label}</span>}
      </div>
    ))}
  </nav>
</aside>


      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 shadow">
  {/* Left side */}
  <div className="flex items-center space-x-3">
    <ThemeToggle />
  </div>

  {/* Right side */}
  <div className="flex items-center space-x-3">
    <button
      onClick={() =>
        activePage === 'Dashboard' ? loadDashboard(true)
        : activePage === 'Users' ? loadUsers()
        : activePage === 'Logs' ? loadLogs()
        : null
      }
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
      title="Refresh"
    >
      <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">Refresh</span>
    </button>

    <div className="bg-indigo-500 text-white px-3 py-1 rounded-full">Admin</div>
  </div>
</header>


        {/* Content */}
        <main className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </div>
          )}

          {activePage === 'Dashboard' && (
            <>
              {/* Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {(loading ? [0,1,2,3] : metricCards).map((m, idx) => (
                  <div key={idx} className="flex items-center p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                    <div className="p-3 bg-indigo-100 dark:bg-indigo-600 rounded-full">
                      {loading ? <div className="w-6 h-6 rounded animate-pulse bg-indigo-300/60" /> : m.icon}
                    </div>
                    <div className="ml-4">
                      <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                        {loading ? <span className="inline-block w-16 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /> : m.value}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400">
                        {loading ? <span className="inline-block w-12 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /> : m.title}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Token Usage */}
              <section className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">Token Usage Over Time</h2>
                  {lastUpdated && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Updated {lastUpdated.toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tokenUsageData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="tokens" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {(!loading && tokenUsageData.length === 0) && (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No usage data for the last 7 days.</p>
                )}
              </section>
            </>
          )}

          {activePage === 'Users' && (
  <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-3">
  <div>
    <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">Users</h2>
    <p className="text-xs text-gray-500 dark:text-gray-400">Search by username or email, filter by role and status.</p>
  </div>

  <div className="flex flex-col sm:flex-row gap-2">
    {/* Search */}
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={userQuery}
        onChange={(e) => setUserQuery(e.target.value)}
        placeholder="Search by username or email..."
        className="w-64 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </div>

    {/* Role filter */}
    <select
      value={roleFilter}
      onChange={(e) => setRoleFilter(e.target.value)}
      className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      title="Filter by role"
    >
      <option value="all">All roles</option>
      {/* If you know your roles, list them explicitly. Otherwise, derive from users: */}
      {/* Example static roles: */}
      <option value="admin">admin</option>
      <option value="manager">manager</option>
      <option value="user">user</option>
      {/* Or compute dynamically below the table and lift them to state if you prefer */}
    </select>

    {/* Active filter */}
    <select
      value={activeFilter}
      onChange={(e) => setActiveFilter(e.target.value)}
      className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      title="Filter by status"
    >
      <option value="all">All users</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>

    {/* Manual refresh if needed */}
    <button
      onClick={loadUsers}
      className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Refresh
    </button>
  </div>
</div>


    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-gray-600 dark:text-gray-300">
          <tr>
            <th className="py-2 pr-4">Username</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Roles</th>
            <th className="py-2 pr-4">Active</th>
            <th className="py-2 pr-4">Last Login</th>
            <th className="py-2 pr-4">Actions</th>
          </tr>
        </thead>

        <tbody className="text-gray-800 dark:text-gray-100">
          {usersLoading ? (
            <tr><td className="py-4" colSpan={6}>Loading…</td></tr>
          ) : users.length === 0 ? (
            <tr><td className="py-4" colSpan={6}>No users found</td></tr>
          ) : users.map(u => {
              const isEditing = editingId === u.id;
              return (
                <tr key={u.id} className="border-t border-gray-200 dark:border-gray-700 align-top">
                  {/* Username */}
                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editDraft?.username || ""}
                        onChange={e => handleEditChange("username", e.target.value)}
                        className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="Username"
                      />
                    ) : (
                      <span className="font-medium">{u.username}</span>
                    )}
                  </td>

                  {/* Email */}
                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <input
                        type="email"
                        value={editDraft?.email || ""}
                        onChange={e => handleEditChange("email", e.target.value)}
                        className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="email@example.com"
                      />
                    ) : (
                      <span className="text-gray-700 dark:text-gray-200">{u.email}</span>
                    )}
                  </td>

                  {/* Roles */}
                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {editDraft?.roles?.length ? editDraft.roles.map(role => (
                            <span
                              key={role}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-700/40 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700"
                            >
                              {role}
                              <button
                                onClick={() => removeRoleFromDraft(role)}
                                className="ml-1 text-xs px-1 rounded hover:bg-indigo-200 dark:hover:bg-indigo-600"
                                title="Remove role"
                              >
                                ×
                              </button>
                            </span>
                          )) : (
                            <span className="text-gray-500">No roles</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={roleInput}
                            onChange={e => setRoleInput(e.target.value)}
                            onKeyDown={handleRoleKeyDown}
                            placeholder="Add role (press Enter)"
                            className="flex-1 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <button
                            onClick={() => addRoleToDraft(roleInput)}
                            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    ) : (
                      u.roles && u.roles.length ? u.roles.map(r => (
                        <span
                          key={r}
                          className="inline-block px-2 py-1 mr-1 rounded bg-indigo-100 dark:bg-indigo-700/40 text-indigo-700 dark:text-indigo-200"
                        >
                          {r}
                        </span>
                      )) : <span className="text-gray-500">—</span>
                    )}
                  </td>

                  {/* Active */}
                  <td className="py-2 pr-4">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <ToggleRight /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-500">
                        <ToggleRight /> Inactive
                      </span>
                    )}
                  </td>

                  {/* Last login */}
                  <td className="py-2 pr-4">
                    {u.last_login ? new Date(u.last_login).toLocaleString() : "—"}
                  </td>

                  {/* Actions */}
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveUserDraft(u)}
                            disabled={savingId === u.id}
                            className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                          >
                            {savingId === u.id ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(u)}
                            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(u)}
                            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            {u.is_active ? "Disable" : "Enable"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  </section>
)}


          {activePage === 'Chat Console' && (
            <ChatConsole api={API} token={token} />
        )}

          {activePage === 'Docs' && (
            <Docs /> 
          )}

          {activePage === 'Logs' && (
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">Recent Activities</h2>
                <button
                  onClick={loadLogs}
                  className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Refresh
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="py-2 pr-4">When</th>
                      <th className="py-2 pr-4">User</th>
                      <th className="py-2 pr-4">Activity</th>
                      <th className="py-2 pr-4">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-800 dark:text-gray-100">
                    {logsLoading ? (
                      <tr><td className="py-4" colSpan={4}>Loading…</td></tr>
                    ) : logs.length === 0 ? (
                      <tr><td className="py-4" colSpan={4}>No activities</td></tr>
                    ) : logs.map((l, i) => (
                      <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                        <td className="py-2 pr-4">{new Date(l.occurred_at).toLocaleString()}</td>
                        <td className="py-2 pr-4">{l.user_id || '—'}</td>
                        <td className="py-2 pr-4">{l.activity}</td>
                        <td className="py-2 pr-4"><code className="text-xs">{JSON.stringify(l.metadata || {})}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activePage === 'Settings' && (
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-3">Settings</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">Coming soon.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
