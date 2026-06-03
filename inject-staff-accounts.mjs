import axios from 'axios';

const GATEWAY_URL = 'http://localhost:3000';

async function seedStaffAccounts() {
  console.log('Seeding additional staff accounts...');

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

  const staffMembers = [
    { email: 'dr.alami@hphii.ma', password: 'Passw0rd!', role: 'Physician' },
    { email: 'dr.idrissi@hphii.ma', password: 'Passw0rd!', role: 'Physician' },
    { email: 'inf.meryem@hphii.ma', password: 'Passw0rd!', role: 'Nurse' },
    { email: 'inf.karim@hphii.ma', password: 'Passw0rd!', role: 'Nurse' },
    { email: 'pharma.selma@hphii.ma', password: 'Passw0rd!', role: 'Pharmacist' },
    { email: 'lab.aziz@hphii.ma', password: 'Passw0rd!', role: 'Lab-Technician' }
  ];

  for (const staff of staffMembers) {
    try {
      await api.post('/users', staff);
      console.log(`✓ Created account: ${staff.email} (${staff.role})`);
    } catch (err) {
      if (err.response?.status === 409) {
        console.log(`! Account already exists: ${staff.email}`);
      } else {
        console.error(`✗ Failed to create ${staff.email}:`, err.response?.data?.message || err.message);
      }
    }
  }

  console.log('Seeding complete.');
}

seedStaffAccounts();
