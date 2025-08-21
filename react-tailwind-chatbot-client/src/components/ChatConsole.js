// src/components/ChatConsole.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, User as UserIcon, MessageSquare, Loader2, Send, Copy,
  PencilLine, Trash2, ChevronDown, RefreshCcw
} from "lucide-react";

export default function ChatConsole({ api, token: tokenProp }) {
  const API = api || process.env.REACT_APP_RESTAPI_ENDPOINT || "http://localhost:8000";
  const token = tokenProp || localStorage.getItem("token");

  // Users
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState("");

  // Chats
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatQuery, setChatQuery] = useState("");
  const [selectedChat, setSelectedChat] = useState("");

  // Messages
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendAs, setSendAs] = useState("assistant"); // NEW: choose role

  // UI helpers
  const listRef = useRef(null);
  const [stuckBottom, setStuckBottom] = useState(true);
  const quickReplies = [
    "Thanks for the update!",
    "I’ll look into this and get back to you.",
    "Could you share more details?",
    "Noted—pushing this to the backlog.",
  ];

  // ---------- utils ----------
  function normalizeRole(role) {
    const s = (role || "").toString().trim().toLowerCase();
    if (["user", "human", "customer", "client", "you"].includes(s)) return "user";
    if (["assistant", "ai", "bot", "model"].includes(s)) return "assistant";
    // treat unknown as assistant to keep alignment predictable
    return "assistant";
  }
  function formatTime(ts) { try { return new Date(ts).toLocaleString(); } catch { return ""; } }
  function copy(text) { navigator.clipboard.writeText(text).catch(() => {}); }
  function avatar(role) {
    const r = normalizeRole(role);
    const bg = r === "user" ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600";
    const fg = r === "user" ? "text-white" : "text-gray-900 dark:text-white";
    const label = r === "user" ? "U" : "A";
    return <div className={`w-7 h-7 rounded-full flex items-center justify-center ${bg} ${fg} text-xs shrink-0`}>{label}</div>;
  }

  // ---------- Fetchers ----------
  async function loadUsers(q = "") {
    setUsersLoading(true);
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await fetch(`${API}/admin/users${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load users");
      setUsers(await res.json());
    } finally { setUsersLoading(false); }
  }

  async function loadChats(uid) {
    setChatsLoading(true);
    try {
      const res = await fetch(`${API}/admin/users/${uid}/chats`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load chats");
      setChats(await res.json());
    } finally { setChatsLoading(false); }
  }

  async function loadMessages(chatId, { scroll = true } = {}) {
    setMessagesLoading(true);
    try {
      const res = await fetch(`${API}/admin/chats/${chatId}/messages`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      setMessages(data);
      if (scroll) requestAnimationFrame(() => scrollToBottom(true));
    } finally { setMessagesLoading(false); }
  }

  async function sendReply() {
    const t = replyText.trim();
    if (!t || !selectedChat) return;
    setSending(true);
    try {
      // NEW: send role so backend stores correct sender ("user" or "assistant")
      const res = await fetch(`${API}/admin/chats/${selectedChat}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: t, role: sendAs }),
      });
      if (!res.ok) throw new Error("Failed to send reply");
      setReplyText("");
      await loadMessages(selectedChat, { scroll: true });
    } finally { setSending(false); }
  }

  // Optional: edit/delete (requires backend endpoints)
  async function editMessage(messageId, newText) {
    if (!selectedChat) return;
    const res = await fetch(`${API}/admin/chats/${selectedChat}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: newText }),
    });
    if (res.ok) loadMessages(selectedChat, { scroll: false });
  }
  async function deleteMessage(messageId) {
    if (!selectedChat) return;
    const res = await fetch(`${API}/admin/chats/${selectedChat}/messages/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) loadMessages(selectedChat, { scroll: false });
  }

  // ---------- Effects ----------
  useEffect(() => { loadUsers(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (selectedUser) { setSelectedChat(""); setMessages([]); loadChats(selectedUser); }
    else { setChats([]); setSelectedChat(""); setMessages([]); }
    // eslint-disable-next-line
  }, [selectedUser]);
  useEffect(() => { if (selectedChat) loadMessages(selectedChat); /* eslint-disable-line */ }, [selectedChat]);

  // ---------- Derived ----------
  const filteredChats = useMemo(() => {
    if (!chatQuery.trim()) return chats;
    const q = chatQuery.toLowerCase();
    return (chats || []).filter(c => (c.title || "").toLowerCase().includes(q));
  }, [chats, chatQuery]);

  // ---------- Scroll helpers ----------
  function scrollToBottom(force = false) {
    const el = listRef.current; if (!el) return;
    if (force || stuckBottom) el.scrollTop = el.scrollHeight;
  }
  function onScroll() {
    const el = listRef.current; if (!el) return;
    setStuckBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  }

  // ---------- Render ----------
  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 h-[calc(100vh-140px)] flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">Chat Console</h2>
        <button
          onClick={() => selectedChat ? loadMessages(selectedChat, { scroll: false }) : loadUsers(userQuery)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
        >
          <RefreshCcw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* LEFT: Users & Chats */}
        <div className="w-80 shrink-0 flex flex-col min-h-0">
          {/* Users */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Find user</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  className="w-full pl-7 pr-2 py-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                  placeholder="username or email…"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadUsers(userQuery)}
                />
              </div>
              <button
                onClick={() => loadUsers(userQuery)}
                className="px-3 py-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                title="Search"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mb-2">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Select user</label>
            <div className="relative">
              <UserIcon className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full pl-7 pr-2 py-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
              >
                <option value="">— choose —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                ))}
              </select>
            </div>
          </div>
          {usersLoading && <div className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading users…</div>}

          {/* Chats */}
          <div className="mt-4 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase text-gray-500 dark:text-gray-400">Chats</span>
              <span className="text-xs text-gray-400">{filteredChats.length}</span>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-7 pr-2 py-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                placeholder="Filter chats…"
                value={chatQuery}
                onChange={(e) => setChatQuery(e.target.value)}
              />
            </div>

            <div className="border rounded flex-1 min-h-0 overflow-y-auto">
              {chatsLoading ? (
                <div className="p-3 text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading chats…
                </div>
              ) : (filteredChats.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No chats</div>
              ) : filteredChats.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedChat(c.id)}
                  className={`px-3 py-2 cursor-pointer border-b dark:border-gray-700
                    ${selectedChat === c.id ? "bg-gray-100 dark:bg-gray-700" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}
                  title={c.title}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-500" />
                    <div className="text-sm truncate">{c.title || "(untitled chat)"}</div>
                  </div>
                  <div className="text-[11px] text-gray-500">{c.created_at ? new Date(c.created_at).toLocaleString() : ""}</div>
                </div>
              )))}
            </div>
          </div>
        </div>

        {/* RIGHT: Messages */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {selectedChat ? "Messages" : "Select a chat to view messages"}
            </div>
            <button
              onClick={() => selectedChat && loadMessages(selectedChat, { scroll: false })}
              className="px-2 py-1 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs flex items-center gap-2"
              disabled={!selectedChat}
              title="Reload messages"
            >
              <RefreshCcw className={`w-3 h-3 ${messagesLoading ? "animate-spin" : ""}`} />
              Reload
            </button>
          </div>

          {/* Message list */}
          <div
            ref={listRef}
            onScroll={onScroll}
            className="border rounded flex-1 min-h-0 overflow-y-auto p-3 space-y-3 bg-gray-50 dark:bg-gray-900/50"
          >
            {messagesLoading && (
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading messages…
              </div>
            )}
            {!messagesLoading && messages.length === 0 && (
              <div className="text-sm text-gray-500">No messages</div>
            )}
            {!messagesLoading && messages.map((m, i) => {
              const role = normalizeRole(m.role);
              const isUser = role === "user";
              return (
                <div key={m.id || i} className={`max-w-3xl flex gap-2 ${isUser ? "ml-auto" : "mr-auto"}`}>
                  {avatar(role)}
                  <div className={`group rounded-2xl px-4 py-2 shadow-sm border text-[15px] leading-relaxed whitespace-pre-wrap break-words
                    ${isUser
                      ? "bg-indigo-600 text-white border-indigo-700"
                      : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700"}`}>
                    <div className="text-[11px] opacity-70 mb-1 flex items-center justify-between">
                      <span>{role} • {formatTime(m.created_at)}</span>
                      {!isUser && (
                        <span className="hidden group-hover:flex items-center gap-2">
                          <button className="opacity-80 hover:opacity-100" onClick={() => copy(m.text)} title="Copy">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button className="opacity-80 hover:opacity-100" onClick={async () => {
                            const next = prompt("Edit assistant message:", m.text);
                            if (next != null && next !== m.text) await editMessage(m.id, next);
                          }} title="Edit">
                            <PencilLine className="w-3.5 h-3.5" />
                          </button>
                          <button className="opacity-80 hover:opacity-100" onClick={() => deleteMessage(m.id)} title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      )}
                    </div>
                    <div>{m.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Jump to latest */}
          {!stuckBottom && (
            <div className="flex justify-center mt-2">
              <button
                onClick={() => scrollToBottom(true)}
                className="px-3 py-1.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-1"
              >
                <ChevronDown className="w-4 h-4" /> Jump to latest
              </button>
            </div>
          )}

          {/* Composer */}
          <div className="mt-3 border rounded-2xl p-2 bg-white dark:bg-gray-800">
            {/* Send-as toggle */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Send as</span>
              <label className="text-xs flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="sendas"
                  value="assistant"
                  checked={sendAs === "assistant"}
                  onChange={() => setSendAs("assistant")}
                />
                <span>assistant</span>
              </label>
              <label className="text-xs flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="sendas"
                  value="user"
                  checked={sendAs === "user"}
                  onChange={() => setSendAs("user")}
                />
                <span>user</span>
              </label>
            </div>

            <div className="flex gap-2 items-end">
              <textarea
                value={replyText}
                onChange={(e) => {
                  setReplyText(e.target.value);
                  const ta = e.target; ta.style.height = "auto"; ta.style.height = Math.min(200, ta.scrollHeight) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
                }}
                placeholder={selectedChat ? `Type a ${sendAs} message… (Enter to send)` : "Select a chat, then type your message…"}
                className="flex-1 px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 min-h-[44px] max-h-[200px] resize-none"
                disabled={sending}
              />
              <button
                onClick={sendReply}
                disabled={!selectedChat || sending || !replyText.trim()}
                className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 h-[44px] flex items-center gap-2"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
