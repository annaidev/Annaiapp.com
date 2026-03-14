import { existsSync, readFileSync } from "fs";
import path from "path";

type CheckResult = {
  label: string;
  ok: boolean;
  detail: string;
};

const repoRoot = process.cwd();

function fileExists(relativePath: string): CheckResult {
  const fullPath = path.join(repoRoot, relativePath);
  return {
    label: relativePath,
    ok: existsSync(fullPath),
    detail: existsSync(fullPath) ? "present" : "missing",
  };
}

function fileContains(relativePath: string, pattern: string, label: string): CheckResult {
  const fullPath = path.join(repoRoot, relativePath);
  if (!existsSync(fullPath)) {
    return { label, ok: false, detail: `${relativePath} is missing` };
  }

  const content = readFileSync(fullPath, "utf8");
  const ok = content.includes(pattern);
  return {
    label,
    ok,
    detail: ok ? `found "${pattern}"` : `missing "${pattern}"`,
  };
}

function printResults(section: string, results: CheckResult[]) {
  console.log(`\n${section}`);
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.label}: ${result.detail}`);
  }
}

const publicPages = [
  fileExists("client/public/privacy-policy/index.html"),
  fileExists("client/public/terms-of-service/index.html"),
  fileExists("client/public/support/index.html"),
  fileExists("client/public/account-deletion/index.html"),
];

const docsChecks = [
  fileExists("docs/APP_STORE_BLUEPRINT.md"),
  fileExists("docs/STORE_SUBMISSION_CHECKLIST.md"),
  fileExists("docs/APP_STORE_METADATA.md"),
  fileExists("docs/GOOGLE_PLAY_METADATA.md"),
  fileExists("docs/PRIVACY_DISCLOSURES_DRAFT.md"),
  fileExists("docs/EXTERNAL_DEPENDENCIES.md"),
];

const billingChecks = [
  fileContains("shared/routes.ts", "/api/subscription/purchase-context", "subscription purchase context route"),
  fileContains("shared/routes.ts", "/api/subscription/sync/apple", "apple sync route"),
  fileContains("shared/routes.ts", "/api/subscription/sync/google", "google sync route"),
  fileContains("client/src/services/mobileBillingService.ts", "sync/apple", "client apple sync usage"),
  fileContains("client/src/services/mobileBillingService.ts", "sync/google", "client google sync usage"),
  fileContains("android/app/build.gradle", "com.android.billingclient:billing", "android billing dependency"),
  fileContains("ios/App/App/AppDelegate.swift", "StoreKit", "ios StoreKit bridge"),
];

const envChecks = [
  fileContains(".env.example", "SESSION_SECRET=", "SESSION_SECRET env"),
  fileContains(".env.example", "SUBSCRIPTION_WEBHOOK_SECRET=", "SUBSCRIPTION_WEBHOOK_SECRET env"),
  fileContains(".env.example", "GOOGLE_PLAY_PACKAGE_NAME=", "GOOGLE_PLAY_PACKAGE_NAME env"),
  fileContains(".env.example", "GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL=", "GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL env"),
  fileContains(".env.example", "GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY=", "GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY env"),
  fileContains(".env.example", "APPLE_ROOT_CA_PEM=", "APPLE_ROOT_CA_PEM env"),
];

const supportLinkChecks = [
  fileContains("client/src/pages/AuthPage.tsx", "/support/", "support link on auth page"),
  fileContains("client/src/pages/AccountPage.tsx", "/account-deletion/", "account deletion link on account page"),
  fileContains("client/public/privacy-policy/index.html", "/account-deletion/", "account deletion link in privacy policy"),
];

printResults("Public Pages", publicPages);
printResults("Documentation", docsChecks);
printResults("Billing Integration", billingChecks);
printResults("Environment Template", envChecks);
printResults("Support and Legal Links", supportLinkChecks);

const allChecks = [
  ...publicPages,
  ...docsChecks,
  ...billingChecks,
  ...envChecks,
  ...supportLinkChecks,
];

const failedChecks = allChecks.filter((check) => !check.ok);
console.log(`\nSummary: ${allChecks.length - failedChecks.length}/${allChecks.length} checks passing.`);
if (failedChecks.length > 0) {
  process.exitCode = 1;
}
