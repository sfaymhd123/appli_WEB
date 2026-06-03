import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const HAPI_BASE = process.env.HAPI_FHIR_BASE_URL || 'http://localhost:8080/fhir';

async function rebalance() {
  console.log('Starting perfect data rebalancing...');

  // 1. Get all Users
  const users = await prisma.user.findMany();
  const physicians = users.filter(u => u.role === 'Physician');
  const nurses = users.filter(u => u.role === 'Nurse');
  const labTechs = users.filter(u => u.role === 'LabTechnician');
  const pharmacists = users.filter(u => u.role === 'Pharmacist');

  console.log(`Staff: ${physicians.length} MDs, ${nurses.length} Nurses, ${labTechs.length} Labs, ${pharmacists.length} Pharmas.`);

  // 2. Ensure all have Practitioner resources
  for (const user of users) {
    const practitioner = {
      resourceType: 'Practitioner',
      id: user.id,
      identifier: [{ system: 'https://hphii.ma/fhir/practitioner-id', value: user.email }],
      name: [{ text: user.email.split('@')[0] }]
    };
    await axios.put(`${HAPI_BASE}/Practitioner/${user.id}`, practitioner, {
      headers: { 'Content-Type': 'application/fhir+json' }
    });
  }

  // 3. Fetch all clinical data that needs assignment
  console.log('Fetching patients...');
  const patients = await fetchAll('Patient');
  console.log(`Found ${patients.length} patients.`);

  // 4. Perfect Patient Assignment (MDs and Nurses)
  // We use round-robin to ensure "heavy" patients (those with many observations) 
  // are spread across all doctors.
  console.log('Assigning patients to MDs and Nurses...');
  const patientUpdates = [];
  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    const md = physicians[i % physicians.length];
    const nurse = nurses[i % nurses.length];
    
    p.generalPractitioner = [
      { reference: `Practitioner/${md.id}` },
      { reference: `Practitioner/${nurse.id}` }
    ];
    patientUpdates.push(p);
  }
  await sendBatch(patientUpdates, 'Patient');

  // 5. Perfect Lab Results Assignment
  console.log('Fetching diagnostic reports...');
  const reports = await fetchAll('DiagnosticReport');
  console.log(`Assigning ${reports.length} reports to lab technicians...`);
  const drUpdates = [];
  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    const tech = labTechs[i % labTechs.length];
    r.performer = [{ reference: `Practitioner/${tech.id}` }];
    drUpdates.push(r);
  }
  await sendBatch(drUpdates, 'DiagnosticReport');

  // 6. Perfect Pharmacy Assignment
  console.log('Fetching medication requests...');
  const meds = await fetchAll('MedicationRequest');
  console.log(`Assigning ${meds.length} prescriptions to pharmacists...`);
  const mrUpdates = [];
  for (let i = 0; i < meds.length; i++) {
    const m = meds[i];
    const pharma = pharmacists[i % pharmacists.length];
    m.requester = { reference: `Practitioner/${pharma.id}` };
    mrUpdates.push(m);
  }
  await sendBatch(mrUpdates, 'MedicationRequest');

  console.log('Perfect rebalancing complete.');
}

async function fetchAll(type) {
  let resources = [];
  let url = `${HAPI_BASE}/${type}?_count=500`;
  while (url) {
    const res = await axios.get(url);
    if (res.data.entry) {
      resources.push(...res.data.entry.map(e => e.resource));
    }
    const next = (res.data.link || []).find(l => l.relation === 'next');
    url = next ? next.url : null;
    // Safety break for PoC
    if (resources.length > 10000) break;
  }
  return resources;
}

async function sendBatch(resources, type) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < resources.length; i += BATCH_SIZE) {
    const batch = resources.slice(i, i + BATCH_SIZE);
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: batch.map(r => ({
        fullUrl: `${HAPI_BASE}/${type}/${r.id}`,
        resource: r,
        request: { method: 'PUT', url: `${type}/${r.id}` }
      }))
    };
    await axios.post(HAPI_BASE, bundle, {
      headers: { 'Content-Type': 'application/fhir+json' }
    });
    console.log(`  Updated ${type} batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(resources.length / BATCH_SIZE)}`);
  }
}

rebalance()
  .catch(err => console.error(err.response?.data || err.message))
  .finally(() => prisma.$disconnect());
