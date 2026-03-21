// ── API client with mock-data fallback for static hosting (GitHub Pages) ──────
import axios from 'axios';
import {
  DEMO_INDICATORS,
  DEMO_ACTIVITIES,
  DEMO_EVENTS,
  DEMO_ENGAGEMENTS,
  DEMO_FINANCIAL_SUMMARY,
  DEMO_TRANSACTIONS,
  DEMO_LEARNING,
  DEMO_USERS,
  DEMO_UPLOADS,
  DEMO_DASHBOARD_SUMMARY,
  DEMO_SYSTEM_HEALTH,
} from './mockData';

// Route matcher → mock response
function getMockResponse(url, params) {
  // Dashboard summary
  if (url.includes('/api/indicators/dashboard')) {
    return DEMO_DASHBOARD_SUMMARY;
  }

  // Indicator values for a specific indicator
  const indValueMatch = url.match(/\/api\/indicators\/(\d+)\/values/);
  if (indValueMatch) {
    const ind = DEMO_INDICATORS.find((i) => i.id === Number(indValueMatch[1]));
    return ind?.values ?? [];
  }

  // Indicators list
  if (url.includes('/api/indicators')) {
    return { items: DEMO_INDICATORS };
  }

  // Activity milestones
  const milestoneMatch = url.match(/\/api\/activities\/(\d+)\/milestones/);
  if (milestoneMatch) {
    const act = DEMO_ACTIVITIES.find((a) => a.id === Number(milestoneMatch[1]));
    return act?.milestones ?? [];
  }

  // Activities list
  if (url.includes('/api/activities')) {
    return { items: DEMO_ACTIVITIES };
  }

  // Events map (GeoJSON)
  if (url.includes('/api/events/map')) {
    return {
      type: 'FeatureCollection',
      features: DEMO_EVENTS.map((ev) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ev.longitude, ev.latitude] },
        properties: { id: ev.id, name: ev.name, event_type: ev.event_type, start_date: ev.start_date, economic_loss_vuv: ev.economic_loss_vuv },
      })),
    };
  }

  // Events list
  if (url.includes('/api/events')) {
    const limit = params?.limit ? Number(params.limit) : undefined;
    const items = limit ? DEMO_EVENTS.slice(0, limit) : DEMO_EVENTS;
    return { items };
  }

  // Community engagements
  if (url.includes('/api/community/engagements')) {
    return { items: DEMO_ENGAGEMENTS };
  }

  // Financial summary
  if (url.includes('/api/financials/summary')) {
    return DEMO_FINANCIAL_SUMMARY;
  }

  // Financial transactions
  if (url.includes('/api/financials/transactions')) {
    let items = [...DEMO_TRANSACTIONS];
    if (params?.transaction_type) {
      items = items.filter((t) => t.transaction_type === params.transaction_type);
    }
    const page = Number(params?.page) || 1;
    const perPage = Number(params?.per_page) || 20;
    const start = (page - 1) * perPage;
    return {
      items: items.slice(start, start + perPage),
      total: items.length,
      page,
      per_page: perPage,
      total_pages: Math.ceil(items.length / perPage),
    };
  }

  // Learning entries
  if (url.includes('/api/learning')) {
    return { items: DEMO_LEARNING };
  }

  // Admin users
  if (url.includes('/api/admin/users')) {
    return { items: DEMO_USERS };
  }

  // Admin health
  if (url.includes('/api/admin/health')) {
    return DEMO_SYSTEM_HEALTH;
  }

  // Upload history
  if (url.includes('/api/uploads/history')) {
    return { items: DEMO_UPLOADS };
  }

  // Reports endpoints — return data from corresponding data lists
  if (url.includes('/api/reports/indicators')) {
    return { items: DEMO_INDICATORS };
  }
  if (url.includes('/api/reports/activities')) {
    return { items: DEMO_ACTIVITIES };
  }
  if (url.includes('/api/reports/events')) {
    return { items: DEMO_EVENTS };
  }
  if (url.includes('/api/reports/community') || url.includes('/api/reports/participation')) {
    return { items: DEMO_ENGAGEMENTS };
  }
  if (url.includes('/api/reports/financials')) {
    return { items: DEMO_TRANSACTIONS };
  }
  if (url.includes('/api/reports/learning')) {
    return { items: DEMO_LEARNING };
  }
  if (url.includes('/api/reports/provinces')) {
    return { items: DEMO_ENGAGEMENTS };
  }

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
