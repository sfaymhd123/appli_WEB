import axios from 'axios';

const GATEWAY_URL = 'http://localhost:3000';

async function seedTestPatients() {
  console.log('Seeding test patients with phone numbers...');

  // 1. Log in as admin to get a token
  let token = '';
  try {
    const loginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'admin@hphii.ma',
      password: 'Passw0rd!'
    });
    token = loginRes.data.access_token;
    console.log('✓ Logged in as admin');
  } catch (err) {
    console.error('Failed to login. Make sure the gateway is running.');
    return;
  }

  const api = axios.create({
    baseURL: GATEWAY_URL,
    headers: { Authorization: `Bearer ${token}` }
  });

  const testPatients = [
    { firstName: 'Omar', lastName: 'Bennani', gender: 'male', birthYear: 1985, zoneType: 'Urban', riskGroup: 'Standard', phone: '+212600112233' },
    { firstName: 'Fatima', lastName: 'Zahra', gender: 'female', birthYear: 1992, zoneType: 'Rural', riskGroup: 'Chronic-risk', phone: '+212644556677' },
    { firstName: 'Yassine', lastName: 'Mansouri', gender: 'male', birthYear: 1978, zoneType: 'Peri-urban', riskGroup: 'Standard', phone: '+212688990011' },
    { firstName: 'Latifa', lastName: 'Alami', gender: 'female', birthYear: 1960, zoneType: 'Urban', riskGroup: 'Elderly', phone: '+212611223344' },
    { firstName: 'Driss', lastName: 'Tazi', gender: 'male', birthYear: 2005, zoneType: 'Rural', riskGroup: 'Pediatric', phone: '+212655667788' }
  ];

  for (const p of testPatients) {
    try {
      const res = await api.post('/patients', p);
      console.log(`✓ Added patient: ${p.firstName} ${p.lastName} (${p.phone}) -> FHIR ID: ${res.data.id}`);
      
      // Also add dummy coverage
      await api.post(`/patients/${res.data.id}/coverage`, { scheme: 'AMO', memberId: `TEST-${Math.floor(Math.random()*10000)}` });
    } catch (err) {
      console.error(`✗ Failed to add patient ${p.firstName}:`, err.response?.data?.message || err.message);
    }
  }

  console.log('Seeding complete.');
}

seedTestPatients();
