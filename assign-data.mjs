import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const HAPI_BASE = process.env.HAPI_FHIR_BASE_URL || 'http://localhost:8080/fhir';

async function main() {
  // 1. Get all Users
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} total users.`);

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
  console.log('Ensure all users have Practitioner resources in HAPI.');

  const nurses = users.filter(u => u.role === 'Nurse');
  const labTechs = users.filter(u => u.role === 'LabTechnician');
  const pharmacists = users.filter(u => u.role === 'Pharmacist');

  // 3. Assign all Patients to all Nurses
  const patientsRes = await axios.get(`${HAPI_BASE}/Patient?_count=1000`);
  const patients = (patientsRes.data.entry || []).map(e => e.resource);
  console.log(`Assigning ${patients.length} patients to ${nurses.length} nurses.`);

  const patientUpdates = [];
  for (const patient of patients) {
    if (!patient.generalPractitioner) patient.generalPractitioner = [];
    let changed = false;
    for (const nurse of nurses) {
      const ref = `Practitioner/${nurse.id}`;
      if (!patient.generalPractitioner.some(r => r.reference === ref)) {
        patient.generalPractitioner.push({ reference: ref });
        changed = true;
      }
    }
    if (changed) patientUpdates.push(patient);
  }
  await sendBatch(patientUpdates, 'Patient');

  // 4. Assign all DiagnosticReports to all LabTechs
  const drRes = await axios.get(`${HAPI_BASE}/DiagnosticReport?_count=1000`);
  const reports = (drRes.data.entry || []).map(e => e.resource);
  console.log(`Assigning ${reports.length} diagnostic reports to ${labTechs.length} lab technicians.`);

  const drUpdates = [];
  for (const report of reports) {
    if (!report.performer) report.performer = [];
    let changed = false;
    for (const tech of labTechs) {
      const ref = `Practitioner/${tech.id}`;
      if (!report.performer.some(r => r.reference === ref)) {
        report.performer.push({ reference: ref });
        changed = true;
      }
    }
    if (changed) drUpdates.push(report);
  }
  await sendBatch(drUpdates, 'DiagnosticReport');

  // 5. Assign all MedicationRequests to all Pharmacists
  const mrRes = await axios.get(`${HAPI_BASE}/MedicationRequest?_count=1000`);
  const meds = (mrRes.data.entry || []).map(e => e.resource);
  console.log(`Assigning ${meds.length} medication requests to ${pharmacists.length} pharmacists.`);

  const mrUpdates = [];
  for (const med of meds) {
    let changed = false;
    // MedicationRequest.requester is a single Reference in R4
    // We'll just pick the first pharmacist for each or round-robin
    const pharma = pharmacists[mrUpdates.length % pharmacists.length];
    const ref = `Practitioner/${pharma.id}`;
    if (med.requester?.reference !== ref) {
      med.requester = { reference: ref };
      changed = true;
    }
    if (changed) mrUpdates.push(med);
  }
  await sendBatch(mrUpdates, 'MedicationRequest');

  console.log('Done.');
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
    console.log(`Updated ${type} batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(resources.length / BATCH_SIZE)}`);
  }
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
