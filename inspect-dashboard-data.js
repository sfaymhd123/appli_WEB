
const axios = require('axios');
const API_BASE = 'http://localhost:3000';

async function inspectData() {
  const roles = [
    { email: 'medecin@hphii.ma', role: 'Physician' },
    { email: 'nurse@hphii.ma', role: 'Nurse' },
    { email: 'admin@hphii.ma', role: 'Admin' },
    { email: 'pharmacist@hphii.ma', role: 'Pharmacist' },
    { email: 'lab@hphii.ma', role: 'LabTechnician' }
  ];

  for (const user of roles) {
    console.log(`\n================================================================`);
    console.log(`FETCHING DASHBOARD DATA FOR: ${user.role} (${user.email})`);
    console.log(`================================================================`);
    
    try {
      const loginRes = await axios.post(`${API_BASE}/auth/login`, {
        email: user.email,
        password: 'Passw0rd!'
      });
      const token = loginRes.data.access_token;
      const headers = { Authorization: `Bearer ${token}` };

      const kpiRes = await axios.get(`${API_BASE}/kpis`, { headers });
      const data = kpiRes.data;

      console.log(`Source: ${data.source} (Generated at: ${data.generatedAt})`);
      console.log(`Cohort Size: ${data.cohortSize}`);
      
      console.log(`\n[Triage Stats]`);
      console.log(`  Total Triaged: ${data.triage.total}`);
      console.log(`  Critical (P1) %: ${data.triage.criticalPct}%`);
      console.log(`  Distribution:`, data.triage.byPriority);

      console.log(`\n[Alert Stats]`);
      console.log(`  Total Alerts: ${data.alerts.total}`);
      console.log(`  Pending: ${data.alerts.pending} (${data.alerts.pendingPct}%)`);
      console.log(`  Escalated: ${data.alerts.escalated} (${data.alerts.escalatedPct}%)`);
      console.log(`  Acknowledged: ${data.alerts.acknowledged} (${data.alerts.acknowledgedPct}%)`);

      console.log(`\n[Pathway Mix]`);
      console.log(`  Chronic: ${data.pathwayMix.chronic} (${data.pathwayMix.chronicPct}%)`);
      console.log(`  Episodic: ${data.pathwayMix.episodic} (${data.pathwayMix.episodicPct}%)`);

      console.log(`\n[Monitoring & Results]`);
      console.log(`  Observations: ${data.monitoring.observations}`);
      console.log(`  Lab Results: ${data.results.total} (${data.results.abnormalPct}% abnormal)`);
      console.log(`  Medication Requests: ${data.medications.total}`);

      if (user.role === 'Admin') {
        console.log(`\n[Staff & DSP Access]`);
        console.log(`  Total Staff: ${data.staffCount}`);
        console.log(`  Staff Distribution:`, data.staffDistribution);
        console.log(`  DSP Access by Role:`, data.dspAccessByRole);
      }

    } catch (err) {
      console.log(`Error: ${err.message}`);
      if (err.response) console.log(`Details: ${JSON.stringify(err.response.data)}`);
    }
  }
}

inspectData();
