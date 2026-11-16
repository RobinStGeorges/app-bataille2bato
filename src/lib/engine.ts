// Moteur de règles PUR de la bataille navale : aucune dépendance (ni Firebase, ni Svelte).
// Tout l'état d'une partie se déduit de : la liste des joueurs, la graine du tirage au sort,
// les flottes des deux joueurs et la liste ordonnée des tirs. Rien de calculé n'est stocké.

export const SIZE = 10;
/** Les 4 bateaux de chaque flotte (une seule pièce de chaque taille). */
export const FLEET = [5, 4, 3, 2] as const;
export const SHIP_NAMES: Record<number, string> = {
  5: 'Porte-avions',
  4: 'Croiseur',
  3: 'Sous-marin',
  2: 'Torpilleur',
};

export type Dir = 'h' | 'v';
/** Un bateau : case de départ (x = colonne, y = ligne, de 0 à 9) et orientation. */
export interface Ship {
  size: number;
  x: number;
  y: number;
  dir: Dir;
}
export interface Shot {
  /** Numéro d'ordre du tir dans la partie (0, 1, 2…). */
  n: number;
  /** uid du tireur. */
  by: string;
  x: number;
  y: number;
}
export interface Player {
  uid: string;
  name: string;
}

export const key = (x: number, y: number): number => y * SIZE + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

