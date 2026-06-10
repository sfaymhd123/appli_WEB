
const axios = require('axios');
const API_BASE = 'http://localhost:3000';

const USERS = [
  { email: 'medecin@hphii.ma', role: 'Physician' },
  { email: 'nurse@hphii.ma', role: 'Nurse' },
  { email: 'admin@hphii.ma', role: 'Admin' },
  { email: 'pharmacist@hphii.ma', role: 'Pharmacist' },
  { email: 'lab@hphii.ma', role: 'LabTechnician' },
];

async function verify() {
  console.log('Verifying dashboards for all roles...\n');
  
  for (const user of USERS) {
    console.log(`\n--- Role: ${user.role} (${user.email}) ---`);
    try {
      // 1. Login
      const loginRes = await axios.post(`${API_BASE}/auth/login`, {
        email: user.email,
        password: 'Passw0rd!'
      });
      const token = loginRes.data.access_token;
      const headers = { Authorization: `Bearer ${token}` };

      // 2. Check KPIs (Dashboard main data)
      try {
        const kpiRes = await axios.get(`${API_BASE}/kpis`, { headers });
        console.log(`[OK] /kpis: ${kpiRes.data.cohortSize} patients in cohort.`);
      } catch (err) {
        console.log(`[FAIL] /kpis: ${err.response?.status} ${err.message}`);
      }

      // 3. Check Triage Queue (Nurse/Physician only)
      try {
        const triageRes = await axios.get(`${API_BASE}/triage/queue`, { headers });
        console.log(`[OK] /triage/queue: ${triageRes.data.total} in queue.`);
      } catch (err) {
        const status = err.response?.status;
        if (['Pharmacist', 'LabTechnician', 'Admin'].includes(user.role) && status === 403) {
          console.log(`[OK] /triage/queue: Forbidden as expected (403).`);
        } else {
          console.log(`[FAIL] /triage/queue: ${status} ${err.message}`);
        }
      }

      // 4. Check Alerts (Nurse/Physician only)
      try {
        const alertsRes = await axios.get(`${API_BASE}/alerts`, { headers });
        console.log(`[OK] /alerts: ${alertsRes.data.total} active alerts.`);
      } catch (err) {
        const status = err.response?.status;
        if (['Pharmacist', 'LabTechnician', 'Admin'].includes(user.role) && status === 403) {
          console.log(`[OK] /alerts: Forbidden as expected (403).`);
        } else {
          console.log(`[FAIL] /alerts: ${status} ${err.message}`);
        }
      }

      // 5. Check Audit Logs (Admin only)
      try {
        const auditRes = await axios.get(`${API_BASE}/dsp/audit`, { headers });
        console.log(`[OK] /dsp/audit: ${auditRes.data.events.length} events found.`);
      } catch (err) {
        const status = err.response?.status;
        if (user.role !== 'Admin' && status === 403) {
          console.log(`[OK] /dsp/audit: Forbidden as expected (403).`);
        } else {
          console.log(`[FAIL] /dsp/audit: ${status} ${err.message}`);
        }
      }

      // 6. Check Documents (Admin/Physician/Nurse only)
      try {
        const docsRes = await axios.get(`${API_BASE}/dsp/documents`, { headers });
        console.log(`[OK] /dsp/documents: ${docsRes.data.total || 0} documents found.`);
      } catch (err) {
        const status = err.response?.status;
        if (['Pharmacist', 'LabTechnician'].includes(user.role) && status === 403) {
          console.log(`[OK] /dsp/documents: Forbidden as expected (403).`);
        } else {
          console.log(`[FAIL] /dsp/documents: ${status} ${err.message}`);
        }
      }

    } catch (err) {
      console.log(`[CRITICAL] Login failed: ${err.message}`);
    }
  }
}

verify();
