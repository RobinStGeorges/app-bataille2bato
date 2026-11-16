// Couche de données contre un faux Firestore en mémoire (transactions incluses).
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('firebase/firestore', () => import('./fakeFirestore'));
vi.mock('famille-core', () => import('./fakeCore'));
const showError = vi.fn();
vi.mock('../src/lib/toast', () => ({ showError: (m: string) => showError(m) }));

import { dump, resetStore } from './fakeFirestore';
import {
  cancelGame,
  createGame,
  finishGame,
  fire,
  joinGame,
  rematch,
  saveBoard,
  watchBoards,
  watchGame,
  watchLobby,
  watchShots,
} from '../src/lib/data';
import { playBattle, randomFleet, shipCells, type Shot } from '../src/lib/engine';
import type { BoardDoc, GameDoc } from '../src/lib/model';

const F = 'fam1';
const alice = { uid: 'a', name: 'Alice' };
const bob = { uid: 'b', name: 'Bob' };
const carl = { uid: 'c', name: 'Carl' };
const flush = () => new Promise((r) => setTimeout(r, 5));
const base = `families/${F}/apps/bataille2bato/games`;

function latest<T>(subscribe: (cb: (v: T) => void) => () => void) {
  const box: { value?: T; stop: () => void } = { stop: () => {} };
  box.stop = subscribe((v) => (box.value = v));
  return box;
}

beforeEach(() => {
  resetStore();
  showError.mockClear();
});

describe('création et arrivée des joueurs', () => {
  test('toutes les données sont rangées sous families/{fid}/apps/bataille2bato/', async () => {
    const gid = createGame(F, alice);
    saveBoard(F, gid, 'a', randomFleet());
    await flush();
    const paths = Object.keys(dump());
    expect(paths.length).toBe(2);
    expect(paths.every((p) => p.startsWith(`families/${F}/apps/bataille2bato/`))).toBe(true);
  });

  test('la partie apparaît dans le menu de la famille, puis passe « en cours » quand Bob rejoint', async () => {
    const lobby = latest<GameDoc[]>((cb) => watchLobby(F, cb, () => {}));
    const gid = createGame(F, alice);
    await flush();
    expect(lobby.value?.map((g) => g.status)).toEqual(['waiting']);
    await joinGame(F, gid, bob);
    await flush();
    expect(lobby.value?.[0].players.map((p) => p.uid)).toEqual(['a', 'b']);
    expect(lobby.value?.[0].status).toBe('playing');
  });

  test('un troisième joueur est refusé', async () => {
    const gid = createGame(F, alice);
    await joinGame(F, gid, bob);
    await expect(joinGame(F, gid, carl)).rejects.toThrow(/deux joueurs/);
  });

  test('deux personnes qui rejoignent en même temps : une seule est acceptée', async () => {
    const gid = createGame(F, alice);
    const results = await Promise.allSettled([joinGame(F, gid, bob), joinGame(F, gid, carl)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const g = dump()[`${base}/${gid}`] as { players: { uid: string }[] };
    expect(g.players).toHaveLength(2);
  });

  test('rejoindre sa propre partie ne change rien ; partie supprimée : message clair', async () => {
    const gid = createGame(F, alice);
    await joinGame(F, gid, alice);
    expect((dump()[`${base}/${gid}`] as { players: unknown[] }).players).toHaveLength(1);
    cancelGame(F, gid, 'a');
    await flush();
    await expect(joinGame(F, gid, bob)).rejects.toThrow(/n'existe plus/);
  });

  test('la flotte envoyée à Firestore est un objet simple', async () => {
    const gid = createGame(F, alice);
    saveBoard(F, gid, 'a', randomFleet());
    await flush();
    expect(showError).not.toHaveBeenCalled();
    const b = latest<Record<string, BoardDoc>>((cb) => watchBoards(F, gid, cb, () => {}));
    await flush();
    expect(b.value?.a.ready).toBe(true);
  });
});

describe('une partie complète entre deux téléphones', () => {
  test('placement, tirs chacun son tour, victoire, puis revanche commune', async () => {
    const gid = createGame(F, alice);
    await joinGame(F, gid, bob);
    const fa = randomFleet();
    const fb = randomFleet();
    saveBoard(F, gid, 'a', fa);
    saveBoard(F, gid, 'b', fb);

    const game = latest<GameDoc | null>((cb) => watchGame(F, gid, cb, () => {}));
    const shots = latest<Shot[]>((cb) => watchShots(F, gid, cb, () => {}));
    await flush();

    const targets = { a: fb.flatMap(shipCells), b: fa.flatMap(shipCells) };
    const misses: Record<string, number> = { a: 0, b: 0 };
    for (let guard = 0; guard < 300; guard++) {
      const g = game.value!;
      const battle = playBattle(g.players, g.seed, { a: fa, b: fb }, shots.value ?? []);
      if (battle.winner) {
        finishGame(F, gid, battle.winner);
        break;
      }
      const who = battle.turn!;
      // Alice vise juste, Bob tire dans le vide sur des cases sans bateau.
      if (who === 'a') {
        const [x, y] = targets.a.shift()!;
        fire(F, gid, battle.nextN, who, x, y);
      } else {
        const free = Array.from({ length: 100 }, (_, k) => [k % 10, Math.floor(k / 10)]).filter(
          ([x, y]) => !fa.some((s) => shipCells(s).some(([sx, sy]) => sx === x && sy === y)),
        );
        const [x, y] = free[misses.b++];
        fire(F, gid, battle.nextN, who, x, y);
      }
      await flush();
    }
    await flush();
    expect(game.value?.status).toBe('finished');
    expect(game.value?.winner).toBe('a');
    expect(Object.keys(dump()).filter((p) => p.includes('/shots/')).length).toBeGreaterThanOrEqual(14 * 2 - 1);

    // Les deux appuient sur « Rejouer » en même temps : une seule revanche, avec les deux joueurs.
    const [ra, rb] = await Promise.all([rematch(F, gid, alice), rematch(F, gid, bob)]);
    expect(ra).toBe(rb);
    const r = dump()[`${base}/${ra}`] as { players: { uid: string }[]; status: string; reservedFor: string };
    expect(r.players.map((p) => p.uid).sort()).toEqual(['a', 'b']);
    expect(r.status).toBe('playing');
    // Appuyer de nouveau rouvre la même revanche.
    expect(await rematch(F, gid, alice)).toBe(ra);
  });

  test('revanche proposée puis annulée : on peut en reproposer une', async () => {
    const gid = createGame(F, alice);
    await joinGame(F, gid, bob);
    finishGame(F, gid, 'a');
    const r1 = await rematch(F, gid, bob);
    expect((dump()[`${base}/${r1}`] as { reservedFor: string }).reservedFor).toBe('a');
    await expect(joinGame(F, r1, carl)).rejects.toThrow(/réservée/);
    cancelGame(F, r1, 'b');
    await flush();
    const r2 = await rematch(F, gid, alice);
    expect(r2).not.toBe(r1);
  });
});
