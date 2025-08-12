// src/AuthPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import heroImage from './jesalogin.png'; // logo; replace with a wide hero if you have one
import logoImage from './logojesa.png';
import ThemeToggle from './components/ThemeToggle';
import { useAuth } from './auth/AuthProvider';

const API_ENDPOINT = process.env.REACT_APP_RESTAPI_ENDPOINT || 'http://localhost:8000';


export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const switchMode = (next) => {
    setMode(next);
    setError(''); setSuccess('');
    setUsername(''); setEmail(''); setPassword(''); setConfirmPassword('');
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  setError('');
  setSuccess('');
  if (mode === 'signup' && password !== confirmPassword) {
    setError('Passwords do not match');
    return;
  }
  try {
    setLoading(true);
    const route = mode === 'login' ? '/token' : '/users/register';
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': mode === 'login'
          ? 'application/x-www-form-urlencoded'
          : 'application/json'
      },
      body: mode === 'login'
        ? new URLSearchParams({ username, password }).toString()
        : JSON.stringify({ username, email, password }),
    };
    const res = await fetch(`${API_ENDPOINT}${route}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');

    if (mode === 'login') {
      const accessToken = data.access_token;
      login(accessToken);

      // role check
      const meRes = await fetch(`${API_ENDPOINT}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const me = await meRes.json();

      const roles = me.roles ?? (me.is_admin ? ['admin'] : ['user']);
      localStorage.setItem('roles', JSON.stringify(roles));

      if (roles.includes('admin')) {
        navigate('/admin');
      } else {
        navigate('/chat');
      }
    } else {
      setSuccess('Signup successful — please sign in.');
      switchMode('login');
    }
  } catch (err) {
    setError(err.message || 'Error');
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-3 bg-gray-50 dark:bg-gray-950 relative">
      {/* THEME TOGGLE */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* LEFT: Visual 2/3 */}
      <div className="relative hidden lg:block lg:col-span-2">
        {/* Background image (use a wide hero if available) */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        {/* Gradient veil for readability */}
        <div className="absolute inset-0 bg-gradient-to-tr from-gray-900/70 via-gray-900/25 to-transparent" />

        {/* Top brand bar */}
        <div className="absolute top-0 left-0 right-0 p-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="JESA" className="h-9 w-9 rounded bg-white/80 p-1" />
            <span className="text-white font-semibold tracking-wide text-lg">JESA Chatbot</span>
          </div>
        </div>

        {/* Bottom copy */}
        <div className="absolute bottom-10 left-10 max-w-xl text-white">
          <h1 className="text-3xl font-semibold leading-tight">
            Engineering Morocco’s future with data & AI.
          </h1>
          <p className="mt-3 text-white/80">
            Secure, seamless access to your internal AI assistant.
          </p>
        </div>

        {/* Subtle corner accent */}
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
      </div>

      {/* RIGHT: Form 1/3 */}
      <div className="col-span-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="backdrop-blur-sm bg-white/90 dark:bg-gray-900/70 border border-white/40 dark:border-white/10 shadow-xl rounded-2xl p-8">
            {/* Tabs */}
            <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-8">
              <button
                onClick={() => switchMode('login')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  mode === 'login'
                    ? 'bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  mode === 'signup'
                    ? 'bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Sign Up
              </button>
            </div>

            {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
            {success && <div className="text-green-600 mb-4 text-sm">{success}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute inset-y-0 right-2 px-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-lg shadow-indigo-600/20 transition disabled:opacity-60"
              >
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>

              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
                By continuing you agree to our Terms & Privacy Policy.
              </p>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
            © {new Date().getFullYear()} JESA – AI Assistant
          </p>
        </div>
      </div>
    </div>
  );
}
