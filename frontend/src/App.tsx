import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RequestsListPage from './pages/RequestsListPage';
import RequestCreatePage from './pages/RequestCreatePage';
import RequestDetailPage from './pages/RequestDetailPage';
import AdminPage from './pages/AdminPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminOfficesPage from './pages/AdminOfficesPage';
import AdminReferencePage from './pages/AdminReferencePage';
import AdminRolesPage from './pages/AdminRolesPage';
import { useAuth } from './lib/auth';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <span className="spinner"></span> Loading session…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  return children;
}

/** Gate the admin area to the SYSADMIN persona. */
function RequireSysadmin({ children }: { children: JSX.Element }) {
  const { hasPersona } = useAuth();
  if (!hasPersona('SYSADMIN')) return <Navigate to="/requests" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/requests" replace />} />
        <Route path="/requests" element={<RequestsListPage />} />
        <Route path="/requests/new" element={<RequestCreatePage />} />
        <Route path="/requests/:id" element={<RequestDetailPage />} />
        <Route path="/admin" element={<RequireSysadmin><AdminPage /></RequireSysadmin>}>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="offices" element={<AdminOfficesPage />} />
          <Route path="reference" element={<AdminReferencePage />} />
          <Route path="roles" element={<AdminRolesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
