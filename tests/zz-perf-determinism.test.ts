// Perf-work guard (env-gated): hashes a fully generated world so optimisations can prove
// they produce bit-identical worlds. Run: SW_PERF_DET=1 npx vitest run tests/zz-perf-determinism.test.ts
import { describe, it } from 'vitest';
import { createHash } from 'node:crypto';
import { writeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const ON = process.env.SW_PERF_DET === '1';
const SEEDS = (process.env.SW_PERF_DET_SEEDS ?? '05162020').split(',');
const W = Number(process.env.SW_PERF_DET_W ?? 4200), H = Number(process.env.SW_PERF_DET_H ?? 1200);

describe('perf determinism guard', () => {
  for (const seed of SEEDS) {
    it.skipIf(!ON)(`seed ${seed} ${W}x${H}`, async () => {
      const t0 = Date.now();
      const world = await generateWorld({ width: W, height: H, seedText: seed, evil: 0 });
      const ms = Date.now() - t0;
      const st = world.store as unknown as Record<string, ArrayLike<number> & { buffer: ArrayBuffer; byteOffset: number; byteLength: number }>;
      const h = createHash('sha256');
      const fields = Object.keys(st).filter((k) => ArrayBuffer.isView((st as Record<string, unknown>)[k])).sort();
      for (const k of fields) {
        const a = st[k];
        h.update(k);
        h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      }
      writeSync(1, `[perf-det] seed=${seed} ${W}x${H} gen=${ms}ms fields=${fields.join(',')} hash=${h.digest('hex')}\n`);
    }, 900_000);
  }
});
