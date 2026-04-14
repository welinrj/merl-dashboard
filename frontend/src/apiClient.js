// ── API client — DoCC DMP (GitHub Pages demo mode) ───────────────────────────
// Pages use direct imports from mockData.js; this interceptor handles any
// legacy axios calls that might still exist.
import axios from 'axios';
import { PROJECTS, ALL_INDICATORS, DATASETS, SYSTEM_USERS, DASHBOARD_SUMMARY } from './mockData';

function getMockResponse(url) {
  if (url.includes('/api/dashboard'))  return DASHBOARD_SUMMARY;
  if (url.includes('/api/projects'))   return { items: PROJECTS };
  if (url.includes('/api/indicators')) return { items: ALL_INDICATORS };
  if (url.includes('/api/datasets'))   return { items: DATASETS };
  if (url.includes('/api/admin/users'))return { items: SYSTEM_USERS };
  return null;
}

// ── Axios response interceptor ───────────────────────────────────────────────
// On 404 / network error → return mock data so the app works on static hosting.

axios.interceptors.response.use(
  (response) => response,                         // pass-through on success
  (error) => {
    const url = error.config?.url ?? '';
    const params = error.config?.params;

    // Only intercept API calls
    if (!url.includes('/api/')) {
      return Promise.reject(error);
    }

    const mock = getMockResponse(url, params);
    if (mock !== null) {
      // Return a fake successful response
      return Promise.resolve({ data: mock, status: 200, statusText: 'OK (demo)', config: error.config, headers: {} });
    }

    // For POST/PUT requests (mutations) in demo mode, fake success
    if (error.config?.method === 'post' || error.config?.method === 'put') {
      return Promise.resolve({ data: { id: Date.now(), success: true }, status: 200, statusText: 'OK (demo)', config: error.config, headers: {} });
    }

    return Promise.reject(error);
  }
);

export default axios;
