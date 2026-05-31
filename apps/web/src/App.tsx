import { Navigate, Route, Routes } from 'react-router-dom';
import { Role } from '@hphii/fhir-domain';
import { LoginPage } from './features/auth/login-page';
import { DashboardPage } from './features/dashboard/dashboard-page';
import { ModulePlaceholderPage } from './features/placeholder/module-placeholder-page';
import { PatientsListPage } from './features/patients/patients-list-page';
import { PatientRegistrationPage } from './features/patients/patient-registration-page';
import { PatientDetailPage } from './features/patients/patient-detail-page';
import { DspEntryPage } from './features/dsp/dsp-entry-page';
import { DspPage } from './features/dsp/dsp-page';
import { PathwayEntryPage } from './features/pathway/pathway-entry-page';
import { PathwayPage } from './features/pathway/pathway-page';
import { TriagePage } from './features/triage/triage-page';
import { MonitoringDashboardPage } from './features/monitoring/monitoring-dashboard-page';
import { SmsIntakePage } from './features/monitoring/sms-intake-page';
import { ServicesPage } from './features/services/services-page';
import { AnalyticsPage } from './features/analytics/analytics-page';
import { ProtectedRoute, RequireResource, RequireRole } from './routes/protected-route';

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
        {/* DSP (M6): read_record is allowed for all roles — the gateway filters
            the Bundle per §6, so no client-side resource/role gate here. */}
        <Route path="/dsp" element={<DspEntryPage />} />
        <Route path="/dsp/:patientId" element={<DspPage />} />
        <Route
          path="/triage"
          element={
            <RequireRole roles={[Role.NURSE, Role.PHYSICIAN]}>
              <TriagePage />
            </RequireRole>
          }
        />
        {/* M4 monitoring dashboard — Observation + DetectedIssue both live here. */}
        <Route
          path="/observations"
          element={
            <RequireResource resource="Observation">
              <MonitoringDashboardPage />
            </RequireResource>
          }
        />
        <Route
          path="/alerts"
          element={
            <RequireResource resource="DetectedIssue">
              <MonitoringDashboardPage />
            </RequireResource>
          }
        />
        <Route
          path="/sms-intake"
          element={
            <RequireRole roles={[Role.NURSE, Role.PHYSICIAN]}>
              <SmsIntakePage />
            </RequireRole>
          }
        />
        {/* M3 parcours (chronic CarePlan + episodic Encounter). Nurse modifies the
            care record per §6 ("Modify clinical record: Nurse Yes (care)"); the §6
            $everything CarePlan→Physician filter governs only the M6 DSP bundle. */}
        <Route
          path="/care-plans"
          element={
            <RequireRole roles={[Role.PHYSICIAN, Role.NURSE]}>
              <PathwayEntryPage />
            </RequireRole>
          }
        />
        <Route
          path="/care-plans/:patientId"
          element={
            <RequireRole roles={[Role.PHYSICIAN, Role.NURSE]}>
              <PathwayPage />
            </RequireRole>
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
        {/* M5 services — one role-aware screen (Physician orders, Pharmacist
            validates, Lab-Technician records results) per §6. */}
        <Route
          path="/services"
          element={
            <RequireRole roles={[Role.PHYSICIAN, Role.PHARMACIST, Role.LAB_TECHNICIAN]}>
              <ServicesPage />
            </RequireRole>
          }
        />
        {/* Analytics — balanced-scorecard KPIs (admin + physician). */}
        <Route
          path="/analytics"
          element={
            <RequireRole roles={[Role.ADMIN, Role.PHYSICIAN]}>
              <AnalyticsPage />
            </RequireRole>
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
