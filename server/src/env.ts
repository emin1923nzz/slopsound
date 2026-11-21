import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().default("http://localhost:1420"),
  COOKIE_SAMESITE: z.enum(["lax", "none", "strict"]).optional(),
  LIVEKIT_URL: z.string().default(""),
  LIVEKIT_API_KEY: z.string().default(""),
  LIVEKIT_API_SECRET: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z.string().default("http://127.0.0.1:43127/callback"),
  GOOGLE_WEB_REDIRECT_URI: z.string().default("http://localhost:3000/auth/google/return"),
  OAUTH_REDIRECT_TO: z.string().default("http://localhost:1420"),
  UPDATE_MANIFEST_URL: z.string().url().default("https://github.com/emin1923nzz/slopsound/releases/latest/download/latest.json"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
});

export const env = schema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);

export const cookieSameSite = env.COOKIE_SAMESITE ?? (env.NODE_ENV === "production" ? "none" : "lax");
