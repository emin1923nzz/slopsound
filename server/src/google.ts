import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { env } from "./env.js";
import { db } from "./db.js";
import { redis } from "./redis.js";
import { users } from "./schema.js";
import { createSession, publicUser, type SessionUser } from "./auth.js";

type OAuthMode = "desktop" | "web";
type StatePayload = { redirectUri: string; mode: OAuthMode };
type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

const STATE_TTL = 600;

function stateKey(state: string) {
  return `oauth:state:${state}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

async function uniqueUsername(seed: string) {
  const base = slugify(seed) || "slopsounder";
  let username = base.length >= 3 ? base : `user${base}`;
  let suffix = 1;
  while ((await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)).length) {
    username = `${base}${suffix}`.slice(0, 32);
    suffix += 1;
  }
  return username;
}

async function fetchGoogleProfile(code: string, redirectUri: string): Promise<GoogleProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) throw new Error("Google kodu doğrulanamadı");
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error("Google erişim anahtarı alınamadı");

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) throw new Error("Google profili alınamadı");
  const profile = await profileResponse.json() as GoogleProfile;
  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    throw new Error("Google e-postası doğrulanmadı");
  }
  return profile;
}

async function upsertGoogleUser(profile: GoogleProfile) {
  const [existing] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
  if (existing) {
    const [updated] = await db.update(users).set({
      googleSub: profile.sub,
      ...(profile.picture && !existing.avatarUrl ? { avatarUrl: profile.picture } : {}),
    }).where(eq(users.id, existing.id)).returning();
    return updated;
  }
  const [created] = await db.insert(users).values({
    email: profile.email,
    username: await uniqueUsername(profile.name ?? profile.email.split("@")[0] ?? "slopsounder"),
    googleSub: profile.sub,
    passwordHash: null,
    avatarUrl: profile.picture ?? "",
    tag: randomBytes(2).toString("hex").toUpperCase().slice(0, 4),
    customStatus: "Google ile giriş yaptı",
  }).returning();
  return created;
}

export async function googleStart(mode: OAuthMode) {
  if (!env.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID tanımlı değil");
  const redirectUri = mode === "desktop" ? env.GOOGLE_REDIRECT_URI : env.GOOGLE_WEB_REDIRECT_URI;
  const state = randomBytes(16).toString("hex");
  await redis.set(stateKey(state), JSON.stringify({ redirectUri, mode } satisfies StatePayload), "EX", STATE_TTL);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return { url: url.toString(), state, mode };
}

export async function googleComplete(code: string, state: string): Promise<{ user: SessionUser; session: { token: string; expiresAt: Date } }> {
  const raw = await redis.get(stateKey(state));
  if (!raw) throw new Error("Google girişi süresi doldu, tekrar dene");
  await redis.del(stateKey(state));
  const payload = JSON.parse(raw) as StatePayload;
  const profile = await fetchGoogleProfile(code, payload.redirectUri);
  const user = await upsertGoogleUser(profile);
  const session = await createSession(user.id);
  return { user: publicUser(user), session };
}
