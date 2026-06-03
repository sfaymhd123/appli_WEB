import axios from 'axios';

const GATEWAY_URL = 'http://localhost:3000';

async function getToken(email) {
  try {
    const res = await axios.post(`${GATEWAY_URL}/auth/login`, { email, password: 'Passw0rd!' });
    return res.data.access_token;
  } catch (err) {
    console.error(`Login failed for ${email}`);
    return null;
  }
}

async function runSeed() {
  console.log('Starting Highly Diverse Data Seeding...');
  const adminToken = await getToken('admin@hphii.ma');
  if (!adminToken) return;
  const adminApi = axios.create({ baseURL: GATEWAY_URL, headers: { Authorization: `Bearer ${adminToken}` } });

  const staff = [
    { email: 'dr.alami@hphii.ma', role: 'Physician', name: 'Alami', id: '928bbc1f-1488-4510-b162-4b83fbe57828', count: 3 },
    { email: 'dr.idrissi@hphii.ma', role: 'Physician', name: 'Idrissi', id: '5166a4a4-9918-4196-ad4a-c8d560a9f96c', count: 7 },
    { email: 'inf.meryem@hphii.ma', role: 'Nurse', name: 'Meryem', id: 'a703c9e3-3049-4c01-8bc3-83c16c93e59b', count: 2 },
    { email: 'inf.karim@hphii.ma', role: 'Nurse', name: 'Karim', id: '79f25e25-d9e0-4b13-b899-dba32fd7c69e', count: 5 }
  ];

  for (const s of staff) {
    console.log(`\n--- Seeding for ${s.email} (${s.role}) - Target: ${s.count} patients ---`);
    try {
      // Ensure Practitioner resource exists
      await adminApi.post('/practitioners', { resourceType: 'Practitioner', id: s.id, name: [{ family: s.name }] }).catch(()=>{});

      for (let i = 1; i <= s.count; i++) {
        const p = await adminApi.post('/patients', {
          firstName: s.name, lastName: `Diversified-${Math.random().toString(36).slice(-4)}`,
          gender: Math.random() > 0.5 ? 'female' : 'male', 
          birthYear: 1960 + Math.floor(Math.random() * 40),
          zoneType: i % 2 === 0 ? 'Urban' : 'Rural', 
          riskGroup: i === 1 ? 'Chronic-risk' : 'Standard',
          generalPractitioner: `Practitioner/${s.id}`
        });
        const pId = p.data.id;
        
        // Random observations count
        const obsCount = 2 + Math.floor(Math.random() * 5);
        for (let j = 0; j < obsCount; j++) {
           await adminApi.post('/observations', { 
             patientId: pId, 
             metric: 'heart-rate', 
             value: 60 + Math.random() * 60, 
             source: 'device' 
           });
        }
        
        // Random Alerts
        if (Math.random() > 0.6) {
          await adminApi.post('/triage', { 
            patientId: pId, systolicBp: 200, diastolicBp: 120, heartRate: 120, 
            respiratoryRate: 26, temperature: 39, symptomSeverity: 'critical', 
            complaint: `Urgence aléatoire pour ${s.name}` 
          });
        }
      }
      console.log(`✓ Diverse data isolated for ${s.name}`);
    } catch (err) {
      console.error(`✗ Error for ${s.name}:`, err.response?.data?.message || err.message);
    }
  }
  console.log('\nDiversified Seeding Complete.');
}

runSeed();
