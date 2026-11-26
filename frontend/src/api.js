import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
});

api.interceptors.request.use((config) => {
  const session = localStorage.getItem('balunijuk-session');
  if (session) {
    try {
      const { id } = JSON.parse(session);
      if (id) config.headers['x-user-id'] = id;
    } catch (error) {
      localStorage.removeItem('balunijuk-session');
    }
  }
  return config;
});

export function getPhotoUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const apiOrigin = api.defaults.baseURL.replace(/\/api\/?$/, '');
  return `${apiOrigin}${url}`;
}

export function getErrorMessage(error) {
  return error.response?.data?.message || error.message || 'Permintaan gagal. Silakan coba lagi.';
}
