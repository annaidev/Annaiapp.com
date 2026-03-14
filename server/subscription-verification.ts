import { createPublicKey, createSign, createVerify, type KeyObject, X509Certificate } from "crypto";

type JsonRecord = Record<string, unknown>;

type ParsedJws = {
  header: JsonRecord;
  payload: JsonRecord;
  signingInput: string;
  signature: Buffer;
};

type GoogleAccessToken = {
  token: string;
  expiresAtMs: number;
};

type GooglePlaySnapshot = {
  mappedStatus: "inactive" | "active" | "trialing" | "past_due" | "canceled" | "expired";
  productId: string;
  originalTransactionId: string;
  expiresAt: string | null;
  accountIdentifier: string | null;
  isSandbox: boolean;
  raw: JsonRecord;
};

let appleJwksCache: { expiresAtMs: number; keys: JsonRecord[] } | null = null;
let googleCertsCache: { expiresAtMs: number; certs: Record<string, string> } | null = null;
let googleAccessTokenCache: GoogleAccessToken | null = null;

function toBase64Url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64url");
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function parseJsonBuffer(buffer: Buffer): JsonRecord {
  return JSON.parse(buffer.toString("utf8")) as JsonRecord;
}

function parseJws(token: string): ParsedJws {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Expected compact JWS with three dot-separated parts");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  return {
    header: parseJsonBuffer(fromBase64Url(encodedHeader)),
    payload: parseJsonBuffer(fromBase64Url(encodedPayload)),
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: fromBase64Url(encodedSignature),
  };
}

function verifySignature(alg: string, signingInput: string, signature: Buffer, key: KeyObject): boolean {
  if (alg === "ES256") {
    return createVerify("sha256")
      .update(signingInput)
      .end()
      .verify({ key, dsaEncoding: "ieee-p1363" }, signature);
  }
  if (alg === "RS256") {
    return createVerify("RSA-SHA256")
      .update(signingInput)
      .end()
      .verify(key, signature);
  }
  throw new Error(`Unsupported JWS algorithm: ${alg}`);
}

function assertCertificateValidity(certificate: X509Certificate) {
  const now = Date.now();
  const validFromMs = Date.parse(certificate.validFrom);
  const validToMs = Date.parse(certificate.validTo);
  if (Number.isNaN(validFromMs) || Number.isNaN(validToMs)) {
    throw new Error("Certificate validity period is invalid");
  }
  if (now < validFromMs || now > validToMs) {
    throw new Error("Certificate is outside validity period");
  }
}

function verifyX5cChain(x5c: unknown[], rootPem?: string): KeyObject {
  if (!Array.isArray(x5c) || x5c.length === 0) {
    throw new Error("x5c certificate chain is missing");
  }
  const chain = x5c.map((cert) => new X509Certificate(Buffer.from(String(cert), "base64")));

  chain.forEach(assertCertificateValidity);

  for (let i = 0; i < chain.length - 1; i += 1) {
    const current = chain[i];
    const issuer = chain[i + 1];
    if (current.issuer !== issuer.subject) {
      throw new Error("Certificate issuer/subject mismatch in x5c chain");
    }
    if (!current.verify(issuer.publicKey)) {
      throw new Error("Certificate signature validation failed in x5c chain");
    }
  }

  if (rootPem) {
    const root = new X509Certificate(rootPem);
    assertCertificateValidity(root);
    const last = chain[chain.length - 1];
    if (last.issuer !== root.subject || !last.verify(root.publicKey)) {
      throw new Error("x5c chain did not validate against configured Apple root certificate");
    }
  }

  return chain[0].publicKey;
}

