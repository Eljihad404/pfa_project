// src/AdminDashboard.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import ThemeToggle from './components/ThemeToggle';
import {
  Bell, User, MessageSquare, FileText, Settings, BarChart2, List, RefreshCcw, Shield, ToggleRight, File, 
} from 'lucide-react';
import Docs from "./docs";

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
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userQuery, setUserQuery] = useState('');

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
      const qs = userQuery ? `?q=${encodeURIComponent(userQuery)}` : '';
      const res = await fetch(`${API}/admin/users${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load users');
      setUsers(await res.json());
    } catch (e) {
      setError(e.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }

  async function toggleActive(u) {
    const body = { is_active: !u.is_active };
    const res = await fetch(`${API}/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) loadUsers();
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
        <div className="p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Admin</h2>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="focus:outline-none">
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
          <div className="flex items-center space-x-4">
            <input
              type="text"
              placeholder="Search..."
              className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-900 dark:border-gray-700"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && activePage === 'Users' && loadUsers()}
            />
            <button className="relative">
              <Bell className="w-6 h-6 text-gray-600 dark:text-gray-300" />
              <span className="absolute top-0 right-0 inline-block w-2 h-2 bg-red-600 rounded-full" />
            </button>
          </div>
          <div className="flex items-center space-x-3">
            <ThemeToggle />
            <button
              onClick={() => activePage === 'Dashboard' ? loadDashboard(true) : activePage === 'Users' ? loadUsers() : activePage === 'Logs' ? loadLogs() : null}
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
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">Users</h2>
                <button
                  onClick={loadUsers}
                  className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Refresh
                </button>
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
                    ) : users.map(u => (
                      <tr key={u.id} className="border-t border-gray-200 dark:border-gray-700">
                        <td className="py-2 pr-4">{u.username}</td>
                        <td className="py-2 pr-4">{u.email}</td>
                        <td className="py-2 pr-4">
                          {u.roles && u.roles.length ? u.roles.map(r => (
                            <span key={r} className="inline-block px-2 py-1 mr-1 rounded bg-indigo-100 dark:bg-indigo-700/40 text-indigo-700 dark:text-indigo-200">{r}</span>
                          )) : <span className="text-gray-500">—</span>}
                        </td>
                        <td className="py-2 pr-4">
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 text-green-600"><ToggleRight /> Active</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-500"><ToggleRight /> Inactive</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">{u.last_login ? new Date(u.last_login).toLocaleString() : '—'}</td>
                        <td className="py-2 pr-4">
                          <button
                            onClick={() => toggleActive(u)}
                            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            {u.is_active ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activePage === 'Chat Console' && (
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-3">Chat Console</h2>

              <div className="flex gap-4">
                {/* Left: users & chats */}
                <div className="w-72">
                  <div className="mb-2">
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Select user</label>
                    <select
                      value={selectedUser}
                      onChange={(e) => loadChatsForUser(e.target.value)}
                      className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                    >
                      <option value="">— choose —</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-3 border rounded h-[360px] overflow-y-auto">
                    {userChats.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500">No chats</div>
                    ) : userChats.map(c => (
                      <div
                        key={c.id}
                        onClick={() => loadMessages(c.id)}
                        className={`px-3 py-2 cursor-pointer border-b dark:border-gray-700 ${selectedChat === c.id ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                        title={c.title}
                      >
                        <div className="text-sm truncate">{c.title}</div>
                        <div className="text-xs text-gray-500">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: messages */}
                <div className="flex-1 flex flex-col">
                  <div className="border rounded h-[360px] overflow-y-auto p-3 space-y-2">
                    {chatMsgs.length === 0 ? (
                      <div className="text-sm text-gray-500">Select a chat to view messages</div>
                    ) : chatMsgs.map((m, i) => (
                      <div key={i} className={`max-w-3xl px-3 py-2 rounded ${m.role === 'user' ? 'bg-indigo-600 text-white ml-auto' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 mr-auto'}`}>
                        <div className="text-xs opacity-70 mb-1">{m.role} • {new Date(m.created_at).toLocaleString()}</div>
                        <div>{m.text}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                      placeholder="Send assistant reply…"
                      className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                      disabled={!selectedChat || sending}
                    />
                    <button
                      onClick={sendReply}
                      disabled={!selectedChat || sending}
                      className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </section>
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
