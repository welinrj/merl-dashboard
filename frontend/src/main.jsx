import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ConfirmHost } from './lib/confirm';
import DataAvailabilityGuard from './components/DataAvailabilityGuard';
import AreaPerformanceBridge from './components/AreaPerformanceBridge';

// i18n must be imported before the application entry so translations are ready
import './i18n';
import PublicEntry from './PublicEntry';
import './index.css';
// Shell theme — loaded after index.css so it overrides the shell rules there.
import './shell-theme.css';
// Map-specific presentation overrides.
import './map-overrides.css';
// Authorised-user login presentation. Loaded last so it can simplify the
// existing LoginScreen without touching authentication behaviour.
import './login-simple.css';
// Official Government of Vanuatu identity placement for the simple login card.
import './login-crest.css';
// Public homepage and login typography hierarchy; does not restyle the MERL workspace.
import './public-typography.css';
// Replace the duplicate application-header title with the existing MERL emblem.
import './header-logo.css';
// Scoped coastal detailing for the authenticated sidebar only.
import './sidebar-design.css';

// React Query client — aggressive retry on network errors, conservative on 4xx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: (failureCount, error) => {
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <PublicEntry />
        <AreaPerformanceBridge />
        <ConfirmHost />
        <DataAvailabilityGuard />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '8px',
              background: '#1e293b',
              color: '#f8fafc',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#22c55e', secondary: '#f8fafc' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#f8fafc' },
              duration: 6000,
            },
          }}
        />
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
