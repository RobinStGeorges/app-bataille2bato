import { describe, expect, test } from 'vitest';
import { ago, joinable, myOngoing, parseBoard, parseGame, parseShot, shotId, type GameDoc } from '../src/lib/model';

const NOW = new Date(2026, 10, 16, 15, 0);

function game(over: Partial<GameDoc>): GameDoc {
  return parseGame(over.id ?? 'g', {
    createdAt: NOW.getTime() - 60000,
    createdBy: 'a',
    players: [{ uid: 'a', name: 'Alice' }],
    status: 'waiting',
    seed: 0.3,
    ...over,
  } as Record<string, unknown>);
}

describe('lecture tolérante', () => {
  test('document de partie vide ou abîmé', () => {
    const g = parseGame('x', undefined);
    expect(g).toMatchObject({ id: 'x', players: [], status: 'waiting', seed: 0, reservedFor: null, winner: null });
    const g2 = parseGame('y', { players: [{ uid: 'a' }, null, { name: 'sans uid' }, { uid: 'b', name: 'Bob' }, { uid: 'c' }], status: 'playing', seed: 7 });
    expect(g2.players).toEqual([{ uid: 'a', name: 'Joueur' }, { uid: 'b', name: 'Bob' }]);
    expect(g2.status).toBe('playing');
    expect(g2.seed).toBeLessThan(1);
  });

  test('« playing » avec un seul joueur est lu comme « waiting »', () => {
    expect(parseGame('z', { players: [{ uid: 'a' }], status: 'playing' }).status).toBe('waiting');
  });

  test('plateau : bateaux invalides ignorés, « prêt » seulement si la flotte est valide', () => {
    const ok = [
      { size: 5, x: 0, y: 0, dir: 'h' },
      { size: 4, x: 0, y: 2, dir: 'h' },
      { size: 3, x: 0, y: 4, dir: 'h' },
      { size: 2, x: 0, y: 6, dir: 'h' },
    ];
    expect(parseBoard('a', { ships: ok, ready: true }).ready).toBe(true);
    const bad = parseBoard('a', { ships: [...ok.slice(0, 3), { size: 2, x: 12, y: 0, dir: 'h' }], ready: true });
    expect(bad.ships).toHaveLength(3);
    expect(bad.ready).toBe(false);
    expect(parseBoard('a', undefined)).toEqual({ uid: 'a', ships: [], ready: false });
  });

  test('tir', () => {
    expect(parseShot({ n: 3, by: 'a', x: 1, y: 2 })).toEqual({ n: 3, by: 'a', x: 1, y: 2 });
    expect(parseShot({ n: 3, by: 'a', x: 10, y: 2 })).toBeNull();
    expect(parseShot({ by: 'a', x: 1, y: 2 })).toBeNull();
    expect(shotId(7)).toBe('007');
  });
});

describe('menu', () => {
  test('parties à rejoindre : en attente, pas à moi, non réservées à un autre, récentes', () => {
    const games = [
      game({ id: 'ok' }),
      game({ id: 'mine', createdBy: 'me', players: [{ uid: 'me', name: 'Moi' }] }),
      game({ id: 'full', status: 'playing', players: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }] }),
      game({ id: 'forOther', reservedFor: 'b' }),
      game({ id: 'forMe', reservedFor: 'me', createdAt: NOW.getTime() - 10 * 86400000 }),
      game({ id: 'old', createdAt: NOW.getTime() - 4 * 86400000 }),
    ];
    expect(joinable(games, 'me', NOW).map((g) => g.id).sort()).toEqual(['forMe', 'ok']);
  });

  test('mes parties en cours', () => {
    const games = [
      game({ id: 'w', createdBy: 'me', players: [{ uid: 'me', name: 'Moi' }] }),
      game({ id: 'p', status: 'playing', players: [{ uid: 'a', name: 'A' }, { uid: 'me', name: 'Moi' }] }),
      game({ id: 'f', status: 'finished', players: [{ uid: 'a', name: 'A' }, { uid: 'me', name: 'Moi' }] }),
      game({ id: 'other' }),
    ];
    expect(myOngoing(games, 'me').map((g) => g.id).sort()).toEqual(['p', 'w']);
  });

  test('ancienneté lisible', () => {
    expect(ago(NOW.getTime() - 10000, NOW)).toBe("à l'instant");
    expect(ago(NOW.getTime() - 5 * 60000, NOW)).toBe('il y a 5 min');
    expect(ago(new Date(2026, 10, 16, 9, 0).getTime(), NOW)).toBe('il y a 6 h');
    expect(ago(new Date(2026, 10, 15, 23, 0).getTime(), NOW)).toBe('hier');
    expect(ago(new Date(2026, 10, 12, 12, 0).getTime(), NOW)).toBe('il y a 4 jours');
  });
});

import { gameHash, parseHash } from '../src/lib/nav';
describe('navigation', () => {
  test('routes par hash', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/rejoindre')).toEqual({ name: 'join' });
    expect(parseHash(gameHash('abc_12-X'))).toEqual({ name: 'game', id: 'abc_12-X' });
    expect(parseHash('#/partie/../x')).toEqual({ name: 'home' });
  });
});
