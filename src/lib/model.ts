// Lecture TOLÉRANTE des documents Firestore (champs manquants ou mal formés) et règles
// d'affichage du menu. Fonctions pures, testées.
import { FLEET, SIZE, fleetError, type Player, type Ship, type Shot } from './engine';

export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface GameDoc {
  id: string;
  createdAt: number;
  createdBy: string;
  players: Player[];
  status: GameStatus;
  /** Graine du tirage au sort du premier joueur, fixée à la création. */
  seed: number;
  /** Revanche réservée à ce joueur (les autres membres ne la voient pas). */
  reservedFor: string | null;
  /** Partie de revanche créée depuis celle-ci. */
  rematchId: string | null;
  /** uid du joueur qui a abandonné. */
  forfeitBy: string | null;
  winner: string | null;
}

export interface BoardDoc {
  uid: string;
  ships: Ship[];
  ready: boolean;
}

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;

function parsePlayer(v: unknown): Player | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const uid = str(o.uid);
  if (!uid) return null;
  return { uid, name: str(o.name, 'Joueur') || 'Joueur' };
}

export function parseGame(id: string, data: Record<string, unknown> | undefined): GameDoc {
  const d = data ?? {};
  const players = (Array.isArray(d.players) ? d.players : [])
    .map(parsePlayer)
    .filter((p): p is Player => p !== null)
    .slice(0, 2);
  const status: GameStatus =
    d.status === 'finished' ? 'finished' : d.status === 'playing' && players.length === 2 ? 'playing' : 'waiting';
  return {
    id,
    createdAt: num(d.createdAt),
    createdBy: str(d.createdBy, players[0]?.uid ?? ''),
    players,
    status,
    seed: Math.min(Math.max(num(d.seed, 0), 0), 0.999999),
    reservedFor: str(d.reservedFor) || null,
    rematchId: str(d.rematchId) || null,
    forfeitBy: str(d.forfeitBy) || null,
    winner: str(d.winner) || null,
  };
}

function parseShip(v: unknown): Ship | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const size = int(o.size, 2, 5);
  const x = int(o.x, 0, SIZE - 1);
  const y = int(o.y, 0, SIZE - 1);
  const dir = o.dir === 'v' ? 'v' : o.dir === 'h' ? 'h' : null;
  if (size === null || x === null || y === null || !dir) return null;
  return { size, x, y, dir };
}

export function parseBoard(uid: string, data: Record<string, unknown> | undefined): BoardDoc {
  const d = data ?? {};
  const ships = (Array.isArray(d.ships) ? d.ships : []).map(parseShip).filter((s): s is Ship => s !== null);
  // Une flotte invalide n'est jamais considérée comme prête.
  const ready = d.ready === true && ships.length === FLEET.length && fleetError(ships) === null;
  return { uid, ships, ready };
}

export function parseShot(data: Record<string, unknown> | undefined): Shot | null {
  const d = data ?? {};
  const n = int(d.n, 0, SIZE * SIZE * 2);
  const x = int(d.x, 0, SIZE - 1);
  const y = int(d.y, 0, SIZE - 1);
  const by = str(d.by);
  if (n === null || x === null || y === null || !by) return null;
  return { n, by, x, y };
}

/** Identifiant de document d'un tir : son numéro sur 3 chiffres (un seul document par tir). */
export const shotId = (n: number): string => String(n).padStart(3, '0');

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/** Une partie en attente plus vieille que ça n'est plus proposée aux autres. */
export const STALE_DAYS = 3;

function daysAgo(now: Date, days: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() - days); // calendrier local (heure d'été prise en compte)
  return d.getTime();
}

export const isMine = (g: GameDoc, uid: string): boolean => g.players.some((p) => p.uid === uid);

/** Parties que je peux rejoindre : en attente, pas à moi, pas réservées à un autre, pas trop vieilles. */
export function joinable(games: readonly GameDoc[], uid: string, now: Date): GameDoc[] {
  const limit = daysAgo(now, STALE_DAYS);
  return games
    .filter(
      (g) =>
        g.status === 'waiting' &&
        g.players.length < 2 &&
        !isMine(g, uid) &&
        (g.reservedFor === null || g.reservedFor === uid) &&
        (g.createdAt >= limit || g.reservedFor === uid),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Mes parties non terminées (à reprendre). */
export function myOngoing(games: readonly GameDoc[], uid: string): GameDoc[] {
  return games.filter((g) => g.status !== 'finished' && isMine(g, uid)).sort((a, b) => b.createdAt - a.createdAt);
}

export function opponentOf(g: GameDoc, uid: string): Player | null {
  return g.players.find((p) => p.uid !== uid) ?? null;
}

/** « à l'instant », « il y a 5 min », « il y a 2 h », « hier », « il y a 3 jours ». */
export function ago(ts: number, now: Date): string {
  const diffMin = Math.floor((now.getTime() - ts) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const then = new Date(ts);
  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  let days = 0;
  const cursor = new Date(thenDay);
  while (cursor < today && days < 400) {
    cursor.setDate(cursor.getDate() + 1);
    days++;
  }
  if (days === 0) return `il y a ${Math.floor(diffMin / 60)} h`;
  if (days === 1) return 'hier';
  return `il y a ${days} jours`;
}
