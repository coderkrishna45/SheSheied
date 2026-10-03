// Check the same public connection, enrollment, search and routing used by Android.
// Creates a session and a plan, without starting a journey or requesting alerts.
const base = (process.argv[2] || process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
let token;
async function call(method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? {'Content-Type': 'application/json'} : {}),
      ...(token ? {Authorization: `Bearer ${token}`} : {})
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw Error(`${path}: HTTP ${response.status}; the address did not return the SheShield API.`);
  }
  const result = await response.json();
  if (!response.ok) throw Error(`${path}: HTTP ${response.status} (${result.code || 'API_ERROR'})`);
  return result;
}
try {
  const health = await call('GET', '/health');
  if (health.status !== 'ok') throw Error('API health check failed.');
  console.log('Public API reachable:', base);
  const session = await call('POST', '/v1/sessions', {enrollment_code: process.env.ENROLLMENT_CODE});
  token = session.session_token;
  if (!token) throw Error('Enrollment did not return a session.');
  console.log('Enrollment verified; credentials are hidden.');
  const result = await call('GET', '/v1/places?q=Indian%20Museum%20Kolkata');
  if (!result.places?.length) throw Error('Place search returned no results.');
  console.log('Place search verified:', result.places.length, 'matches.');
  const plan = await call('POST', '/v1/plans', {
    mode: 'LIVE',
    origin: {label: 'Esplanade, Kolkata', latitude: 22.5641, longitude: 88.3510},
    destination: {label: 'Indian Museum, Kolkata', latitude: 22.5580, longitude: 88.3510}
  });
  if (!plan.routes?.length || plan.routes.some(route => route.geometry?.length <= 2)) {
    throw Error('Route planning returned no usable walking geometry.');
  }
  console.log('Short walking route verified:', plan.routes.length, 'options,',
    Math.round(Math.min(...plan.routes.map(route => route.distance_meters))), 'm shortest.');
  console.log('No journeys started and no alerts requested.');
} catch (error) {
  console.error('Connection check failed:', error.message);
  process.exitCode = 1;
}
