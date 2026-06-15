import { rmSync } from "node:fs";
import path from "node:path";

/** 매 테스트 런 전, 격리 DB(+WAL/SHM)를 지워 깨끗한 시드 상태에서 시작한다. */
export default function setup() {
  const base = path.join(process.cwd(), "test-run.db");
  for (const f of [base, `${base}-wal`, `${base}-shm`, `${base}-journal`]) {
    rmSync(f, { force: true });
  }
}
