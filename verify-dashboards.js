import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3000';

async function verifyDashboards() {
  const physicians = await prisma.user.findMany({
    where: { role: 'Physician' }
  });

  console.log(`Verifying dashboards for ${physicians.length} physicians...\n`);
  console.log('Email'.padEnd(30) + ' | Patients | Observations | Alerts');
  console.log('-'.repeat(70));

  for (const physician of physicians) {
    try {
      // 1. Login
      const loginRes = await axios.post(`${API_BASE}/auth/login`, {
        email: physician.email,
        password: 'Passw0rd!'
      });
      
      if (loginRes.data.mfa_required) {
        console.log(physician.email.padEnd(30) + ` | MFA Required`);
        continue;
      }

      const token = loginRes.data.access_token;

      // 2. Get KPIs
      const kpiRes = await axios.get(`${API_BASE}/kpis`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const kpis = kpiRes.data;
      console.log(
        physician.email.padEnd(30) + 
        ` | ${String(kpis.cohortSize).padStart(8)}` +
        ` | ${String(kpis.monitoring.observations).padStart(12)}` +
        ` | ${String(kpis.alerts.total).padStart(6)}`
      );
    } catch (err) {
      console.log(physician.email.padEnd(30) + ` | Error: ${err.message}`);
    }
  }

  console.log('\nVerification complete.');
}

verifyDashboards()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
