import { describe, expect, test } from 'vitest';
import {
  FLEET,
  SIZE,
  alreadyShot,
  coordLabel,
  firstPlayer,
  fits,
  fleetError,
  fleetView,
  markSunk,
  playBattle,
  randomFleet,
  shipCells,
  sunkShips,
  targetView,
  type Ship,
  type Shot,
} from '../src/lib/engine';

const A = { uid: 'a', name: 'Alice' };
const B = { uid: 'b', name: 'Bob' };
const PLAYERS = [A, B];

// Flottes simples : une ligne par bateau, à gauche.
const fleetRows = (): Ship[] => [
  { size: 5, x: 0, y: 0, dir: 'h' },
  { size: 4, x: 0, y: 2, dir: 'h' },
  { size: 3, x: 0, y: 4, dir: 'h' },
  { size: 2, x: 0, y: 6, dir: 'h' },
];

/** Générateur pseudo-aléatoire déterministe. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('placement', () => {
  test('cases d’un bateau horizontal et vertical', () => {
    expect(shipCells({ size: 3, x: 1, y: 2, dir: 'h' })).toEqual([[1, 2], [2, 2], [3, 2]]);
    expect(shipCells({ size: 2, x: 4, y: 8, dir: 'v' })).toEqual([[4, 8], [4, 9]]);
  });

  test('refuse un bateau qui sort de la grille ou en chevauche un autre ; accepte les bateaux qui se touchent', () => {
    expect(fits({ size: 5, x: 6, y: 0, dir: 'h' }, [])).toBe(false);
    expect(fits({ size: 5, x: 5, y: 0, dir: 'h' }, [])).toBe(true);
    expect(fits({ size: 3, x: 0, y: 8, dir: 'v' }, [])).toBe(false);
    const placed: Ship[] = [{ size: 4, x: 2, y: 2, dir: 'h' }];
    expect(fits({ size: 3, x: 3, y: 0, dir: 'v' }, placed)).toBe(false);
    expect(fits({ size: 3, x: 2, y: 3, dir: 'h' }, placed)).toBe(true);
  });

  test('flotte : exactement un bateau de 2, 3, 4 et 5 cases, sans chevauchement', () => {
    expect(fleetError(fleetRows())).toBeNull();
    expect(fleetError(fleetRows().slice(0, 3))).toMatch(/4 bateaux/);
    expect(fleetError([...fleetRows().slice(0, 3), { size: 3, x: 0, y: 6, dir: 'h' }])).toMatch(/4 bateaux/);
    const overlap = fleetRows();
    overlap[3] = { size: 2, x: 0, y: 0, dir: 'v' };
    expect(fleetError(overlap)).toMatch(/chevauchent/);
  });

  test('placement aléatoire toujours valide (500 tirages)', () => {
    const rand = seeded(42);
    for (let i = 0; i < 500; i++) {
      const f = randomFleet(rand);
      expect(fleetError(f)).toBeNull();
      expect(f.map((s) => s.size)).toEqual([...FLEET]);
    }
  });
});

describe('tirage au sort du premier joueur', () => {
  test('dépend uniquement de la graine : même résultat sur les deux téléphones', () => {
    expect(firstPlayer(0.1, PLAYERS)).toBe('a');
    expect(firstPlayer(0.7, PLAYERS)).toBe('b');
  });

  test('équitable sur un grand nombre de graines', () => {
    const rand = seeded(7);
    let a = 0;
    for (let i = 0; i < 10000; i++) if (firstPlayer(rand(), PLAYERS) === 'a') a++;
    expect(a).toBeGreaterThan(4500);
    expect(a).toBeLessThan(5500);
  });
});

describe('déroulement', () => {
  const fleets = { a: fleetRows(), b: fleetRows() };

  test('chacun son tour, en commençant par le joueur tiré au sort', () => {
    let battle = playBattle(PLAYERS, 0.9, fleets, []);
    expect(battle.turn).toBe('b');
    expect(battle.nextN).toBe(0);
    battle = playBattle(PLAYERS, 0.9, fleets, [{ n: 0, by: 'b', x: 9, y: 9 }]);
    expect(battle.turn).toBe('a');
    expect(battle.shots[0].result).toBe('miss');
  });

  test('touché, puis coulé quand toutes les cases du bateau sont touchées', () => {
    const shots: Shot[] = [
      { n: 0, by: 'a', x: 0, y: 6 },
      { n: 1, by: 'b', x: 9, y: 9 },
      { n: 2, by: 'a', x: 1, y: 6 },
    ];
    const battle = playBattle(PLAYERS, 0.1, fleets, shots);
    expect(battle.shots.map((s) => s.result)).toEqual(['hit', 'miss', 'sunk']);
    expect(battle.shots[2].size).toBe(2);
    expect(battle.turn).toBe('b');
  });

  test('retirer sur une case déjà touchée ne recoule pas le bateau et passe le tour', () => {
    const shots: Shot[] = [
      { n: 0, by: 'a', x: 0, y: 6 },
      { n: 1, by: 'b', x: 9, y: 9 },
      { n: 2, by: 'a', x: 1, y: 6 },
      { n: 3, by: 'b', x: 9, y: 8 },
      { n: 4, by: 'a', x: 1, y: 6 },
    ];
    const battle = playBattle(PLAYERS, 0.1, fleets, shots);
    expect(battle.shots[4].result).toBe('hit');
    expect(battle.turn).toBe('b');
  });

  test('ignore les tirs du mauvais joueur, les doublons de numéro et ce qui suit un trou', () => {
    const shots: Shot[] = [
      { n: 0, by: 'a', x: 5, y: 5 },
      { n: 0, by: 'a', x: 6, y: 6 }, // doublon : le premier reçu compte
      { n: 1, by: 'a', x: 7, y: 7 }, // pas son tour
    ];
    let battle = playBattle(PLAYERS, 0.1, fleets, shots);
    expect(battle.shots).toHaveLength(1);
    expect(battle.shots[0]).toMatchObject({ x: 5, y: 5 });
    expect(battle.turn).toBe('b');

    battle = playBattle(PLAYERS, 0.1, fleets, [{ n: 0, by: 'a', x: 1, y: 1 }, { n: 2, by: 'a', x: 2, y: 2 }]);
    expect(battle.shots).toHaveLength(1);
    expect(battle.nextN).toBe(1);
  });

  test('victoire quand tous les bateaux adverses sont coulés ; les tirs suivants sont ignorés', () => {
    const targets = shipCellsOf(fleets.b);
    const shots: Shot[] = [];
    let n = 0;
    for (const [x, y] of targets) {
      shots.push({ n: n++, by: 'a', x, y });
      shots.push({ n: n++, by: 'b', x: 9, y: 9 });
    }
    const battle = playBattle(PLAYERS, 0.1, fleets, shots);
    expect(battle.winner).toBe('a');
    expect(battle.turn).toBeNull();
    expect(battle.shots).toHaveLength(targets.length * 2 - 1);
    expect(battle.shots.filter((s) => s.result === 'sunk')).toHaveLength(4);
  });
});

function shipCellsOf(f: Ship[]): [number, number][] {
  return f.flatMap((s) => shipCells(s));
}

describe('grilles affichées', () => {
  test('ma flotte montre mes bateaux, les tirs reçus, touchés et coulés', () => {
    const fleet = fleetRows();
    const incoming = [
      { n: 1, by: 'b', x: 0, y: 6, result: 'hit' as const },
      { n: 3, by: 'b', x: 1, y: 6, result: 'sunk' as const },
      { n: 5, by: 'b', x: 0, y: 0, result: 'hit' as const },
      { n: 7, by: 'b', x: 9, y: 9, result: 'miss' as const },
    ];
    const v = fleetView(fleet, incoming);
    expect(v).toHaveLength(SIZE * SIZE);
    expect(v[6 * SIZE + 0]).toBe('sunk');
    expect(v[6 * SIZE + 1]).toBe('sunk');
    expect(v[0]).toBe('hit');
    expect(v[1]).toBe('ship');
    expect(v[99]).toBe('miss');
    expect(v[50]).toBe('water');
  });

  test('la grille de tir ne révèle que mes tirs, et les bateaux coulés', () => {
    const mine = [
      { n: 0, by: 'a', x: 3, y: 3, result: 'miss' as const },
      { n: 2, by: 'a', x: 0, y: 6, result: 'hit' as const },
      { n: 4, by: 'a', x: 1, y: 6, result: 'sunk' as const },
      { n: 6, by: 'a', x: 0, y: 0, result: 'hit' as const },
    ];
    const opponent = fleetRows();
    const sunk = sunkShips(opponent, mine);
    expect(sunk).toEqual([opponent[3]]);
    const v = markSunk(targetView(mine), sunk);
    expect(v[33]).toBe('miss');
    expect(v[60]).toBe('sunk');
    expect(v[61]).toBe('sunk');
    expect(v[0]).toBe('hit');
    expect(v[1]).toBe('water'); // le porte-avions non coulé reste caché
    expect(alreadyShot(mine, 3, 3)).toBe(true);
    expect(alreadyShot(mine, 4, 4)).toBe(false);
  });

  test('coordonnées lisibles', () => {
    expect(coordLabel(0, 0)).toBe('A1');
    expect(coordLabel(9, 9)).toBe('J10');
  });
});
