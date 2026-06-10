
const axios = require('axios');
const HAPI_BASE = 'http://localhost:8080/fhir';

async function deleteDemoPatients() {
  console.log('Searching for demo patients (Fatima Zahra)...');
  
  try {
    const res = await axios.get(`${HAPI_BASE}/Patient?name=Fatima`);
    const entries = res.data.entry || [];
    const patients = entries.map(e => e.resource).filter(p => p.name?.[0]?.given?.includes('Fatima'));
    
    if (patients.length === 0) {
      console.log('No demo patients found.');
      return;
    }
    
    console.log(`Found ${patients.length} demo patients to delete.`);

    for (const patient of patients) {
      const pId = patient.id;
      console.log(`\nDeleting data for Patient/${pId}...`);

      // Get all resources for the patient
      const everythingRes = await axios.get(`${HAPI_BASE}/Patient/${pId}/$everything?_count=1000`);
      const allResources = (everythingRes.data.entry || []).map(e => e.resource);
      
      console.log(`  Found ${allResources.length} associated resources.`);

      // Build a transaction bundle to delete them
      // We must delete them in the correct order or just use individual deletes if we don't care about performance,
      // but transaction is better. Or batch. Let's use batch DELETE.
      const bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: allResources.map(r => ({
          request: {
            method: 'DELETE',
            url: `${r.resourceType}/${r.id}`
          }
        }))
      };

      try {
        await axios.post(HAPI_BASE, bundle, {
          headers: { 'Content-Type': 'application/fhir+json' }
        });
        console.log(`  ✓ Successfully deleted all resources for Patient/${pId}.`);
      } catch (err) {
        console.error(`  ✗ Failed to delete resources for Patient/${pId}: ${err.message}`);
        if (err.response) console.error(JSON.stringify(err.response.data));
      }
    }

    console.log('\nAll demo patients deleted.');
  } catch (err) {
    console.error(`Critical error: ${err.message}`);
  }
}

deleteDemoPatients();
