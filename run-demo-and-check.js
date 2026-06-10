
const axios = require('axios');
const API_BASE = 'http://localhost:3000';

async function runDemo() {
  const user = { email: 'medecin@hphii.ma', role: 'Physician' };
  
  console.log(`\n================================================================`);
  console.log(`RUNNING DEMO SCENARIO FOR: ${user.role} (${user.email})`);
  console.log(`================================================================`);
  
  try {
    // 1. Login
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: user.email,
      password: 'Passw0rd!'
    });
    const token = loginRes.data.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    // 2. Run Demo
    console.log('Triggering /demo/run (this may take a few seconds)...');
    const demoRes = await axios.post(`${API_BASE}/demo/run`, {}, { headers });
    
    console.log(`\n[SUCCESS] Demo Patient Created: ${demoRes.data.patientName} (${demoRes.data.patientId})`);
    console.log('\nSteps Executed:');
    demoRes.data.steps.forEach(step => {
      console.log(`  - [${step.ok ? 'OK' : 'FAIL'}] ${step.label} ${step.detail ? `(${step.detail})` : ''}`);
    });

    // 3. Re-check KPIs
    console.log('\nFetching updated dashboard data...');
    const kpiRes = await axios.get(`${API_BASE}/kpis`, { headers });
    const data = kpiRes.data;

    console.log(`\nCohort Size: ${data.cohortSize}`);
    console.log(`Triage Stats:`, data.triage.byPriority);
    console.log(`Alert Stats:`, data.alerts);
    console.log(`Monitoring Observations: ${data.monitoring.observations}`);

  } catch (err) {
    console.log(`Error: ${err.message}`);
    if (err.response) console.log(`Details: ${JSON.stringify(err.response.data)}`);
  }
}

runDemo();
