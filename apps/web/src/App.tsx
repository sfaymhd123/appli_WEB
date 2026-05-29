import { Routes, Route } from 'react-router-dom';
import { ALL_ROLES, RoleLabels } from '@hphii/fhir-domain';

function Home() {
  return (
    <main className="min-h-screen bg-clinical-light/40 flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl bg-white shadow-md border border-clinical-light p-8">
        <h1 className="text-3xl font-bold text-clinical-dark">HPHII SHR</h1>
        <p className="mt-2 text-gray-600">
          Dossier de Santé Partagé — Hôpital Provincial Hassan II de Settat
        </p>
        <p className="mt-6 text-sm font-medium text-gray-500">
          FHIR domain loaded — {ALL_ROLES.length} RBAC roles:
        </p>
        <ul className="mt-2 space-y-1">
          {ALL_ROLES.map((role) => (
            <li key={role} className="text-sm text-gray-700">
              <span className="font-mono text-clinical">{role}</span> — {RoleLabels[role]}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
