import { mkdir, rm } from "node:fs/promises";

const tmpDir = new URL("../.tmp/", import.meta.url);
const baseName = "taskflow.test.db";

await mkdir(tmpDir, { recursive: true });

for (const suffix of ["", "-wal", "-shm"]) {
  await rm(new URL(`${baseName}${suffix}`, tmpDir), { force: true });
}
