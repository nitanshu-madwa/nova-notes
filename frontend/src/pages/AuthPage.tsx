import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { authAPI } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import type { AuthResponse } from '@/types';
import toast from 'react-hot-toast';

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const user = useAppStore((s) => s.user);
  const setAuth = useAppStore((s) => s.setAuth);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signup') {
        const trimmedEmail = email.trim().toLowerCase();
        const trimmedName = fullName.trim();
        const { data } = await authAPI.signUp({
          email: trimmedEmail,
          password,
          ...(trimmedName ? { full_name: trimmedName } : {}),
        });
        const signup = data as AuthResponse & { message?: string };
        if (signup.access_token && signup.user) {
          setAuth(signup.user, signup.access_token, signup.refresh_token);
          toast.success(signup.message || 'Welcome to Nova Notes!');
          navigate('/');
        } else {
          toast.success(data.message || 'Account created! Please sign in.');
          setMode('signin');
        }
      } else {
        const { data } = await authAPI.signIn({ email, password });
        setAuth(data.user, data.access_token, data.refresh_token);
        navigate('/');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-void-950 grid-bg flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #00f5ff, transparent)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-10 blur-[100px]"
        style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }} />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(0,245,255,0.2), rgba(124,58,237,0.2))', border: '1px solid rgba(0,245,255,0.3)', boxShadow: '0 0 20px rgba(0,245,255,0.2)' }}>
              <span className="text-xl">✦</span>
            </div>
            <span className="font-display text-2xl font-bold gradient-text-cyan">Nova Notes</span>
          </div>
          <p className="text-sm font-body" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Your intelligence, amplified
          </p>
        </div>

        {/* Card */}
        <div className="glass-bright rounded-2xl p-8">
          {/* Tab switcher */}
          <div className="flex rounded-xl p-1 mb-8"
            style={{ background: 'rgba(7,7,18,0.6)', border: '1px solid rgba(0,245,255,0.08)' }}>
            {(['signin', 'signup'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className="flex-1 py-2 rounded-lg text-sm font-display font-medium transition-all duration-200"
                style={{
                  background: mode === m ? 'rgba(0,245,255,0.1)' : 'transparent',
                  color: mode === m ? '#00f5ff' : 'rgba(255,255,255,0.4)',
                  border: mode === m ? '1px solid rgba(0,245,255,0.25)' : '1px solid transparent',
                  boxShadow: mode === m ? '0 0 15px rgba(0,245,255,0.1)' : 'none',
                }}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence>
              {mode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <label className="block text-xs font-mono mb-1.5" style={{ color: 'rgba(0,245,255,0.6)' }}>
                    FULL NAME
                  </label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name" className="input-void" />
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-xs font-mono mb-1.5" style={{ color: 'rgba(0,245,255,0.6)' }}>
                EMAIL
              </label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" required className="input-void" />
            </div>

            <div>
              <label className="block text-xs font-mono mb-1.5" style={{ color: 'rgba(0,245,255,0.6)' }}>
                PASSWORD
              </label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min 8 characters' : '••••••••'} required minLength={8}
                className="input-void" />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-display font-semibold text-sm relative overflow-hidden transition-all duration-200 mt-2"
              style={{
                background: loading ? 'rgba(0,245,255,0.05)' : 'linear-gradient(135deg, rgba(0,245,255,0.15), rgba(124,58,237,0.2))',
                border: '1px solid rgba(0,245,255,0.3)',
                color: loading ? 'rgba(0,245,255,0.4)' : '#00f5ff',
                boxShadow: loading ? 'none' : '0 0 20px rgba(0,245,255,0.15)',
              }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-cyan-300/30 border-t-cyan-300 rounded-full animate-spin" />
                  Processing…
                </span>
              ) : (
                mode === 'signin' ? 'Enter Nova →' : 'Begin Your Journey →'
              )}
            </button>
          </form>

          {/* Footer note */}
          <p className="text-center text-xs mt-6 font-body" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {mode === 'signin'
              ? 'New here? Switch to Create Account above'
              : 'Already have an account? Switch to Sign In'}
          </p>
          {mode === 'signup' && (
            <p className="text-center text-xs mt-3 font-body leading-relaxed" style={{ color: 'rgba(255,255,255,0.18)' }}>
              Use a real email (Gmail, Outlook, etc.). If sign-up fails, try Sign In — your account may already exist.
            </p>
          )}
        </div>

        {/* Features hint */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            { icon: '⚡', label: 'AI-powered' },
            { icon: '🔍', label: 'Semantic search' },
            { icon: '✦', label: 'Vector memory' },
          ].map((f) => (
            <div key={f.label} className="text-center p-3 rounded-xl"
              style={{ background: 'rgba(0,245,255,0.03)', border: '1px solid rgba(0,245,255,0.06)' }}>
              <div className="text-lg mb-1">{f.icon}</div>
              <div className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{f.label}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
