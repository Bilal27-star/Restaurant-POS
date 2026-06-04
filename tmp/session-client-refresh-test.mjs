/**
 * Simulates the web client's 401 → refresh → retry flow against the live API.
 */
import { createPosApiClient } from "../packages/api-client/src/client.ts";

const ORIGIN = process.env.POS_API_ORIGIN ?? "http://127.0.0.1:4000";
const jar = { cookie: "" };

function storeCookies(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const part = c.split(";")[0];
    if (part) jar.cookie = jar.cookie ? `${jar.cookie}; ${part}` : part;
  }
}

let accessToken = null;
let expiresAt = 0;

async function refreshAccessToken() {
  const res = await fetch(`${ORIGIN}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: jar.cookie },
    body: "{}",
  });
  storeCookies(res);
  const json = await res.json();
  if (!json.success) return null;
  accessToken = json.data.accessToken;
  expiresAt = Date.now() + json.data.expiresIn * 1000;
  return accessToken;
}

const loginRes = await fetch(`${ORIGIN}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "admin", restaurantSlug: "default" }),
});
storeCookies(loginRes);
const loginJson = await loginRes.json();
accessToken = loginJson.data.accessToken;
expiresAt = Date.now() + loginJson.data.expiresIn * 1000;
console.log("login ok");

const api = createPosApiClient({
  baseUrl: ORIGIN,
  getAccessToken: () => accessToken,
  refreshAccessToken,
  onUnauthorized: () => {
    accessToken = null;
    console.log("onUnauthorized called");
  },
});

const stale = accessToken;
accessToken = "invalid.expired.token";
await api.tables.getLayout();
if (!accessToken || accessToken === "invalid.expired.token") {
  console.log("FAIL: token not refreshed after 401");
  process.exit(1);
}
console.log("auto-refresh on 401: ok (token rotated)");
console.log("expiresAt extended:", expiresAt > Date.now());
await api.tables.getLayout();
console.log("subsequent layout: ok");
