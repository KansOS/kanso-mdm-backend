import http from 'k6/http';
import {check} from 'k6';
import {Counter, Rate} from 'k6/metrics';

const base = __ENV.BASE_URL || 'http://localhost:3000';
const route = __ENV.ROUTE || 'root';
const vus = Number(__ENV.VUS || '50');
const iterations = Number(__ENV.ITERATIONS || '1000');
const session = __ENV.SESSION_COOKIE || '';
const spaceId = __ENV.SPACE_ID || '';
const expectedErrors = new Counter('expected_http_errors');
const unexpectedResponses = new Rate('unexpected_responses');

export const options = {
  scenarios: {load: {executor: 'shared-iterations', vus, iterations, maxDuration: '5m'}},
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    unexpected_responses: ['rate<0.01'],
  },
};

export default function () {
  const auth = {headers: {Cookie: `kanso_session=${session}`}, tags: {route}};
  let response;
  let expected;
  if (route === 'root') {
    response = http.get(`${base}/v1`, {tags: {route}}); expected = 200;
  } else if (route === 'me') {
    response = http.get(`${base}/v1/me`, auth); expected = 200;
  } else if (route === 'space') {
    if (!spaceId) throw new Error('SPACE_ID requis pour ROUTE=space');
    response = http.get(`${base}/v1/spaces/${spaceId}`, auth); expected = 200;
  } else if (route === 'mandate') {
    if (!spaceId) throw new Error('SPACE_ID requis pour ROUTE=mandate');
    response = http.get(`${base}/v1/spaces/${spaceId}/mandate`, auth); expected = Number(__ENV.EXPECT_STATUS || '200');
  } else if (route === 'create-space') {
    response = http.post(`${base}/v1/spaces`, JSON.stringify({pseudonym: `perf-${__VU}-${__ITER}-${Date.now()}`}), {
      ...auth, headers: {...auth.headers, 'Content-Type': 'application/json'},
    }); expected = 201;
  } else if (route === 'unauthorized') {
    response = http.get(`${base}/v1/me`, {tags: {route}}); expected = 401;
  } else if (route === 'invalid-space') {
    response = http.get(`${base}/v1/spaces/00000000-0000-4000-8000-000000000000`, auth); expected = 404;
  } else {
    throw new Error(`ROUTE inconnu: ${route}`);
  }
  if (expected >= 400 && response.status === expected) expectedErrors.add(1);
  const ok = check(response, {[`status ${expected}`]: r => r.status === expected});
  unexpectedResponses.add(!ok);
}
