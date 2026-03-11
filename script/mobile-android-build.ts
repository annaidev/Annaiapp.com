import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function run(command: string, args: string[], cwd: string, extraEnv?: Record<string, string>) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...(extraEnv ?? {}),
    },
  });

  if (typeof result.status === "number") return result.status;
  return result.error ? 1 : 0;
}

function getWindowsUserEnvVar(name: string): string | null {
  if (process.platform !== "win32") return null;
  const result = spawnSync("reg", ["query", "HKCU\\Environment", "/v", name], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) return null;
  const line = `${result.stdout ?? ""}`
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(name.toLowerCase()));
  if (!line) return null;
  const parts = line.split(/\s{2,}/).map((entry) => entry.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[2] : null;
}

function resolveJavaHome(): string | null {
  const fromEnv = process.env.JAVA_HOME?.trim();
  if (fromEnv && existsSync(path.join(fromEnv, "bin", process.platform === "win32" ? "java.exe" : "java"))) return fromEnv;
  const fromRegistry = getWindowsUserEnvVar("JAVA_HOME");
  if (fromRegistry && existsSync(path.join(fromRegistry, "bin", process.platform === "win32" ? "java.exe" : "java"))) return fromRegistry;
  return null;
}

function resolveSdkRoot(): string | null {
  const fromEnv = process.env.ANDROID_SDK_ROOT?.trim() || process.env.ANDROID_HOME?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const fromRegistry = getWindowsUserEnvVar("ANDROID_SDK_ROOT") || getWindowsUserEnvVar("ANDROID_HOME");
  if (fromRegistry && existsSync(fromRegistry)) return fromRegistry;
  if (process.platform === "win32") {
    const fallback = path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
    if (existsSync(fallback)) return fallback;
  }
  return null;
}

function main() {
  const root = process.cwd();
  const javaHome = resolveJavaHome();
  const sdkRoot = resolveSdkRoot();

  if (!javaHome) {
    console.error("Java not found. Set JAVA_HOME to JDK 21+ first.");
    process.exit(1);
  }
  if (!sdkRoot) {
    console.error("Android SDK root not found. Install Android SDK and set ANDROID_SDK_ROOT.");
    process.exit(1);
  }

  const baseEnv = {
    JAVA_HOME: javaHome,
    ANDROID_SDK_ROOT: sdkRoot,
    ANDROID_HOME: sdkRoot,
    PATH: `${path.join(javaHome, "bin")}${path.delimiter}${process.env.PATH || ""}`,
  };

  const configureStatus = run("npm", ["run", "mobile:android:configure"], root, baseEnv);
  if (configureStatus !== 0) process.exit(configureStatus);

  const gradleCommand = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  process.exit(run(gradleCommand, [":app:assembleDebug"], path.join(root, "android"), baseEnv));
}

main();
