import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicAddDirectory = join(root, "public", "add");
const stagedAddDirectory = join(root, ".orarium-add-build-stage");
const outputAddDirectory = join(root, "dist", "add");

let staged = false;

try {
  rmSync(stagedAddDirectory, { recursive: true, force: true });

  if (existsSync(publicAddDirectory)) {
    renameSync(publicAddDirectory, stagedAddDirectory);
    staged = true;
  }

  // The legacy build hashes only top-level files in dist/. Keep the new
  // /add/ directory out of that pass, then copy it into the finished output.
  await import("./build.mjs");

  if (staged) {
    mkdirSync(dirname(outputAddDirectory), { recursive: true });
    cpSync(stagedAddDirectory, outputAddDirectory, { recursive: true });
  }
} finally {
  if (staged && existsSync(stagedAddDirectory)) {
    rmSync(publicAddDirectory, { recursive: true, force: true });
    renameSync(stagedAddDirectory, publicAddDirectory);
  }
}
