import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { FamilleError, appCollection, getServices, toFrenchMessage } from 'famille-core';
import type { Player, Ship } from './engine';
import {
  isMine,
  opponentOf,
  parseBoard,
  parseGame,
  parseShot,
  shotId,
  type BoardDoc,
  type GameDoc,
} from './model';
import type { Shot } from './engine';
import { showError } from './toast';

// Toutes les données de l'app vivent sous families/{familyId}/apps/bataille2bato/...
//   games/{gameId}                 la partie : joueurs, statut, graine du tirage au sort
//   games/{gameId}/boards/{uid}    la flotte d'un joueur (un document par joueur)
//   games/{gameId}/shots/{nnn}     un document par tir, numéroté (000, 001, …)
export const APP_ID = 'bataille2bato';
const gamesCol = (fid: string) => appCollection(fid, APP_ID, 'games');
const gameRef = (fid: string, gid: string) => doc(gamesCol(fid), gid);
const boardsCol = (fid: string, gid: string) => collection(gameRef(fid, gid), 'boards');
const shotsCol = (fid: string, gid: string) => collection(gameRef(fid, gid), 'shots');

/** Les écritures ne sont jamais « attendues » (elles fonctionnent hors connexion). */
function run(work: Promise<unknown>): void {
  work.catch((e) => showError(`Action non enregistrée. ${toFrenchMessage(e)}`));
}

// ---------------------------------------------------------------------------
// Écoutes
// ---------------------------------------------------------------------------

/** Parties non terminées de la famille (le tri et le filtrage se font dans model.ts). */
export function watchLobby(
  fid: string,
  onData: (games: GameDoc[]) => void,
  onError: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(gamesCol(fid), where('status', 'in', ['waiting', 'playing'])),
    (snap) => onData(snap.docs.map((d) => parseGame(d.id, d.data()))),
    onError,
  );
}

/** `null` : la partie n'existe pas (ou plus). `undefined` n'est jamais envoyé avant d'en être sûr. */
export function watchGame(
  fid: string,
  gid: string,
  onData: (game: GameDoc | null) => void,
  onError: (e: unknown) => void,
): () => void {
  return onSnapshot(
    gameRef(fid, gid),
    (snap) => {
      if (!snap.exists()) {
        // Hors connexion et jamais synchronisée : on attend plutôt que d'annoncer « introuvable ».
        if (snap.metadata.fromCache) return;
        onData(null);
        return;
      }
      onData(parseGame(snap.id, snap.data()));
    },
    onError,
  );
}

export function watchBoards(
  fid: string,
  gid: string,
  onData: (boards: Record<string, BoardDoc>) => void,
  onError: (e: unknown) => void,
): () => void {
  return onSnapshot(
    boardsCol(fid, gid),
    (snap) => {
      const out: Record<string, BoardDoc> = {};
      for (const d of snap.docs) out[d.id] = parseBoard(d.id, d.data());
      onData(out);
    },
    onError,
  );
}

