// Regression: the tile survival chain must not recurse once per cascaded tile.
// A tall column whose every tile loses support when the one below disappears used to
// overflow the JS call stack ("Maximum call stack size exceeded"), which tripped the
// frame-loop fuse and froze freshly generated worlds.
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';

describe('survival chain work queue', () => {
  it('processes a 20k-tile cascade without growing the call stack', () => {
    const H = 20_100;
    const w = new World(16, H, 7, 'surv-queue');
    const COL = 8, T = 1;
    for (let y = 10; y < H - 10; y++) w.store.setTileSilent(COL, y, T, 0, 0);
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
      wireSurvivalChainListeners(s: unknown): void;
    };
    g.world = w;
    let checks = 0;
    // Fake support rule: a tile of type T dies when the tile below it is empty.
    g.checkFurnitureSupport = (x: number, y: number) => {
      checks++;
      if (w.store.get(x, y) === T && !w.store.hasTile(x, y + 1)) w.store.setTile(x, y, 0);
    };
    g.checkDecorSquareFrame = () => {};
    g.dispatchWallKillFrame = () => {};
    g.wireSurvivalChainListeners(w.store);

    expect(() => w.store.setTile(COL, H - 11, 0)).not.toThrow();
    let remaining = 0;
    for (let y = 10; y < H - 10; y++) if (w.store.hasTile(COL, y)) remaining++;
    expect(remaining).toBe(0);           // whole column collapsed synchronously
    expect(checks).toBeGreaterThan(20_000);
  });
});
