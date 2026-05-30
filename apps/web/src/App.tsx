import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/login-page';
import { DashboardPage } from './features/dashboard/dashboard-page';
import { ModulePlaceholderPage } from './features/placeholder/module-placeholder-page';
import { PatientsListPage } from './features/patients/patients-list-page';
import { PatientRegistrationPage } from './features/patients/patient-registration-page';
import { PatientDetailPage } from './features/patients/patient-detail-page';
import { ProtectedRoute, RequireResource } from './routes/protected-route';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated app shell */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/patients"
          element={
            <RequireResource resource="Patient">
              <PatientsListPage />
            </RequireResource>
          }
        />
        <Route
          path="/patients/new"
          element={
            <RequireResource resource="Patient">
              <PatientRegistrationPage />
            </RequireResource>
          }
        />
        <Route
          path="/patients/:id"
          element={
            <RequireResource resource="Patient">
              <PatientDetailPage />
            </RequireResource>
          }
        />
        <Route
          path="/observations"
          element={
            <RequireResource resource="Observation">
              <ModulePlaceholderPage />
            </RequireResource>
          }
        />
        <Route
          path="/alerts"
          element={
            <RequireResource resource="DetectedIssue">
              <ModulePlaceholderPage />
            </RequireResource>
          }
        />
        <Route
          path="/care-plans"
          element={
            <RequireResource resource="CarePlan">
              <ModulePlaceholderPage />
            </RequireResource>
          }
        />
        <Route
          path="/documents"
          element={
            <RequireResource resource="DocumentReference">
              <ModulePlaceholderPage />
            </RequireResource>
          }
        />
        <Route
          path="/lab-results"
          element={
            <RequireResource resource="DiagnosticReport">
              <ModulePlaceholderPage />
            </RequireResource>
          }
        />
        <Route
          path="/prescriptions"
          element={
            <RequireResource resource="MedicationRequest">
              <ModulePlaceholderPage />
            </RequireResource>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireResource resource="AuditEvent">
              <ModulePlaceholderPage />
            </RequireResource>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
