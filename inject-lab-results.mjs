import axios from 'axios';

const GATEWAY_URL = 'http://localhost:3000';

async function getToken(email) {
  try {
    const res = await axios.post(`${GATEWAY_URL}/auth/login`, { email, password: 'Passw0rd!' });
    return res.data.access_token;
  } catch (err) {
    console.error(`Login failed for ${email}:`, err.message);
    return null;
  }
}

async function runInjection() {
  console.log('Starting Lab Results Injection...');
  // Authenticate as Lab Technician to post results
  const token = await getToken('lab@hphii.ma');
  if (!token) return;
  const api = axios.create({ baseURL: GATEWAY_URL, headers: { Authorization: `Bearer ${token}` } });

  try {
    console.log('Fetching active service requests...');
    const srRes = await api.get('/service-requests?status=active');
    const orders = srRes.data.orders;
    
    if (!orders || orders.length === 0) {
      console.log('No active service requests found to fulfill.');
      return;
    }

    console.log(`Found ${orders.length} active service requests. Fulfilling the first 5...`);

    for (let i = 0; i < Math.min(5, orders.length); i++) {
      const order = orders[i];
      const isAbnormal = i < 3; // Make 3 abnormal, 2 normal

      // Extract patient ID from reference (e.g. "Patient/pat-123" -> "pat-123")
      const patientId = order.patientReference.replace('Patient/', '');

      const payload = {
        patientId: patientId,
        serviceRequestId: order.id,
        category: order.category || 'Laboratory',
        loinc: order.loinc || '1234-5', // Fallback LOINC if missing
        display: order.display || 'Test Result',
        value: isAbnormal ? 150 : 50, // Arbitrary numeric value
        unit: 'mg/dL',
        abnormal: isAbnormal,
        conclusion: isAbnormal ? 'Abnormal findings detected.' : 'Normal study.'
      };

      try {
        await api.post('/diagnostic-reports', payload);
        console.log(`\u2713 FULFILLED: ${order.id} for ${patientId} (Abnormal: ${isAbnormal})`);
      } catch (postErr) {
        console.error(`\u2717 Failed to post result for ${order.id}:`, postErr.response?.data?.message || postErr.message);
      }
    }

    console.log('\nLab Results Injection Complete.');
  } catch (err) {
    console.error('Error during injection:', err.response?.data?.message || err.message);
  }
}

runInjection();
