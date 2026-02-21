import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const uri = (process.env.MONGODB_URI ?? "").trim();

if (!uri) {
  console.error("Missing MONGODB_URI. Set it in .env first.");
  process.exit(1);
}

const binName = process.platform === "win32" ? "mongosh.cmd" : "mongosh";
const mongoshBin = resolve(process.cwd(), "node_modules", ".bin", binName);

if (!existsSync(mongoshBin)) {
  console.error("Local mongosh not found. Run `pnpm add -D mongosh` first.");
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
const extraArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const child = spawn(mongoshBin, [uri, ...extraArgs], {
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("Failed to start local mongosh:", error?.message ?? error);
  process.exit(1);
});
