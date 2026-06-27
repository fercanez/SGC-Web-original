import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminUsersPage from "./pages/AdminUsersPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ModulePlaceholderPage from "./pages/ModulePlaceholderPage";
import ModulesPortalPage from "./pages/ModulesPortalPage";
import { getHomePath } from "./config/appBase";

function RedirectHome() {
  useEffect(() => {
    window.location.replace(getHomePath());
  }, []);
  return null;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <ModulesPortalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gestion-catastral"
        element={
          <ProtectedRoute permission="dashboard.view">
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modulos/:moduleId"
        element={
          <ProtectedRoute>
            <ModulePlaceholderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/usuarios"
        element={
          <ProtectedRoute permission="users.read">
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<RedirectHome />} />
    </Routes>
  );
}
