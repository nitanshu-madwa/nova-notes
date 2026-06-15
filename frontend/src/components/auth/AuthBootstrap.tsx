import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAppStore } from '@/store';
import { authAPI, API_BASE } from '@/lib/api';
import type { User } from '@/types';

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { user, setAuth, clearAuth } = useAppStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refreshTokens(refresh: string) {
      const { data } = await axios.post(`${API_BASE}/api/auth/refresh`, {
        refresh_token: refresh,
      });
      localStorage.setItem('ae_access_token', data.access_token);
      localStorage.setItem('ae_refresh_token', data.refresh_token);
      return data.access_token as string;
    }

    async function restoreSession() {
      const token = localStorage.getItem('ae_access_token');
      const refresh = localStorage.getItem('ae_refresh_token');

      if (!token) {
        if (user) clearAuth();
        return;
      }

      try {
        const { data } = await authAPI.getMe();
        if (cancelled) return;
        const restored: User = {
          id: data.id,
          email: data.email,
          full_name: data.full_name,
          avatar_url: data.avatar_url,
          created_at: data.created_at,
          email_confirmed: data.email_confirmed,
        };
        setAuth(restored, token, refresh || '');
      } catch {
        if (!refresh) {
          clearAuth();
          return;
        }
        try {
          const newToken = await refreshTokens(refresh);
          if (cancelled) return;
          const { data } = await authAPI.getMe();
          const restored: User = {
            id: data.id,
            email: data.email,
            full_name: data.full_name,
            avatar_url: data.avatar_url,
            created_at: data.created_at,
            email_confirmed: data.email_confirmed,
          };
          const newRefresh = localStorage.getItem('ae_refresh_token') || refresh;
          setAuth(restored, newToken, newRefresh);
        } catch {
          clearAuth();
        }
      }
    }

    restoreSession().finally(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  if (!ready) {
    return (
      <div className="min-h-screen bg-void-950 grid-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(0,245,255,0.15), rgba(124,58,237,0.2))',
              border: '1px solid rgba(0,245,255,0.3)',
              boxShadow: '0 0 24px rgba(0,245,255,0.15)',
            }}
          >
            ✦
          </div>
          <div className="w-6 h-6 border-2 border-cyan-300/20 border-t-cyan-300 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
