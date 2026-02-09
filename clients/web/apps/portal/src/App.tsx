import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PrivateRoute, useAuth } from '@tamshai/auth';
import LandingPage from './pages/LandingPage';
import CallbackPage from './pages/CallbackPage';
import DownloadsPage from './pages/DownloadsPage';

/**
 * Root route that auto-redirects unauthenticated users to Keycloak SSO
 * and sends authenticated users to the portal
 */
function RootRoute() {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const redirecting = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !redirecting.current) {
      redirecting.current = true;
      signIn();
    }
  }, [isLoading, isAuthenticated, signIn]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return <Navigate to="/portal" replace />;
}

function App() {
  return (
    <Routes>
      {/* Public welcome page (redirects to portal if authenticated) */}
      <Route path="/" element={<RootRoute />} />

      {/* Protected portal routes */}
      <Route
        path="/portal"
        element={
          <PrivateRoute>
            <LandingPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/downloads"
        element={
          <PrivateRoute>
            <DownloadsPage />
          </PrivateRoute>
        }
      />

      {/* OIDC callback */}
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;
