// Minimal HS256 JWT sign/verify using Web Crypto's HMAC directly —
// no jsonwebtoken/jose dependency, since Node crypto APIs aren't available in Workers.

import { encodeJsonBase64Url, decodeJsonBase64Url, fromBase64Url, toBase64Url, timingSafeEqual } from './base64';

export interface JwtPayload {
  sub: string; // user email
  iat: number;
  exp: number;
}

const HEADER = { alg: 'HS256', typ: 'JWT' } as const;

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(signature));
}

export async function signJwt(subject: string, secret: string, expiresInSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = { sub: subject, iat: now, exp: now + expiresInSeconds };

  const encodedHeader = encodeJsonBase64Url(HEADER);
  const encodedPayload = encodeJsonBase64Url(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await sign(signingInput, secret);

  return `${signingInput}.${signature}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = await sign(signingInput, secret);
  if (!timingSafeEqual(fromBase64Url(signature), fromBase64Url(expectedSignature))) {
    return null;
  }

  let payload: JwtPayload;
  try {
    payload = decodeJsonBase64Url<JwtPayload>(encodedPayload);
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;

  return payload;
}
