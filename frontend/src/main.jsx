import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ConfirmHost } from './lib/confirm';
import DataAvailabilityGuard from './components/DataAvailabilityGuard';
import AreaPerformanceBridge from './components/AreaPerformanceBridge';
import { supabase } from './supabaseClient';

// i18n must be imported before the application entry so translations are ready
import './i18n';
import PublicEntry from './PublicEntry';
import DoCCProjectRegister from './pages/DoCCProjectRegister';
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
// Approved blue workspace: full-width header, inset sidebar and responsive cards.
import './workspace-blue.css';
// Approved coastal footer, kept below the scrollable sidebar navigation.
import './sidebar-coastal.css';
// KPI, chart-card and progress treatments adapted only from 21st.dev patterns.
import './twentyfirst-dashboard.css';
// Final institutional header arrangement, after the existing shell and login styles.
import './header-institutional-layout.css';

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

function ProjectRegisterShortcut() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSignedIn(Boolean(data?.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSignedIn(Boolean(session));
    });
    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  if (!signedIn || window.location.hash.startsWith('#/docc-project-register')) return null;

  return (
    <Link
      to="/docc-project-register"
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 1200,
        minHeight: 40,
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 14px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,.22)',
        background: '#08233C',
        color: '#fff',
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: 800,
        boxShadow: '0 8px 24px rgba(8,35,60,.22)',
      }}
    >
      DoCC Project Register
    </Link>
  );
}

function PortalApp() {
  return (
    <Routes>
      <Route path="/docc-project-register" element={<DoCCProjectRegister />} />
      <Route path="*" element={(
        <>
          <PublicEntry />
          <AreaPerformanceBridge />
          <ConfirmHost />
          <DataAvailabilityGuard />
          <ProjectRegisterShortcut />
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