export function watchShots(
  fid: string,
  gid: string,
  onData: (shots: Shot[]) => void,
  onError: (e: unknown) => void,
): () => void {
  return onSnapshot(
    shotsCol(fid, gid),
    (snap) => onData(snap.docs.map((d) => parseShot(d.data())).filter((s): s is Shot => s !== null)),
    onError,
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function newGameData(me: Player, reservedFor: string | null) {
  return {
    createdAt: Date.now(),
    createdBy: me.uid,
    players: [{ uid: me.uid, name: me.name }],
    status: 'waiting',
    seed: Math.random(),
    reservedFor,
    rematchId: null,
    forfeitBy: null,
    winner: null,
  };
}

/** Crée une partie ouverte à toute la famille. Fonctionne hors connexion. Renvoie son identifiant. */
export function createGame(fid: string, me: Player): string {
  const ref = doc(gamesCol(fid));
  run(setDoc(ref, newGameData(me, null)));
  return ref.id;
}

/**
 * Rejoint une partie. Transaction : deux personnes qui appuient en même temps ne peuvent pas
 * être acceptées toutes les deux. Nécessite le réseau (c'est la seule action « attendue »).
 */
export async function joinGame(fid: string, gid: string, me: Player): Promise<void> {
  const { db } = getServices();
  const ref = gameRef(fid, gid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new FamilleError("Cette partie n'existe plus.");
    const g = parseGame(snap.id, snap.data());
    if (isMine(g, me.uid)) return;
    if (g.status !== 'waiting' || g.players.length >= 2) throw new FamilleError('Cette partie a déjà deux joueurs.');
    if (g.reservedFor && g.reservedFor !== me.uid) throw new FamilleError('Cette revanche est réservée à un autre joueur.');
    tx.update(ref, { players: [...g.players, { uid: me.uid, name: me.name }], status: 'playing' });
  });
}

/**
 * Revanche : le premier des deux joueurs qui appuie sur « Rejouer » crée la nouvelle partie,
 * réservée à son adversaire ; le second la rejoint. Renvoie l'identifiant de la revanche.
 */
export async function rematch(fid: string, oldId: string, me: Player): Promise<string> {
  const { db } = getServices();
  const oldRef = gameRef(fid, oldId);
  return runTransaction(db, async (tx) => {
    const oldSnap = await tx.get(oldRef);
    if (!oldSnap.exists()) throw new FamilleError("Cette partie n'existe plus.");
    const old = parseGame(oldSnap.id, oldSnap.data());

    if (old.rematchId) {
      const rRef = gameRef(fid, old.rematchId);
      const rSnap = await tx.get(rRef);
      if (rSnap.exists()) {
        const r = parseGame(rSnap.id, rSnap.data());
        if (isMine(r, me.uid)) return r.id;
        if (r.status === 'waiting' && r.players.length < 2 && (!r.reservedFor || r.reservedFor === me.uid)) {
          tx.update(rRef, { players: [...r.players, { uid: me.uid, name: me.name }], status: 'playing' });
          return r.id;
        }
        throw new FamilleError('La revanche a déjà commencé.');
      }
      // Revanche annulée par l'autre joueur : on en recrée une.
    }

    const opponent = opponentOf(old, me.uid);
    const ref = doc(gamesCol(fid));
    tx.set(ref, newGameData(me, opponent?.uid ?? null));
    tx.update(oldRef, { rematchId: ref.id });
    return ref.id;
  });
}

/** Annule une partie encore en attente d'adversaire (et la flotte déjà placée). */
export function cancelGame(fid: string, gid: string, uid: string): void {
  run(deleteDoc(doc(boardsCol(fid, gid), uid)));
  run(deleteDoc(gameRef(fid, gid)));
}

/** Enregistre ma flotte et me déclare prêt. */
export function saveBoard(fid: string, gid: string, uid: string, ships: readonly Ship[]): void {
  // Copie en objets simples (jamais de proxy Svelte envoyé à Firestore).
  const plain = ships.map((s) => ({ size: s.size, x: s.x, y: s.y, dir: s.dir }));
  run(setDoc(doc(boardsCol(fid, gid), uid), { ships: plain, ready: true }));
}

/** Un document par tir, identifié par son numéro : un tir ne peut pas être compté deux fois. */
export function fire(fid: string, gid: string, n: number, uid: string, x: number, y: number): void {
  run(setDoc(doc(shotsCol(fid, gid), shotId(n)), { n, by: uid, x, y, at: Date.now() }));
}

/** Marque la partie terminée. Idempotent : les deux téléphones peuvent l'écrire. */
export function finishGame(fid: string, gid: string, winner: string): void {
  run(updateDoc(gameRef(fid, gid), { status: 'finished', winner }));
}

export function forfeit(fid: string, gid: string, uid: string, winner: string): void {
  run(updateDoc(gameRef(fid, gid), { status: 'finished', forfeitBy: uid, winner }));
}
