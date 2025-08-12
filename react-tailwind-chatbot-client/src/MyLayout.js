// src/MyLayout.js
import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from './components/ThemeToggle';
import logo from './logojesa.png';

// --- Small helpers ---
const getInitials = (username = '') => {
  const parts = username
    .replace(/[_.-]+/g, ' ')
    .trim()
    .split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const p = parts[0] || '';
  return (p[0] || '').toUpperCase() + (p[1] || '').toUpperCase();
};

// Typing effect for assistant responses
const TypingText = ({ text = '', speed = 12 }) => {
  const [display, setDisplay] = useState('');
  useEffect(() => {
    setDisplay('');
    let i = 0;
    const id = setInterval(() => {
      setDisplay(prev => prev + text.charAt(i));
      i++;
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return <span>{display}</span>;
};

// Single chat bubble
const ChatBubble = ({ role, children }) => {
  const isUser = role === 'user';
  const container = isUser ? 'justify-end' : 'justify-start';
  const bubble = isUser
    ? 'bg-indigo-600 text-white'
    : 'bg-white/80 dark:bg-gray-800/80 text-gray-800 dark:text-gray-100 border border-gray-200/60 dark:border-gray-700/60';
  return (
    <div className={`w-full flex ${container} py-2`}>
      <div className={`max-w-3xl px-4 py-3 rounded-2xl shadow-sm ${bubble}`}>
        {role === 'assistant' ? <TypingText text={children} /> : children}
      </div>
    </div>
  );
};

// Messages list
const ChatMessages = ({ messages }) => (
  <div className="flex-1 overflow-y-auto p-6 space-y-2">
    {messages.map((m, i) => (
      <ChatBubble key={i} role={m.role}>
        {m.content.map(c => c.text).join('\n')}
      </ChatBubble>
    ))}
  </div>
);

// Composer
const ChatInput = forwardRef(({ onSend, disabled }, ref) => {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };
  return (
    <div className="backdrop-blur bg-white/70 dark:bg-gray-900/60 border-t border-gray-200 dark:border-gray-700 p-4 flex items-center gap-2">
      <input
        ref={ref}
        type="text"
        disabled={disabled}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && send()}
        className="flex-grow px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder="Ask anything…"
      />
      <button
        onClick={send}
        disabled={disabled}
        className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-60"
      >
        Send
      </button>
    </div>
  );
});

// --- Main ---
export default function MyLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [me, setMe] = useState(null);
  const [chats, setChats] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');

  const inputRef = useRef();
  const scrollRef = useRef();

  const token = localStorage.getItem('token');
  const API = process.env.REACT_APP_RESTAPI_ENDPOINT || 'http://localhost:8000';
  useEffect(() => {
      if (!token) navigate('/auth', { replace: true });
  }, [token, navigate]);
  // load me + chats
  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (meRes.ok) setMe(await meRes.json());
      } catch {}
      fetchChats();
    })();
  }, []); // eslint-disable-line

  // autoscroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);
  const handleLogout = () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('roles');
    } finally {
      setChats([]);
      setMessages([]);
      setCurrentId(null);
      navigate('/auth', { replace: true });
   }
 };

  // --- API calls ---
  async function fetchChats() {
    setLoadingChats(true);
    try {
      const res = await fetch(`${API}/chats`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setChats(data);
      // auto-select latest if none
      if (!currentId && data.length) {
        loadChat(data[0].id);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to load chats');
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadChat(id) {
    setCurrentId(id);
    setMessages([]);
    try {
      const res = await fetch(`${API}/chat/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setMessages(await res.json());
    } catch (e) {
      console.error(e);
      setError('Failed to load conversation');
    }
  }

  // create a new chat row in DB, select it
  async function createChat(initialTitle = 'New chat') {
    try {
      const res = await fetch(`${API}/chat/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: initialTitle }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setChats(prev => [{ id: data.id, title: data.title }, ...prev]);
      setCurrentId(data.id);
      setMessages([]);
      return data.id;
    } catch (e) {
      console.error(e);
      setError('Failed to create chat');
      return null;
    }
  }

  async function renameChat(id, title) {
    try {
      const res = await fetch(`${API}/chat/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_id: id, title }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setChats(prev => prev.map(c => (c.id === id ? { ...c, title } : c)));
    } catch (e) {
      console.error(e);
    }
  }

  // send user message and stream assistant, persist on backend
  async function sendMessage(text) {
    setError('');
    setStreaming(true);
    let id = currentId;
    if (!id) {
      id = await createChat(text.slice(0, 48));
      if (!id) { setStreaming(false); return; }
    }

    // optimistic add user bubble
    setMessages(prev => [...prev, { role: 'user', content: [{ text }] }]);

    const payload = { message: text, chat_id: id };
    const res = await fetch(`${API}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) {
      setError('Error streaming response'); setStreaming(false); return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let assistantText = '';
    setMessages(prev => [...prev, { role: 'assistant', content: [{ text: '' }] }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      assistantText += chunk;
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: [{ text: assistantText }] };
        return copy;
      });
    }

    // refresh chats to reflect auto-titled first message
    fetchChats();
    setStreaming(false);
  }

  // UI actions
  const newChat = () => createChat().then(() => {});
  const initials = me ? getInitials(me.username || me.email || '') : 'U';

  return (
    <div className="h-screen w-full bg-gradient-to-br from-gray-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950 flex">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-72' : 'w-16'} transition-all duration-300 border-r border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg`}
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="JESA" className="h-8 w-8 rounded bg-white p-1 shadow" />
            {sidebarOpen && <span className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">JESA Chat</span>}
          </div>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            title={sidebarOpen ? 'Collapse' : 'Expand'}
          >
            {sidebarOpen ? '«' : '»'}
          </button>
        </div>

        <div className="px-4">
          <button
            onClick={newChat}
            className="w-full mb-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow"
          >
            {sidebarOpen ? 'New chat' : '+'}
          </button>
        </div>

        <div className="overflow-y-auto px-2 pb-4 h-[calc(100%-120px)]">
          {loadingChats ? (
            <p className="px-2 text-sm text-gray-500">Loading…</p>
          ) : (
            <ul className="space-y-1">
              {chats.map(c => (
                <li
                  key={c.id}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${currentId === c.id ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                  onClick={() => loadChat(c.id)}
                  onDoubleClick={() => {
                    if (!sidebarOpen) return;
                    const t = prompt('Rename chat', c.title || '');
                    if (t && t.trim()) renameChat(c.id, t.trim());
                  }}
                  title={c.title}
                >
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
                  {sidebarOpen ? (
                    <span className="truncate text-sm text-gray-800 dark:text-gray-200">{c.title || 'Untitled'}</span>
                  ) : (
                    <span className="text-sm text-gray-500">•</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="px-3 mt-2 text-sm text-red-500">{error}</p>}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur">
          <div className="flex items-center gap-3">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">
              {currentId ? 'Conversation' : 'Start a new conversation'}
            </h2>
            {streaming && <span className="text-xs px-2 py-1 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Generating…</span>}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
          <button
            onClick={handleLogout}
            className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Sign out"
          >
            Logout
          </button>
            {/* Avatar with initials */}
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center font-semibold text-white bg-gradient-to-br from-indigo-500 to-purple-500 select-none"
              title={me?.username || me?.email || 'User'}
            >
              {initials}
            </div>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <ChatMessages messages={messages} />
        </div>

        {/* Composer */}
        <ChatInput onSend={sendMessage} ref={inputRef} disabled={streaming} />
      </div>
    </div>
  );
}
