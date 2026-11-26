import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isoDate } from '../dates';
import { diskMockEnabled, withDiskMock } from './disk-mock';

describe('withDiskMock', () => {
  const cwd = process.cwd();
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gcs-mock-'));
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

  it('no se activa en los tests', () => {
    expect(diskMockEnabled()).toBe(false);
  });

  it('pide la URL una sola vez al día y luego la sirve desde disco', async () => {
    const live = vi.fn(async () => json({ a: 1 }));
    const first = await withDiskMock('k'.repeat(64), 'https://x/a?d=1', live);
    const second = await withDiskMock('k'.repeat(64), 'https://x/a?d=1', live);
    expect(await first.json()).toEqual({ a: 1 });
    expect(await second.json()).toEqual({ a: 1 });
    expect(second.headers.get('X-Garmin-Mock')).toBe('disk');
    expect(live).toHaveBeenCalledTimes(1);
  });

  it('agrupa las peticiones simultáneas de la misma URL', async () => {
    const live = vi.fn(async () => json([1, 2]));
    const res = await Promise.all([1, 2, 3].map(() => withDiskMock('k'.repeat(64), 'https://x/b', live)));
    expect(live).toHaveBeenCalledTimes(1);
    for (const r of res) expect(await r.json()).toEqual([1, 2]);
  });

  it('no graba los errores', async () => {
    const live = vi.fn(async () => json({ e: 1 }, 429));
    expect((await withDiskMock('k'.repeat(64), 'https://x/c', live)).status).toBe(429);
    await withDiskMock('k'.repeat(64), 'https://x/c', live);
    expect(live).toHaveBeenCalledTimes(2);
  });

  it('conserva binarios (ZIP del FIT)', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4, 0, 255]);
    const live = async () => new Response(bytes, { headers: { 'Content-Type': 'application/x-zip-compressed' } });
    await withDiskMock('k'.repeat(64), 'https://x/fit', live);
    const again = await withDiskMock('k'.repeat(64), 'https://x/fit', live);
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(bytes);
  });

  it('borra lo grabado otros días', async () => {
    const { mkdirSync } = await import('node:fs');
    const user = join('.data/mock', 'k'.repeat(16));
    mkdirSync(join(user, '2000-01-01'), { recursive: true });
    await withDiskMock('k'.repeat(64), 'https://x/d', async () => json(1));
    expect(existsSync(join(user, '2000-01-01'))).toBe(false);
    expect(readdirSync(user)).toEqual([isoDate()]);
  });
});
