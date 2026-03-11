import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

function normalizeWindowsPath(input: string): string {
  return input.replace(/\\/g, "\\\\");
}

function resolveSdkRoot(): string | null {
  const fromEnv = process.env.ANDROID_SDK_ROOT?.trim() || process.env.ANDROID_HOME?.trim();
  if (fromEnv) return fromEnv;

  if (process.platform === "win32") {
    const fallback = path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
    if (fallback && existsSync(fallback)) return fallback;
  }

  return null;
}

function main() {
  const sdkRoot = resolveSdkRoot();
  if (!sdkRoot || !existsSync(sdkRoot)) {
    console.error("Android SDK not found. Install the SDK and set ANDROID_SDK_ROOT or ANDROID_HOME.");
    process.exit(1);
  }

  const localPropertiesPath = path.join("android", "local.properties");
  const content =
    process.platform === "win32"
      ? `sdk.dir=${normalizeWindowsPath(sdkRoot)}\n`
      : `sdk.dir=${sdkRoot}\n`;

  writeFileSync(localPropertiesPath, content, "utf8");
  console.log(`Wrote ${localPropertiesPath}`);
}

main();
