import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
});

// Add a request interceptor to inject the token
api.interceptors.request.use(
    (config) => {
        const user = JSON.parse(localStorage.getItem('user'));
        if (user && user.token) {
            config.headers.Authorization = `Bearer ${user.token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor: a 401 on a request that DID carry a token means the
// stored JWT is expired/invalid (e.g. the 30-day expiry lapsed) — the backend
// rejects every call this way, silently, forever, with nothing telling the
// user their session died. That looked like "my history disappeared": the
// data is still there server-side, the app just can no longer prove who's
// asking. So: on 401 with a token attached, drop the dead credentials and
// send the user back to log in instead of failing quietly on every request.
let _redirectingToLogin = false;
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const hadToken = !!error?.config?.headers?.Authorization;
        if (status === 401 && hadToken && !_redirectingToLogin) {
            _redirectingToLogin = true;
            try { localStorage.removeItem('user'); } catch { /* ignore */ }
            if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
                window.location.href = '/login?sessionExpired=1';
            }
        }
        return Promise.reject(error);
    }
);

export default api;