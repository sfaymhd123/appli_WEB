
const axios = require('axios');
const HAPI_BASE = 'http://localhost:8080/fhir';

async function findDemoPatients() {
  try {
    const res = await axios.get(`${HAPI_BASE}/Patient?name=Fatima`);
    const entries = res.data.entry || [];
    console.log(`Found ${entries.length} patients matching 'Fatima'.`);
    for (const e of entries) {
      console.log(`- ${e.resource.id}: ${e.resource.name[0].given.join(' ')} ${e.resource.name[0].family}`);
    }
  } catch (err) {
    console.error(err.message);
  }
}

findDemoPatients();
