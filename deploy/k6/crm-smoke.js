/**
 * k6 smoke for list / create / search.
 *
 * Prerequisites: API running, a session cookie, and a workspace with a `people` object.
 *
 *   export BASE_URL=http://localhost:3000
 *   export COOKIE='better-auth.session_token=...'
 *   export WORKSPACE_ID='...'
 *   k6 run deploy/k6/crm-smoke.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const listTrend = new Trend('records_list_ms', true);
const createTrend = new Trend('records_create_ms', true);
const searchTrend = new Trend('records_search_ms', true);

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    records_list_ms: ['p(95)<500'],
    records_create_ms: ['p(95)<800'],
    records_search_ms: ['p(95)<500'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const cookie = __ENV.COOKIE || '';
const workspaceId = __ENV.WORKSPACE_ID || '';

function headers() {
  return {
    Cookie: cookie,
    'X-Workspace-Id': workspaceId,
    'Content-Type': 'application/json',
  };
}

export default function () {
  const listRes = http.get(`${baseUrl}/objects/people/records?limit=50`, { headers: headers() });
  listTrend.add(listRes.timings.duration);
  check(listRes, { 'list 200': (r) => r.status === 200 });

  const createRes = http.post(
    `${baseUrl}/objects/people/records`,
    JSON.stringify({
      name: `k6-${__VU}-${__ITER}`,
      data: { email: `k6-${__VU}-${__ITER}@example.com` },
    }),
    { headers: headers() },
  );
  createTrend.add(createRes.timings.duration);
  check(createRes, { 'create 2xx': (r) => r.status === 200 || r.status === 201 });

  const searchRes = http.get(`${baseUrl}/objects/people/records?q=k6&limit=20`, {
    headers: headers(),
  });
  searchTrend.add(searchRes.timings.duration);
  check(searchRes, { 'search 200': (r) => r.status === 200 });

  sleep(0.2);
}
