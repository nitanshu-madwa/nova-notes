import axios from 'axios';

/** In dev, use Vite proxy (same origin). In prod, set VITE_API_URL to your API host. */
export const API_BASE = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  withCredentials: true,
});

// ── Request interceptor: inject auth token ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ae_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor: handle 401 ───────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('ae_refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_BASE}/api/auth/refresh`, {
            refresh_token: refresh,
          }, {
            withCredentials: true,
          });
          localStorage.setItem('ae_access_token', data.access_token);
          localStorage.setItem('ae_refresh_token', data.refresh_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          localStorage.removeItem('ae_access_token');
          localStorage.removeItem('ae_refresh_token');
          window.location.href = '/login';
        }
      } else {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ────────────────────────────────────────────────────────────────────
export const authAPI = {
  signUp: (d: { email: string; password: string; full_name?: string }) =>
    api.post('/auth/signup', d),
  signIn: (d: { email: string; password: string }) =>
    api.post('/auth/signin', d),
  signOut: () => api.post('/auth/signout'),
  getMe: () => api.get('/auth/me'),
  updateMe: (d: { full_name?: string }) => api.put('/auth/me', d),
};

// ── Notes ───────────────────────────────────────────────────────────────────
export const notesAPI = {
  list: (params?: Record<string, unknown>) => api.get('/notes/', { params }),
  get: (id: string) => api.get(`/notes/${id}`),
  create: (d: Record<string, unknown>) => api.post('/notes/', d),
  update: (id: string, d: Record<string, unknown>) => api.patch(`/notes/${id}`, d),
  delete: (id: string) => api.delete(`/notes/${id}`),
  archive: (id: string) => api.post(`/notes/${id}/archive`),
  unarchive: (id: string) => api.post(`/notes/${id}/unarchive`),
  toggleFavorite: (id: string) => api.post(`/notes/${id}/favorite`),
  bulkDelete: (ids: string[]) => api.post('/notes/bulk/delete', ids),
  bulkMove: (ids: string[], folderId: string | null) =>
    api.post('/notes/bulk/move', { note_ids: ids, folder_id: folderId }),
};

// ── Folders ─────────────────────────────────────────────────────────────────
export const foldersAPI = {
  list: () => api.get('/folders/'),
  get: (id: string) => api.get(`/folders/${id}`),
  create: (d: Record<string, unknown>) => api.post('/folders/', d),
  update: (id: string, d: Record<string, unknown>) => api.patch(`/folders/${id}`, d),
  delete: (id: string) => api.delete(`/folders/${id}`),
};

// ── Whiteboards ─────────────────────────────────────────────────────────────
export const whiteboardsAPI = {
  list: (params?: Record<string, unknown>) => api.get('/whiteboards/', { params }),
  get: (id: string) => api.get(`/whiteboards/${id}`),
  create: (d: Record<string, unknown>) => api.post('/whiteboards/', d),
  update: (id: string, d: Record<string, unknown>) => api.patch(`/whiteboards/${id}`, d),
  delete: (id: string) => api.delete(`/whiteboards/${id}`),
};

// ── AI ──────────────────────────────────────────────────────────────────────
export const aiAPI = {
  generateTags: (title: string, content: string) =>
    api.post('/ai/tags', { title, content }),
  suggestTitle: (content: string, existing_title?: string) =>
    api.post('/ai/title', { content, existing_title }),
  summarize: (title: string, content: string, note_id?: string) =>
    api.post('/ai/summarize', { title, content, note_id }),
  extractActionItems: (title: string, content: string, note_id?: string) =>
    api.post('/ai/action-items', { title, content, note_id }),
  improve: (title: string, content: string, instruction: string) =>
    api.post('/ai/improve', { title, content, instruction }),
  analyze: (title: string, content: string, note_id?: string) =>
    api.post('/ai/analyze', { title, content, note_id }),
};

// ── Search ──────────────────────────────────────────────────────────────────
export const searchAPI = {
  search: (d: Record<string, unknown>) => api.post('/search/', d),
  suggest: (q: string) => api.get('/search/suggest', { params: { q } }),
};

// ── Chat ────────────────────────────────────────────────────────────────────
export const chatAPI = {
  sendMessage: (d: { message: string; mode: string; session_id?: string | null }) =>
    api.post('/chat/message', d),
  sendMessageStream: async (d: { message: string; mode: string; session_id?: string | null }) => {
    const debugChat = import.meta.env.VITE_DEBUG_CHAT === 'true';
    const streamUrl = `${API_BASE}/api/chat/message/stream`;
    const debugStreamUrl = `${API_BASE}/api/chat/debug/stream-sim-noauth`;
    const fallbackUrl = '/chat/message';
    const token = localStorage.getItem('ae_access_token');

    const fetchDebugStream = async () => {
      const response = await fetch(debugStreamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      if (!response.ok) {
        throw new Error(`Debug stream failed: ${response.status}`);
      }
      return response;
    };

    if (debugChat) {
      return fetchDebugStream();
    }

    try {
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(d),
      });

      if (!response.ok) {
        if (import.meta.env.DEV) {
          return fetchDebugStream();
        }
        const { data } = await api.post(fallbackUrl, d);
        return { fallback: true, data } as any;
      }

      if (!response.body || !(response.body as any).getReader) {
        if (import.meta.env.DEV) {
          return fetchDebugStream();
        }
        const { data } = await api.post(fallbackUrl, d);
        return { fallback: true, data } as any;
      }

      return response;
    } catch (err) {
      if (import.meta.env.DEV) {
        try {
          return await fetchDebugStream();
        } catch {
          // continue to fallback if debug stream is unavailable
        }
      }
      const { data } = await api.post(fallbackUrl, d);
      return { fallback: true, data } as any;
    }
  },

  getSessions: () => api.get('/chat/sessions'),
  getSession: (id: string) => api.get(`/chat/session/${id}`),
  deleteSession: (id: string) => api.delete(`/chat/session/${id}`),
  clearHistory: () => api.delete('/chat/history'),
};
