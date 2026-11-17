import http from 'k6/http';
import {check, sleep} from 'k6';
import {Counter, Rate, Trend} from 'k6/metrics';

const base = (__ENV.BASE_URL || 'http://localhost:3301').replace(/\/$/, '');
const mode = __ENV.MODE || 'same-session';
const vus = Number(__ENV.VUS || 50);
const iterations = Number(__ENV.ITERATIONS || 1000);
const threshold = Number(__ENV.P95_MS || 500);
const cookies = (__ENV.SESSIONS_JSON ? JSON.parse(__ENV.SESSIONS_JSON) : [__ENV.SESSION_COOKIE || '']).filter(Boolean);
const unexpected = new Rate('unexpected_response');
const business = new Counter('business_success');
const latency = new Trend('business_latency_ms', true);
const tags = {test: mode};
function requireEnv(key) { if (!__ENV[key]) throw new Error(`Missing -e ${key}`); return __ENV[key]; }
function authCookie() {
  const token = mode === 'multi-session' ? cookies[(__VU - 1) % cookies.length] : cookies[0];
  if (!token) throw new Error('SESSION_COOKIE or SESSIONS_JSON required');
  return {Cookie: `kanso_session=${token}`};
}
function jsonParams(withAuth=true) {
  return {headers: {'Content-Type': 'application/json', ...(withAuth ? authCookie() : {})}, tags};
}
export const options = {
  scenarios: {
    benchmark: __ENV.PROFILE === 'ramp'
      ? {executor: 'ramping-vus', stages: [{duration:'1m',target:10},{duration:'2m',target:50},{duration:'2m',target:100},{duration:'1m',target:0}], gracefulRampDown:'20s'}
      : __ENV.PROFILE === 'soak'
      ? {executor:'constant-vus', vus, duration: __ENV.DURATION || '30m'}
      : __ENV.PROFILE === 'spike'
      ? {executor:'ramping-vus', stages:[{duration:'10s',target:10},{duration:'5s',target:vus},{duration:'1m',target:vus},{duration:'10s',target:10},{duration:'15s',target:0}]}
      : {executor:'shared-iterations', vus, iterations, maxDuration:'10m'},
  },
  thresholds: {'http_req_duration': [`p(95)<${threshold}`], 'unexpected_response':['rate<0.01']},
};
export default function () {
  let r, expected = 200;
  const noAuth = {tags};
  if (mode === 'root') r = http.get(`${base}/v1`, noAuth);
  else if (mode === 'same-session' || mode === 'multi-session') r = http.get(`${base}/v1/me`, {headers:authCookie(),tags});
  else if (mode === 'space-read') { requireEnv('SPACE_ID'); r = http.get(`${base}/v1/spaces/${__ENV.SPACE_ID}`, {headers:authCookie(),tags}); }
  else if (mode === 'mandate-read') { requireEnv('SPACE_ID'); expected=Number(__ENV.EXPECT_STATUS||200); r = http.get(`${base}/v1/spaces/${__ENV.SPACE_ID}/mandate`, {headers:authCookie(),tags}); }
  else if (mode === 'space-create') { expected=201; r=http.post(`${base}/v1/spaces`,JSON.stringify({pseudonym:`perf-${__VU}-${__ITER}-${Date.now()}`}),jsonParams()); }
  else if (mode === 'mandate-create') {
    requireEnv('SPACE_ID');requireEnv('HELPER_ID'); expected=201;
    const now=Date.now();
    r=http.post(`${base}/v1/spaces/${__ENV.SPACE_ID}/mandate`,JSON.stringify({helperId:__ENV.HELPER_ID,scope:['contacts.gerer'],startDate:new Date(now-60000).toISOString(),endDate:new Date(now+86400000).toISOString()}),jsonParams());
  }
  else if (mode === 'login') { requireEnv('PERF_EMAIL');requireEnv('PERF_PASSWORD');r=http.post(`${base}/v1/auth/login`,JSON.stringify({email:__ENV.PERF_EMAIL,password:__ENV.PERF_PASSWORD}),jsonParams(false)); }
  else if (mode === 'signup') { expected=201;requireEnv('PERF_PASSWORD');r=http.post(`${base}/v1/auth/signup`,JSON.stringify({email:`perf-${__VU}-${__ITER}-${Date.now()}@example.invalid`,password:__ENV.PERF_PASSWORD}),jsonParams(false)); }
  else if (mode === 'unauthorized') { expected=401; r=http.get(`${base}/v1/me`,noAuth); }
  else if (mode === 'not-found') { expected=404; r=http.get(`${base}/v1/spaces/00000000-0000-4000-8000-000000000000`,{headers:authCookie(),tags}); }
  else if (mode === 'invalid-payload') {expected=400;r=http.post(`${base}/v1/spaces`,JSON.stringify({pseudonym:''}),jsonParams()); }
  else throw new Error(`Unknown MODE=${mode}`);
  const ok=check(r,{[`expected status ${expected}`]:v=>v.status===expected});
  unexpected.add(!ok); if(ok) business.add(1); latency.add(r.timings.duration);
  if (__ENV.THINK_TIME) sleep(Number(__ENV.THINK_TIME));
}