async function getAppleJwks(): Promise<JsonRecord[]> {
  if (appleJwksCache && appleJwksCache.expiresAtMs > Date.now()) {
    return appleJwksCache.keys;
  }

  const jwksUrl = process.env.APPLE_JWKS_URL || "https://api.storekit.itunes.apple.com/inApps/v1/notifications/jwsPublicKeys";
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Apple JWKS (${response.status})`);
  }

  const body = (await response.json()) as { keys?: JsonRecord[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (keys.length === 0) {
    throw new Error("Apple JWKS response contained no keys");
  }

  appleJwksCache = {
    expiresAtMs: Date.now() + 1000 * 60 * 30,
    keys,
  };
  return keys;
}

async function verifyJwsWithAppleKeys(token: string): Promise<JsonRecord> {
  const parsed = parseJws(token);
  const alg = String(parsed.header.alg || "");
  if (alg !== "ES256") {
    throw new Error(`Apple JWS alg must be ES256, received: ${alg}`);
  }

  let verificationKey: KeyObject | null = null;

  if (Array.isArray(parsed.header.x5c) && parsed.header.x5c.length > 0) {
    const rootPem = process.env.APPLE_ROOT_CA_PEM?.replace(/\\n/g, "\n");
    verificationKey = verifyX5cChain(parsed.header.x5c, rootPem);
  } else if (typeof parsed.header.kid === "string" && parsed.header.kid.length > 0) {
    const keys = await getAppleJwks();
    const matched = keys.find((key) => key.kid === parsed.header.kid);
    if (!matched) {
      throw new Error(`Apple JWKS key not found for kid ${parsed.header.kid}`);
    }
    verificationKey = createPublicKey({ key: matched as unknown as import("crypto").JsonWebKey, format: "jwk" });
  }

  if (!verificationKey) {
    throw new Error("Apple JWS did not include a usable verification key");
  }

  if (!verifySignature(alg, parsed.signingInput, parsed.signature, verificationKey)) {
    throw new Error("Apple JWS signature verification failed");
  }

  return parsed.payload;
}

export async function verifyAppleSignedTransactionInfo(signedTransactionInfo: string): Promise<JsonRecord> {
  return verifyJwsWithAppleKeys(signedTransactionInfo);
}

export async function verifyAppleNotificationPayload(signedPayload: string): Promise<{
  notification: JsonRecord;
  transaction: JsonRecord | null;
}> {
  const notification = await verifyJwsWithAppleKeys(signedPayload);
  const data = (notification.data as JsonRecord | undefined) ?? {};
  const signedTransactionInfo = data.signedTransactionInfo;
  const transaction =
    typeof signedTransactionInfo === "string" && signedTransactionInfo.length > 0
      ? await verifyJwsWithAppleKeys(signedTransactionInfo)
      : null;

  return { notification, transaction };
}

async function getGoogleCerts(): Promise<Record<string, string>> {
  if (googleCertsCache && googleCertsCache.expiresAtMs > Date.now()) {
    return googleCertsCache.certs;
  }

  const response = await fetch("https://www.googleapis.com/oauth2/v1/certs");
  if (!response.ok) {
    throw new Error(`Failed to fetch Google certs (${response.status})`);
  }

  const certs = (await response.json()) as Record<string, string>;
  googleCertsCache = {
    expiresAtMs: Date.now() + 1000 * 60 * 30,
    certs,
  };
  return certs;
}

function assertJwtTimeClaims(payload: JsonRecord) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);
  const nbf = payload.nbf !== undefined ? Number(payload.nbf) : undefined;
  if (!Number.isFinite(exp) || exp < nowSeconds - 30) {
    throw new Error("JWT is expired");
  }
  if (nbf !== undefined && Number.isFinite(nbf) && nbf > nowSeconds + 30) {
    throw new Error("JWT is not valid yet");
  }
}

export async function verifyGooglePubSubOidcToken(
  bearerToken: string,
  expectedAudience?: string,
  expectedEmail?: string,
): Promise<JsonRecord> {
  const parsed = parseJws(bearerToken);
  const alg = String(parsed.header.alg || "");
  const kid = String(parsed.header.kid || "");
  if (alg !== "RS256") {
    throw new Error(`Google OIDC token alg must be RS256, received: ${alg}`);
  }
  if (!kid) {
    throw new Error("Google OIDC token missing key id");
  }

  const certs = await getGoogleCerts();
  const certPem = certs[kid];
  if (!certPem) {
    throw new Error(`Google OIDC cert not found for kid ${kid}`);
  }

  let verificationKey: KeyObject;
  try {
    const cert = new X509Certificate(certPem);
    assertCertificateValidity(cert);
    verificationKey = cert.publicKey;
  } catch {
    verificationKey = createPublicKey(certPem);
  }

  if (!verifySignature(alg, parsed.signingInput, parsed.signature, verificationKey)) {
    throw new Error("Google OIDC token signature verification failed");
  }

  assertJwtTimeClaims(parsed.payload);

  const issuer = String(parsed.payload.iss || "");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(issuer)) {
    throw new Error(`Unexpected OIDC issuer: ${issuer}`);
  }

  if (expectedAudience) {
    const aud = parsed.payload.aud;
    const audienceMatches = Array.isArray(aud)
      ? aud.map((value) => String(value)).includes(expectedAudience)
      : String(aud || "") === expectedAudience;
    if (!audienceMatches) {
      throw new Error("OIDC audience does not match expected Google Pub/Sub audience");
    }
  }

  if (expectedEmail) {
    const email = String(parsed.payload.email || "");
    if (email !== expectedEmail) {
      throw new Error("OIDC email claim does not match configured Google service account");
    }
  }

  return parsed.payload;
}

function mapGoogleStateToStatus(subscriptionState: string, expiresAt: string | null) {
  const now = Date.now();
  const hasFutureExpiry = expiresAt ? Date.parse(expiresAt) > now : false;

  switch (subscriptionState) {
    case "SUBSCRIPTION_STATE_ACTIVE":
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "active";
    case "SUBSCRIPTION_STATE_ON_HOLD":
    case "SUBSCRIPTION_STATE_PAUSED":
      return "past_due";
    case "SUBSCRIPTION_STATE_CANCELED":
      return hasFutureExpiry ? "active" : "canceled";
    case "SUBSCRIPTION_STATE_EXPIRED":
      return "expired";
    case "SUBSCRIPTION_STATE_PENDING":
      return "inactive";
    default:
      return hasFutureExpiry ? "active" : "inactive";
  }
}

async function getGooglePlayAccessToken(): Promise<string> {
  if (googleAccessTokenCache && googleAccessTokenCache.expiresAtMs > Date.now() + 30_000) {
    return googleAccessTokenCache.token;
  }

  const serviceAccountEmail = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!serviceAccountEmail || !rawPrivateKey) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL and GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY are required");
  }
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
  };

  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(privateKey);
  const assertion = `${signingInput}.${toBase64Url(signature)}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Failed to get Google access token (${tokenResponse.status}): ${errorBody}`);
  }

  const tokenJson = (await tokenResponse.json()) as { access_token: string; expires_in: number };
  googleAccessTokenCache = {
    token: tokenJson.access_token,
    expiresAtMs: Date.now() + tokenJson.expires_in * 1000,
  };
  return tokenJson.access_token;
}

export async function fetchGooglePlaySubscriptionSnapshot(input: {
  packageName: string;
  purchaseToken: string;
  subscriptionId?: string;
}): Promise<GooglePlaySnapshot> {
  const accessToken = await getGooglePlayAccessToken();
  const endpoint = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    input.packageName,
  )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(input.purchaseToken)}`;

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Play subscription lookup failed (${response.status}): ${errorBody}`);
  }

  const raw = (await response.json()) as JsonRecord;
  const lineItems = Array.isArray(raw.lineItems) ? (raw.lineItems as JsonRecord[]) : [];
  const latestLineItem = lineItems
    .map((item) => ({
      raw: item,
      expiryMs: Date.parse(String(item.expiryTime || "")),
    }))
    .sort((a, b) => b.expiryMs - a.expiryMs)[0]?.raw;

  const expiresAt = latestLineItem?.expiryTime ? String(latestLineItem.expiryTime) : null;
  const subscriptionState = String(raw.subscriptionState || "");
  const mappedStatus = mapGoogleStateToStatus(subscriptionState, expiresAt) as GooglePlaySnapshot["mappedStatus"];

  const externalIds = (raw.externalAccountIdentifiers as JsonRecord | undefined) ?? {};
  const accountIdentifier =
    (typeof externalIds.obfuscatedExternalAccountId === "string" && externalIds.obfuscatedExternalAccountId) ||
    (typeof externalIds.obfuscatedExternalProfileId === "string" && externalIds.obfuscatedExternalProfileId) ||
    null;

  const productId =
    (latestLineItem?.productId ? String(latestLineItem.productId) : null) ||
    input.subscriptionId ||
    "annai.pro.monthly.9_99";

  const originalTransactionId = (typeof raw.latestOrderId === "string" && raw.latestOrderId) || input.purchaseToken;

  return {
    mappedStatus,
    productId,
    originalTransactionId,
    expiresAt,
    accountIdentifier,
    isSandbox: Boolean(raw.testPurchase),
    raw,
  };
}

export function decodeGooglePubSubMessageData(base64Data: string): JsonRecord {
  const decoded = Buffer.from(base64Data, "base64").toString("utf8");
  return JSON.parse(decoded) as JsonRecord;
}
