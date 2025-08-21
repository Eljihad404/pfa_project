// src/AuthPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import heroImage from './jesalogin.png';
import logoImage from './logojesa.png';
import ThemeToggle from './components/ThemeToggle';
import { useAuth } from './auth/AuthProvider';

const API_ENDPOINT = process.env.REACT_APP_RESTAPI_ENDPOINT || 'http://localhost:8000';

export default function AuthPage() {
  // modes: 'login' | 'signup' | 'forgot' | 'verify' | 'reset'
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // reset flow
  const [code, setCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  const switchMode = (next) => {
    setMode(next);
    setError(''); setSuccess('');
    setUsername(''); setEmail(''); setPassword(''); setConfirmPassword('');
    setCode(''); setNewPw(''); setNewPw2('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

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
          'Content-Type': mode === 'login' ? 'application/x-www-form-urlencoded' : 'application/json'
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

        const meRes = await fetch(`${API_ENDPOINT}/users/me`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const me = await meRes.json();
        const roles = me.roles ?? (me.is_admin ? ['admin'] : ['user']);
        localStorage.setItem('roles', JSON.stringify(roles));
        if (roles.includes('admin')) navigate('/admin'); else navigate('/chat');
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

  // ======= Forgot password flow =======
  const requestReset = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!email) { setError('Enter your account email'); return; }
    try {
      setLoading(true);
      await fetch(`${API_ENDPOINT}/auth/request-password-reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      setSuccess('If an account exists, we sent a code to your email.');
      setMode('verify');
    } catch (e) {
      setError('Failed to request reset.');
    } finally { setLoading(false); }
  };

  const verifyResetCode = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!code || code.length < 4) { setError('Enter the 6‑digit code.'); return; }
    try {
      setLoading(true);
      const r = await fetch(`${API_ENDPOINT}/auth/verify-reset-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      }).then(r => r.json());
      if (!r.valid) throw new Error('Invalid or expired code.');
      setSuccess('Code verified. Set a new password.');
      setMode('reset');
    } catch (e) {
      setError(e.message || 'Invalid code');
    } finally { setLoading(false); }
  };

  const doResetPassword = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (newPw.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (newPw !== newPw2) { setError('Passwords do not match'); return; }
    try {
      setLoading(true);
      await fetch(`${API_ENDPOINT}/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, new_password: newPw })
      });
      setSuccess('Password updated. Please sign in.');
      switchMode('login');
    } catch (e) {
      setError('Reset failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-3 bg-gray-50 dark:bg-gray-950 relative">
      <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>

      {/* LEFT visual */}
      <div className="relative hidden lg:block lg:col-span-2">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroImage})` }} />
        <div className="absolute inset-0 bg-gradient-to-tr from-gray-900/70 via-gray-900/25 to-transparent" />
        <div className="absolute top-0 left-0 right-0 p-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="JESA" className="h-9 w-9 rounded bg-white/80 p-1" />
            <span className="text-white font-semibold tracking-wide text-lg">JESA Chatbot</span>
          </div>
        </div>
        <div className="absolute bottom-10 left-10 max-w-xl text-white">
          <h1 className="text-3xl font-semibold leading-tight">Engineering Morocco’s future with data & AI.</h1>
          <p className="mt-3 text-white/80">Secure, seamless access to your internal AI assistant.</p>
        </div>
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
      </div>

      {/* RIGHT form */}
      <div className="col-span-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="backdrop-blur-sm bg-white/90 dark:bg-gray-900/70 border border-white/40 dark:border-white/10 shadow-xl rounded-2xl p-8">
            {/* Tabs */}
            <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-8">
              <button onClick={() => switchMode('login')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'login' ? 'bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}>Sign In</button>
              <button onClick={() => switchMode('signup')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'signup' ? 'bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}>Sign Up</button>
            </div>

            {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
            {success && <div className="text-green-600 mb-4 text-sm">{success}</div>}

            {/* LOGIN / SIGNUP */}
            {(mode === 'login' || mode === 'signup') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Username</label>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                {mode === 'signup' && (
                  <div>
                    <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                  </div>
                )}
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Password</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute inset-y-0 right-2 px-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" aria-label={showPw ? 'Hide password' : 'Show password'}>{showPw ? '🙈' : '👁️'}</button>
                  </div>
                </div>
                {mode === 'signup' && (
                  <div>
                    <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Confirm Password</label>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                  </div>
                )}

                <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-lg shadow-indigo-600/20 transition disabled:opacity-60">{loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}</button>

                {mode === 'login' && (
                  <div className="text-right text-sm mt-2">
                    <button type="button" onClick={() => switchMode('forgot')} className="text-indigo-600 hover:underline">Forgot password?</button>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">By continuing you agree to our Terms & Privacy Policy.</p>
              </form>
            )}

            {/* FORGOT EMAIL */}
            {mode === 'forgot' && (
              <form onSubmit={requestReset} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Account email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-lg shadow-indigo-600/20 transition disabled:opacity-60">Send code</button>
                <button type="button" onClick={() => switchMode('login')} className="w-full py-2.5 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200">Back to sign in</button>
              </form>
            )}

            {/* VERIFY CODE */}
            {mode === 'verify' && (
              <form onSubmit={verifyResetCode} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Enter the 6‑digit code (sent to {email})</label>
                  <input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-full tracking-widest text-center text-lg rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <button type="submit" disabled={loading || code.length < 6} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-lg shadow-indigo-600/20 transition disabled:opacity-60">Verify</button>
                <div className="text-center text-sm">
                  <button type="button" onClick={requestReset} className="text-indigo-600 hover:underline">Resend code</button>
                </div>
              </form>
            )}

            {/* RESET PASSWORD */}
            {mode === 'reset' && (
              <form onSubmit={doResetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">New password</label>
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Confirm password</label>
                  <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-lg shadow-indigo-600/20 transition disabled:opacity-60">Update password</button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">© {new Date().getFullYear()} JESA – AI Assistant</p>
        </div>
      </div>
    </div>
  );
}