/** « A1 » … « J10 » : colonnes en lettres, lignes en chiffres. */
export function coordLabel(x: number, y: number): string {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export function shipCells(ship: Ship): [number, number][] {
  const cells: [number, number][] = [];
  for (let i = 0; i < ship.size; i++) {
    cells.push(ship.dir === 'h' ? [ship.x + i, ship.y] : [ship.x, ship.y + i]);
  }
  return cells;
}

/** Vrai si `ship` tient dans la grille et ne chevauche aucun des `others`. Les bateaux peuvent se toucher. */
export function fits(ship: Ship, others: readonly Ship[]): boolean {
  const taken = new Set<number>();
  for (const o of others) for (const [x, y] of shipCells(o)) taken.add(key(x, y));
  return shipCells(ship).every(([x, y]) => inside(x, y) && !taken.has(key(x, y)));
}

/** Message d'erreur en français, ou null si la flotte est complète et valide. */
export function fleetError(ships: readonly Ship[]): string | null {
  const sizes = ships.map((s) => s.size).sort((a, b) => b - a);
  const expected = [...FLEET].sort((a, b) => b - a);
  if (sizes.length !== expected.length || sizes.some((s, i) => s !== expected[i])) {
    return 'Placez vos 4 bateaux (2, 3, 4 et 5 cases).';
  }
  for (let i = 0; i < ships.length; i++) {
    if (!fits(ships[i], ships.slice(0, i))) return 'Deux bateaux se chevauchent ou sortent de la grille.';
  }
  return null;
}

/** Flotte complète placée au hasard (rand injectable pour les tests). */
export function randomFleet(rand: () => number = Math.random): Ship[] {
  for (let attempt = 0; attempt < 100; attempt++) {
    const ships: Ship[] = [];
    let ok = true;
    for (const size of FLEET) {
      let placed = false;
      for (let t = 0; t < 200 && !placed; t++) {
        const dir: Dir = rand() < 0.5 ? 'h' : 'v';
        const maxX = dir === 'h' ? SIZE - size : SIZE - 1;
        const maxY = dir === 'v' ? SIZE - size : SIZE - 1;
        const ship = { size, dir, x: Math.floor(rand() * (maxX + 1)), y: Math.floor(rand() * (maxY + 1)) };
        if (fits(ship, ships)) {
          ships.push(ship);
          placed = true;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return ships;
  }
  throw new Error('Placement aléatoire impossible.');
}

/** Index du bateau occupant la case, ou -1. */
export function shipAt(ships: readonly Ship[], x: number, y: number): number {
  return ships.findIndex((s) => shipCells(s).some(([cx, cy]) => cx === x && cy === y));
}

// ---------------------------------------------------------------------------
// Déroulement de la partie
// ---------------------------------------------------------------------------

/** Tirage au sort du premier joueur, déduit de la graine fixée à la création (identique sur les deux téléphones). */
export function firstPlayer(seed: number, players: readonly Player[]): string {
  return players[seed < 0.5 ? 0 : 1].uid;
}

export type ShotResult = 'miss' | 'hit' | 'sunk';

export interface ResolvedShot extends Shot {
  result: ShotResult;
  /** Taille du bateau touché, si touché. */
  size?: number;
}

export interface Battle {
  /** Tirs valides, dans l'ordre, avec leur résultat. */
  shots: ResolvedShot[];
  /** uid du joueur qui doit tirer (null si la partie est finie). */
  turn: string | null;
  /** Numéro du prochain tir. */
  nextN: number;
  winner: string | null;
}

/**
 * Rejoue la partie à partir des tirs enregistrés.
 * Les joueurs tirent chacun leur tour (un tir par tour, touché ou non).
 * Un tir n'est retenu que s'il porte le bon numéro et vient du bon joueur ;
 * on s'arrête au premier trou dans la numérotation (tir pas encore reçu).
 */
export function playBattle(
  players: readonly Player[],
  seed: number,
  fleets: Readonly<Record<string, readonly Ship[]>>,
  rawShots: readonly Shot[],
): Battle {
  const first = firstPlayer(seed, players);
  const second = players[0].uid === first ? players[1].uid : players[0].uid;
  const other = (uid: string) => (uid === first ? second : first);

  const byN = new Map<number, Shot>();
  for (const s of rawShots) if (!byN.has(s.n)) byN.set(s.n, s);

  const hitsOn: Record<string, Set<number>> = { [first]: new Set(), [second]: new Set() };
  const shots: ResolvedShot[] = [];
  let winner: string | null = null;
  let n = 0;

  while (!winner) {
    const s = byN.get(n);
    const shooter = n % 2 === 0 ? first : second;
    if (!s || s.by !== shooter || !inside(s.x, s.y)) break;
    const target = other(shooter);
    const fleet = fleets[target] ?? [];
    const k = key(s.x, s.y);
    const idx = shipAt(fleet, s.x, s.y);
    let result: ShotResult = 'miss';
    let size: number | undefined;
    if (idx >= 0) {
      const already = hitsOn[target].has(k);
      hitsOn[target].add(k);
      size = fleet[idx].size;
      result = !already && shipCells(fleet[idx]).every(([x, y]) => hitsOn[target].has(key(x, y))) ? 'sunk' : 'hit';
      if (fleet.every((ship) => shipCells(ship).every(([x, y]) => hitsOn[target].has(key(x, y))))) {
        winner = shooter;
      }
    }
    shots.push({ ...s, result, size });
    n++;
  }

  return { shots, nextN: n, winner, turn: winner ? null : n % 2 === 0 ? first : second };
}

// ---------------------------------------------------------------------------
// Vues des grilles
// ---------------------------------------------------------------------------

export type CellView = 'water' | 'ship' | 'miss' | 'hit' | 'sunk';

/**
 * Grille de MA flotte : mes bateaux et les tirs de l'adversaire.
 */
export function fleetView(ships: readonly Ship[], incoming: readonly ResolvedShot[]): CellView[] {
  const cells: CellView[] = Array(SIZE * SIZE).fill('water');
  for (const s of ships) for (const [x, y] of shipCells(s)) cells[key(x, y)] = 'ship';
  const hit = new Set<number>();
  for (const s of incoming) {
    const k = key(s.x, s.y);
    if (cells[k] === 'water' || cells[k] === 'miss') cells[k] = 'miss';
    else hit.add(k);
  }
  for (const s of ships) {
    const cs = shipCells(s).map(([x, y]) => key(x, y));
    const sunk = cs.every((k) => hit.has(k));
    for (const k of cs) if (hit.has(k)) cells[k] = sunk ? 'sunk' : 'hit';
  }
  return cells;
}

/**
 * Grille de TIR : uniquement ce que je sais de l'adversaire (mes tirs et leurs résultats).
 * Un bateau coulé apparaît en entier ; ses cases non touchées n'existent pas (il est coulé
 * précisément quand toutes ses cases sont touchées). La flotte adverse n'est jamais lue ici.
 */
export function targetView(myShots: readonly ResolvedShot[]): CellView[] {
  const cells: CellView[] = Array(SIZE * SIZE).fill('water');
  for (const s of myShots) {
    const k = key(s.x, s.y);
    if (s.result === 'miss') {
      if (cells[k] === 'water') cells[k] = 'miss';
    } else if (cells[k] !== 'sunk') cells[k] = 'hit';
  }
  return cells;
}

/**
 * Marque en « coulé » les cases des bateaux adverses coulés.
 * Ne reçoit que les bateaux déjà coulés (l'appelant filtre), pour ne rien révéler d'autre.
 */
export function markSunk(cells: CellView[], sunkShips: readonly Ship[]): CellView[] {
  const out = [...cells];
  for (const s of sunkShips) for (const [x, y] of shipCells(s)) out[key(x, y)] = 'sunk';
  return out;
}

/** Bateaux de `ships` entièrement touchés par `incoming`. */
export function sunkShips(ships: readonly Ship[], incoming: readonly Shot[]): Ship[] {
  const hit = new Set(incoming.map((s) => key(s.x, s.y)));
  return ships.filter((s) => shipCells(s).every(([x, y]) => hit.has(key(x, y))));
}

/** Vrai si j'ai déjà tiré sur cette case. */
export function alreadyShot(myShots: readonly Shot[], x: number, y: number): boolean {
  return myShots.some((s) => s.x === x && s.y === y);
}
