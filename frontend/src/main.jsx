import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ConfirmHost } from './lib/confirm';
import DataAvailabilityGuard from './components/DataAvailabilityGuard';
import EvidenceUploadPortal from './components/EvidenceUploadPortal';
import PasswordRecoveryGate from './components/PasswordRecoveryGate';

// i18n must be imported before the application entry so translations are ready
import './i18n';
import PublicEntry from './PublicEntry';
import './index.css';
import './shell-theme.css';
import './map-overrides.css';
import './login-simple.css';
import './login-crest.css';
import './public-typography.css';
import './header-logo.css';
import './sidebar-design.css';
import './workspace-blue.css';
import './sidebar-coastal.css';
import './twentyfirst-dashboard.css';
import './header-institutional-layout.css';
import './public-header-alignment.css';
import './fixed-workspace-shell.css';
// Phone-first authenticated workspace inspired by the approved mobile mock-ups.
import './mobile-dashboard.css';
import './project-setup-form-headings.css';
import './merl-reporting-fix.css';
import './typography-system.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: (failureCount, error) => {
        if (error?.response?.status >= 400 && error?.response?.status < 500) return false;
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

function PortalApp() {
  return (
    <Routes>
      <Route path="*" element={(
        <>
          <PasswordRecoveryGate />
          <PublicEntry />
          <EvidenceUploadPortal />
          <ConfirmHost />
          <DataAvailabilityGuard />
        </>
      )} />
    </Routes>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <PortalApp />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { borderRadius: '8px', background: '#1e293b', color: '#f8fafc', fontSize: '14px' },
            success: { iconTheme: { primary: '#22c55e', secondary: '#f8fafc' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#f8fafc' }, duration: 6000 },
          }}
        />
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
