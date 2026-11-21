const configured = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

export const API_BASE = configured || (import.meta.env.PROD ? "https://slopsound.onrender.com" : "http://localhost:3000");
export const INVITE_BASE_URL = "https://slopsound.onrender.com/invite/";
