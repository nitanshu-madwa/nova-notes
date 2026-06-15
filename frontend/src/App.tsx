import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAppStore } from '@/store';
import { AuthPage } from '@/pages/AuthPage';
import { AppShell } from '@/components/layout/AppShell';
import { AuthBootstrap } from '@/components/auth/AuthBootstrap';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 2 },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAppStore((s) => s.user);
  const token = localStorage.getItem('ae_access_token');
  if (!user && !token) return <Navigate to="/login" replace />;
  if (!user && token) {
    return (
      <div className="min-h-screen bg-void-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-cyan-300/20 border-t-cyan-300 rounded-full animate-spin" />
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthBootstrap>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(13,13,31,0.95)',
            color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(0,245,255,0.2)',
            borderRadius: '12px',
            fontSize: '13px',
            fontFamily: 'DM Sans, sans-serif',
            backdropFilter: 'blur(20px)',
          },
          success: {
            iconTheme: { primary: '#00f5ff', secondary: '#030308' },
          },
          error: {
            iconTheme: { primary: '#ff006e', secondary: '#030308' },
          },
        }}
      />
    </QueryClientProvider>
  );
}
