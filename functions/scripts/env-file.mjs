import fs from "node:fs";
import path from "node:path";

export const envPath = path.resolve(".env");

export function readEnvFile() {
  return fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
}

export function upsertEnvValue(key, value) {
  const existingEnv = readEnvFile();
  const linePattern = new RegExp(`^${key}=.*$`, "m");
  const nextLine = `${key}=${value}`;
  const nextEnv = linePattern.test(existingEnv)
    ? existingEnv.replace(linePattern, nextLine)
    : `${existingEnv.trimEnd()}\n${nextLine}\n`;

  fs.writeFileSync(envPath, nextEnv.endsWith("\n") ? nextEnv : `${nextEnv}\n`);
}
