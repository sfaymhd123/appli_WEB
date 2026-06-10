const axios = require('axios');
const API_BASE = 'http://localhost:3000';

async function testRegistration() {
  try {
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'medecin@hphii.ma',
      password: 'Passw0rd!'
    });
    const token = loginRes.data.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    const kpiBefore = await axios.get(`${API_BASE}/kpis`, { headers });
    console.log(`Patients before: ${kpiBefore.data.cohortSize}`);

    const newPatient = {
      firstName: 'Test',
      lastName: 'Registration',
      gender: 'male',
      birthDate: '1980-05-15',
      zoneType: 'Rural',
      riskGroup: 'Low-risk',
      generalPractitioner: 'Practitioner/' + loginRes.data.sub
    };
    
    console.log('Registering patient...', newPatient);
    await axios.post(`${API_BASE}/patients`, newPatient, { headers });

    const kpiAfter = await axios.get(`${API_BASE}/kpis`, { headers });
    console.log(`Patients after: ${kpiAfter.data.cohortSize}`);
    
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
}

testRegistration();