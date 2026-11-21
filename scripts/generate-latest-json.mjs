import { writeFile } from "node:fs/promises";

const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const tag = process.env.GITHUB_REF_NAME;

if (!token || !repository || !tag) {
  throw new Error("GH_TOKEN, GITHUB_REPOSITORY ve GITHUB_REF_NAME gerekli");
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "slopsound-release",
};

const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`, { headers });
if (!response.ok) {
  throw new Error(`Release alınamadı: ${response.status} ${await response.text()}`);
}

const release = await response.json();
const assets = (release.assets ?? []).map((asset) => ({
  name: asset.name,
  url: asset.url,
  browser_download_url: asset.browser_download_url,
}));
const binaries = assets.filter((asset) => !asset.name.endsWith(".sig"));

async function signatureFor(asset) {
  const sig = assets.find((item) => item.name === `${asset.name}.sig`);
  if (!sig) return null;
  const result = await fetch(sig.url, {
    headers: { ...headers, Accept: "application/octet-stream" },
  });
  if (!result.ok) {
    throw new Error(`İmza alınamadı: ${sig.name} (${result.status})`);
  }
  return (await result.text()).trim();
}

function findAsset(patterns) {
  return patterns
    .map((pattern) => binaries.find((asset) => pattern.test(asset.name.toLowerCase())))
    .find(Boolean) ?? null;
}

const platformRules = {
  "windows-x86_64": [
    /(?:x64|x86[-_]?64).*(?:setup|nsis).*\.exe$/,
    /(?:x64|x86[-_]?64).*\.exe$/,
    /(?:x64|x86[-_]?64).*\.msi$/,
    /\.msi$/,
  ],
  "windows-x86_64-nsis": [
    /(?:x64|x86[-_]?64).*(?:setup|nsis).*\.exe$/,
    /(?:x64|x86[-_]?64).*\.exe$/,
    /nsis.*\.exe$/,
    /\.exe$/,
  ],
  "linux-x86_64": [
    /(?:linux|amd64|x86[-_]?64).*\.tar\.gz$/,
    /linux.*\.tar\.xz$/,
  ],
  "linux-x86_64-appimage": [/\.appimage$/],
  "linux-x86_64-deb": [/\.deb$/],
  "darwin-aarch64": [
    /(?:aarch64|arm64|apple[-_]?silicon).*\.app\.tar\.gz$/,
    /(?:aarch64|arm64|apple[-_]?silicon).*\.dmg$/,
  ],
  "darwin-aarch64-app": [
    /(?:aarch64|arm64|apple[-_]?silicon).*\.app\.tar\.gz$/,
    /(?:aarch64|arm64).*\.dmg$/,
  ],
  "darwin-x86_64": [
    /(?:x64|x86[-_]?64|intel).*\.app\.tar\.gz$/,
    /(?:x64|x86[-_]?64|intel).*\.dmg$/,
  ],
  "darwin-x86_64-app": [
    /(?:x64|x86[-_]?64|intel).*\.app\.tar\.gz$/,
    /(?:x64|x86[-_]?64|intel).*\.dmg$/,
  ],
};

const platforms = {};
for (const [key, patterns] of Object.entries(platformRules)) {
  const asset = findAsset(patterns);
  if (!asset) continue;
  const signature = await signatureFor(asset);
  platforms[key] = signature
    ? { signature, url: asset.browser_download_url }
    : { url: asset.browser_download_url };
}

const latest = {
  version: tag.replace(/^v/, ""),
  notes: release.body ?? "",
  pub_date: release.published_at ?? new Date().toISOString(),
  platforms,
};

await writeFile("latest.json", `${JSON.stringify(latest, null, 2)}\n`, "utf8");
console.log(`latest.json yazıldı: ${Object.keys(platforms).join(", ")}`);
