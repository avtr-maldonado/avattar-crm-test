/**
 * Tokens ES256 para probar el servidor MCP sin Supabase: una llave por
 * proceso de prueba, su JWK pública con `kid`, y un firmador de JWT con la
 * misma forma que emite Supabase Auth (sub, email, client_id, scope, exp).
 * Solo WebCrypto, sin librerías.
 */
import { webcrypto } from "node:crypto";

const subtle = webcrypto.subtle;
export const KID = "prueba-mcp";

let par: Promise<CryptoKeyPair> | null = null;
function llaves(): Promise<CryptoKeyPair> {
  par ??= subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return par;
}

function b64url(datos: Uint8Array | string): string {
  const buf = typeof datos === "string" ? Buffer.from(datos, "utf8") : Buffer.from(datos);
  return buf.toString("base64url");
}

/** La JWK pública como la publicaría el JWKS del proyecto. */
export type JwkConKid = JsonWebKey & { kid: string };

export async function jwkPublica(): Promise<JwkConKid> {
  const { publicKey } = await llaves();
  const jwk = await subtle.exportKey("jwk", publicKey);
  return { ...jwk, kid: KID, alg: "ES256", use: "sig" };
}

export type ClaimsDePrueba = {
  sub: string;
  email?: string;
  client_id?: string;
  scope?: string;
  exp?: number;
  [k: string]: unknown;
};

export async function firmarToken(claims: ClaimsDePrueba): Promise<string> {
  const { privateKey } = await llaves();
  const ahora = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "authenticated",
    role: "authenticated",
    iss: "https://prueba.supabase.co/auth/v1",
    iat: ahora,
    exp: ahora + 3600,
    ...claims,
  };
  const cabecera = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: KID }));
  const cuerpo = b64url(JSON.stringify(payload));
  const firma = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    Buffer.from(`${cabecera}.${cuerpo}`, "utf8"),
  );
  return `${cabecera}.${cuerpo}.${b64url(new Uint8Array(firma))}`;
}
