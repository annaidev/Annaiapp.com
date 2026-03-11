import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const MIN_JAVA_MAJOR = 21;

type CheckResult = {
  label: string;
  ok: boolean;
  details: string;
};

function run(command: string, args: string[]) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });
}

function commandExists(command: string): boolean {
  const lookup = process.platform === "win32" ? run("where", [command]) : run("which", [command]);
  return lookup.status === 0;
}

function getOutputText(result: ReturnType<typeof run>): string {
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return text.replace(/\s+/g, " ");
}

function getWindowsUserEnvVar(name: string): string | null {
  if (process.platform !== "win32") return null;
  const result = run("reg", ["query", "HKCU\\Environment", "/v", name]);
  if (result.status !== 0) return null;
  const text = `${result.stdout ?? ""}`;
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(name.toLowerCase()));
  if (!line) return null;
  const parts = line.split(/\s{2,}/).map((entry) => entry.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[2] : null;
}

function resolveJavaExecutable(): string | null {
  const javaHome = process.env.JAVA_HOME?.trim() || getWindowsUserEnvVar("JAVA_HOME");
  if (javaHome) {
    const candidate = path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
    if (existsSync(candidate)) return candidate;
  }

  if (commandExists("java")) return "java";
  return null;
}

function findAdbExecutable(): string | null {
  if (commandExists("adb")) return "adb";

  const envSdkRoot =
    process.env.ANDROID_SDK_ROOT?.trim() ||
    process.env.ANDROID_HOME?.trim() ||
    getWindowsUserEnvVar("ANDROID_SDK_ROOT") ||
    getWindowsUserEnvVar("ANDROID_HOME");

  if (envSdkRoot) {
    const fromSdk = path.join(envSdkRoot, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
    if (existsSync(fromSdk)) return fromSdk;
  }

  if (process.platform === "win32") {
    const wingetPackagesDir = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
    if (existsSync(wingetPackagesDir)) {
      const match = readdirSync(wingetPackagesDir).find((entry) => entry.startsWith("Google.PlatformTools_"));
      if (match) {
        const wingetAdb = path.join(wingetPackagesDir, match, "platform-tools", "adb.exe");
        if (existsSync(wingetAdb)) return wingetAdb;
      }
    }
  }

  return null;
}

function parseJavaMajorVersion(versionOutput: string): number | null {
  const match = versionOutput.match(/version\s+"([^"]+)"/i);
  if (!match) return null;
  const version = match[1];
  const parts = version.split(".");
  const first = Number.parseInt(parts[0] ?? "", 10);
  if (Number.isNaN(first)) return null;
  if (first === 1 && parts.length > 1) {
    const legacy = Number.parseInt(parts[1] ?? "", 10);
    return Number.isNaN(legacy) ? null : legacy;
  }
  return first;
}

function checkNode(): CheckResult {
  return { label: "Node.js", ok: true, details: `Detected ${process.version}` };
}

function checkJava(): CheckResult {
  const javaExecutable = resolveJavaExecutable();
  if (!javaExecutable) return { label: "Java", ok: false, details: "java not found in PATH" };

  const version = run(javaExecutable, ["-version"]);
  const text = getOutputText(version);
  const major = parseJavaMajorVersion(text);
  if (version.status !== 0 || !major) {
    return { label: "Java", ok: false, details: text || "Failed to run java -version" };
  }
  if (major < MIN_JAVA_MAJOR) {
    return { label: "Java", ok: false, details: `Detected Java ${major}. Android build requires Java ${MIN_JAVA_MAJOR}+` };
  }
  return { label: "Java", ok: true, details: text };
}

function checkJavaHome(): CheckResult {
  const javaHome = process.env.JAVA_HOME?.trim() || getWindowsUserEnvVar("JAVA_HOME");
  if (!javaHome) return { label: "JAVA_HOME", ok: false, details: "JAVA_HOME is not set" };

  const javaExecutable = path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
  if (!existsSync(javaExecutable)) {
    return { label: "JAVA_HOME", ok: false, details: `JAVA_HOME does not contain java executable: ${javaExecutable}` };
  }
  return { label: "JAVA_HOME", ok: true, details: javaHome };
}

function checkAndroidSdkEnv(): CheckResult {
  const sdkRoot =
    process.env.ANDROID_SDK_ROOT?.trim() ||
    process.env.ANDROID_HOME?.trim() ||
    getWindowsUserEnvVar("ANDROID_SDK_ROOT") ||
    getWindowsUserEnvVar("ANDROID_HOME");
  if (!sdkRoot) return { label: "Android SDK env", ok: false, details: "Set ANDROID_SDK_ROOT (or ANDROID_HOME)" };
  return { label: "Android SDK env", ok: true, details: sdkRoot };
}

function checkAndroidCliTools(): CheckResult {
  const adbExecutable = findAdbExecutable();
  if (!adbExecutable) return { label: "Android CLI tools", ok: false, details: "adb not found in PATH" };
  const adbVersion = run(adbExecutable, ["version"]);
  return { label: "Android CLI tools", ok: adbVersion.status === 0, details: getOutputText(adbVersion) || "adb detected" };
}

function checkCapacitorCli(): CheckResult {
  const result =
    process.platform === "win32"
      ? run("cmd.exe", ["/d", "/s", "/c", "npx cap --version"])
      : run("npx", ["cap", "--version"]);
  return {
    label: "Capacitor CLI",
    ok: result.status === 0,
    details: result.status === 0 ? getOutputText(result) : "npx cap --version failed",
  };
}

function checkProjectScaffold(): CheckResult {
  const hasAndroid = existsSync("android");
  const hasIos = existsSync("ios");
  const missing: string[] = [];
  if (!hasAndroid) missing.push("android/");
  if (!hasIos) missing.push("ios/");
  return {
    label: "Native projects",
    ok: missing.length === 0,
    details: missing.length === 0 ? "android/ and ios/ are present" : `Missing: ${missing.join(", ")}`,
  };
}

function printResult(result: CheckResult) {
  console.log(`${result.ok ? "[OK]" : "[FAIL]"} ${result.label}: ${result.details}`);
}

function main() {
  const checks = [
    checkNode(),
    checkProjectScaffold(),
    checkCapacitorCli(),
    checkJava(),
    checkJavaHome(),
    checkAndroidSdkEnv(),
    checkAndroidCliTools(),
  ];

  console.log("Annai Mobile Doctor");
  console.log("===================");
  checks.forEach(printResult);

  if (checks.some((check) => !check.ok)) {
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("All checks passed. You can run mobile builds.");
}

main();
