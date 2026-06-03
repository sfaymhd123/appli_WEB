import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const HAPI_BASE = process.env.HAPI_FHIR_BASE_URL || 'http://localhost:8080/fhir';

async function main() {
  // 1. Get all Physicians
  const physicians = await prisma.user.findMany({
    where: { role: 'Physician' }
  });

  if (physicians.length === 0) {
    console.log('No physicians found in gateway database.');
    return;
  }

  console.log(`Found ${physicians.length} physicians.`);

  // 1.5 Create Practitioner resources in HAPI
  for (const physician of physicians) {
    const practitioner = {
      resourceType: 'Practitioner',
      id: physician.id,
      identifier: [
        {
          system: 'https://hphii.ma/fhir/practitioner-id',
          value: physician.email
        }
      ],
      name: [
        {
          text: physician.email.split('@')[0]
        }
      ]
    };

    try {
      await axios.put(`${HAPI_BASE}/Practitioner/${physician.id}`, practitioner, {
        headers: { 'Content-Type': 'application/fhir+json' }
      });
      console.log(`Created/Updated Practitioner/${physician.id} for ${physician.email}`);
    } catch (err) {
      console.error(`Failed to create Practitioner for ${physician.email}:`, err.response?.data || err.message);
    }
  }

  // 2. Get all Patients
  // We need to fetch all of them. HAPI might paginate.
  let patients = [];
  let url = `${HAPI_BASE}/Patient?_count=500`;
  
  while (url) {
    const res = await axios.get(url);
    const bundle = res.data;
    if (bundle.entry) {
      patients.push(...bundle.entry.map(e => e.resource));
    }
    const nextLink = (bundle.link || []).find(l => l.relation === 'next');
    url = nextLink ? nextLink.url : null;
  }

  console.log(`Found ${patients.length} patients in HAPI FHIR.`);

  if (patients.length === 0) {
    console.log('No patients found in HAPI FHIR.');
    return;
  }

  // 3. Assign patients to physicians
  // Each physician gets at least 100 patients.
  // We can just distribute them.
  
  const patientsPerDoctor = Math.floor(patients.length / physicians.length);
  console.log(`Assigning approximately ${patientsPerDoctor} patients per doctor.`);

  const updates = [];
  for (let i = 0; i < physicians.length; i++) {
    const doctor = physicians[i];
    const start = i * patientsPerDoctor;
    // For the last doctor, take all remaining patients
    const end = (i === physicians.length - 1) ? patients.length : (i + 1) * patientsPerDoctor;
    
    const doctorPatients = patients.slice(start, end);
    console.log(`Assigning ${doctorPatients.length} patients to ${doctor.email} (Practitioner/${doctor.id})`);

    for (const patient of doctorPatients) {
      // Add doctor to patient.generalPractitioner
      if (!patient.generalPractitioner) {
        patient.generalPractitioner = [];
      }
      
      const practitionerRef = `Practitioner/${doctor.id}`;
      if (!patient.generalPractitioner.some(ref => ref.reference === practitionerRef)) {
        patient.generalPractitioner.push({ reference: practitionerRef });
        updates.push(patient);
      }
    }
  }

  console.log(`Total patients to update: ${updates.length}`);

  // 4. Update patients in HAPI using a transaction bundle for efficiency
  const BATCH_SIZE = 100;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: batch.map(p => ({
        fullUrl: `${HAPI_BASE}/Patient/${p.id}`,
        resource: p,
        request: {
          method: 'PUT',
          url: `Patient/${p.id}`
        }
      }))
    };

    try {
      await axios.post(HAPI_BASE, bundle, {
        headers: { 'Content-Type': 'application/fhir+json' }
      });
      console.log(`Updated batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(updates.length / BATCH_SIZE)}`);
    } catch (err) {
      console.error(`Failed to update batch starting at ${i}:`, err.response?.data || err.message);
    }
  }

  console.log('Done.');
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
