import { Routes, Route, Navigate } from 'react-router-dom';
import { PrivateRoute, useAuth } from '@tamshai/auth';
import WelcomePage from './pages/WelcomePage';
import LandingPage from './pages/LandingPage';
import CallbackPage from './pages/CallbackPage';
import DownloadsPage from './pages/DownloadsPage';

/**
 * Root route that shows Welcome page for unauthenticated users
 * and redirects authenticated users to the portal
 */
function RootRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Authenticated users go to the portal
  if (isAuthenticated) {
    return <Navigate to="/portal" replace />;
  }

  // Unauthenticated users see the welcome page
  return <WelcomePage />;
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
