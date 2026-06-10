
const axios = require('axios');
const API_BASE = 'http://localhost:3000';

const USERS = [
  { id: "568e30cc-79ea-49e2-b707-aefc5dc2e880", email: "medecin@hphii.ma", name: "Dr. Alami", role: "Physician" },
  { id: "1d5f0c9a-cc66-4254-ae38-329d7de081d6", email: "nurse@hphii.ma", name: "Inf. Meryem", role: "Nurse" },
  { id: "3266f995-7067-4626-8fc3-a7aa49d2930a", email: "admin@hphii.ma", name: "Admin", role: "Admin" },
  { id: "59fed781-7fba-4caa-b0e6-e3086f592297", email: "pharmacist@hphii.ma", name: "Pharma. Selma", role: "Pharmacist" },
  { id: "eaf1e6c1-7312-4f24-833f-5b6be14f2a14", email: "lab@hphii.ma", name: "Lab. Aziz", role: "LabTechnician" }
];

async function seedPractitioners() {
  console.log('Seeding Practitioners in HAPI FHIR...');
  
  try {
    // 1. Login as admin
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'admin@hphii.ma',
      password: 'Passw0rd!'
    });
    const token = loginRes.data.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    for (const user of USERS) {
      const practitioner = {
        resourceType: 'Practitioner',
        id: user.id,
        active: true,
        name: [{ text: user.name }],
        telecom: [{ system: 'email', value: user.email }]
      };

      try {
        await axios.post(`${API_BASE}/practitioners`, practitioner, { headers });
        console.log(`✓ Created Practitioner: ${user.name} (${user.id})`);
      } catch (err) {
        console.log(`✗ Failed to create Practitioner ${user.name}: ${err.message}`);
      }
    }
  } catch (err) {
    console.log(`Critical Error: ${err.message}`);
  }
}

seedPractitioners();
