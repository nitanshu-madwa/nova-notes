import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store';
import toast from 'react-hot-toast';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAppStore((s) => s.user);
  const setAuth = useAppStore((s) => s.setAuth);

  useEffect(() => {
    // If user is already logged in, redirect home
    if (user) {
      navigate('/', { replace: true });
      return;
    }

    // Check for error from Supabase
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    if (error) {
      toast.error(errorDescription || `Authentication error: ${error}`);
      navigate('/login', { replace: true });
      return;
    }

    // The auth token should be automatically set by Supabase
    // If there's a code, Supabase handles it automatically
    // Just redirect to home if no error
    const code = searchParams.get('code');
    if (code) {
      toast.success('Email confirmed! You can now sign in.');
    }
    
    navigate('/login', { replace: true });
  }, [searchParams, user, navigate, setAuth]);

  return (
    <div className="min-h-screen bg-void-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-cyan-300/30 border-t-cyan-300 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-cyan-300/60">Confirming your email...</p>
      </div>
    </div>
  );
}
