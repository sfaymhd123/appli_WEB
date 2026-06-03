import { PrismaClient, Role } from '@prisma/client';
import axios from 'axios';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const HAPI_BASE = process.env.HAPI_FHIR_BASE_URL || 'http://localhost:8080/fhir';
const SEED_PASSWORD = 'Passw0rd!';

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  // 1. Target User Counts
  const targets = {
    [Role.Physician]: 10,
    [Role.Nurse]: 23,
    [Role.LabTechnician]: 10,
    [Role.Pharmacist]: 5,
  };

  console.log('--- Step 1: Scaling Users ---');
  for (const [role, target] of Object.entries(targets)) {
    const currentUsers = await prisma.user.findMany({ where: { role: role } });
    const needed = target - currentUsers.length;
    
    if (needed > 0) {
      console.log(`Creating ${needed} more ${role}s...`);
      for (let i = 0; i < needed; i++) {
        const email = `${role.toLowerCase()}.${currentUsers.length + i + 1}@hphii.ma`;
        await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email, role: role, passwordHash, isMfaEnabled: false }
        });
      }
    } else {
      console.log(`Already have ${currentUsers.length} ${role}s.`);
    }
  }

  const allUsers = await prisma.user.findMany();
  console.log(`Total users in DB: ${allUsers.length}`);

  // 2. Ensure Practitioner resources in HAPI
  console.log('--- Step 2: Creating Practitioners in HAPI ---');
  for (const user of allUsers) {
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

  // 3. Scaling FHIR Data
  console.log('--- Step 3: Scaling FHIR Data (Cloning) ---');
  
  await scaleResource('Patient', 4517);
  await scaleResource('DiagnosticReport', 1067);
  await scaleResource('MedicationRequest', 1054);

  // 4. Assignments
  console.log('--- Step 4: Performing Assignments ---');
  
  const physicians = allUsers.filter(u => u.role === Role.Physician);
  const nurses = allUsers.filter(u => u.role === Role.Nurse);
  const labTechs = allUsers.filter(u => u.role === Role.LabTechnician);
  const pharmacists = allUsers.filter(u => u.role === Role.Pharmacist);

  // 4a. Patients -> Physicians (distributed) and Nurses (all)
  const patients = await fetchAll('Patient');
  console.log(`Assigning ${patients.length} patients...`);
  const patientsPerPhysician = Math.floor(patients.length / physicians.length);
  
  const patientUpdates = [];
  for (let i = 0; i < patients.length; i++) {
    const patient = patients[i];
    const doc = physicians[Math.floor(i / patientsPerPhysician)] || physicians[physicians.length - 1];
    
    patient.generalPractitioner = [
      { reference: `Practitioner/${doc.id}` },
      ...nurses.map(n => ({ reference: `Practitioner/${n.id}` }))
    ];
    patientUpdates.push(patient);
  }
  await sendBatch(patientUpdates, 'Patient');

  // 4b. DiagnosticReports -> LabTechs (all)
  const reports = await fetchAll('DiagnosticReport');
  console.log(`Assigning ${reports.length} diagnostic reports...`);
  const drUpdates = reports.map(r => {
    r.performer = labTechs.map(t => ({ reference: `Practitioner/${t.id}` }));
    return r;
  });
  await sendBatch(drUpdates, 'DiagnosticReport');

  // 4c. MedicationRequests -> Pharmacists (distributed)
  const meds = await fetchAll('MedicationRequest');
  console.log(`Assigning ${meds.length} medication requests...`);
  const mrUpdates = meds.map((m, i) => {
    const pharma = pharmacists[i % pharmacists.length];
    m.requester = { reference: `Practitioner/${pharma.id}` };
    return m;
  });
  await sendBatch(mrUpdates, 'MedicationRequest');

  console.log('Done.');
}

async function scaleResource(type, target) {
  const current = await axios.get(`${HAPI_BASE}/${type}?_summary=count`);
  const count = current.data.total;
  const needed = target - count;

  if (needed <= 0) {
    console.log(`${type} count (${count}) already meets target (${target}).`);
    return;
  }

  console.log(`Scaling ${type}: current=${count}, target=${target}, adding=${needed}...`);
  
  const samples = (await axios.get(`${HAPI_BASE}/${type}?_count=100`)).data.entry?.map(e => e.resource) || [];
  if (samples.length === 0) {
    console.warn(`No sample ${type} found to clone!`);
    return;
  }

  const newResources = [];
  for (let i = 0; i < needed; i++) {
    const base = samples[i % samples.length];
    const clone = JSON.parse(JSON.stringify(base));
    delete clone.id;
    delete clone.meta;
    
    // Give it a unique identifier if it's a patient
    if (type === 'Patient' && clone.identifier) {
       clone.identifier[0].value = `SCALED-${i}-${Date.now()}`;
    }
    
    newResources.push(clone);
  }

  // Create in batches
  const BATCH_SIZE = 100;
  for (let i = 0; i < newResources.length; i += BATCH_SIZE) {
    const batch = newResources.slice(i, i + BATCH_SIZE);
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: batch.map(r => ({
        resource: r,
        request: { method: 'POST', url: type }
      }))
    };
    await axios.post(HAPI_BASE, bundle, { headers: { 'Content-Type': 'application/fhir+json' } });
    console.log(`Created ${type} batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(newResources.length / BATCH_SIZE)}`);
  }
}

async function fetchAll(type) {
  let resources = [];
  let url = `${HAPI_BASE}/${type}?_count=1000`;
  while (url) {
    const res = await axios.get(url);
    if (res.data.entry) resources.push(...res.data.entry.map(e => e.resource));
    const next = res.data.link?.find(l => l.relation === 'next')?.url;
    url = next ? (next.startsWith('http') ? next : `${HAPI_BASE}${next}`) : null;
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
    await axios.post(HAPI_BASE, bundle, { headers: { 'Content-Type': 'application/fhir+json' } });
    console.log(`Updated ${type} batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(resources.length / BATCH_SIZE)}`);
  }
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
