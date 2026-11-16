// @vitest-environment jsdom
// Parcours complet à travers l'interface, avec DEUX « téléphones » (Alice et Bob) affichés
// en même temps et branchés sur le même faux Firestore.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('firebase/firestore', () => import('./fakeFirestore'));
vi.mock('famille-core', () => import('./fakeCore'));

import { dump, resetStore } from './fakeFirestore';
import { watchLobby } from '../src/lib/data';
import { coordLabel, shipCells, type Ship } from '../src/lib/engine';
import type { GameDoc } from '../src/lib/model';
import Game from '../src/lib/Game.svelte';
import Home from '../src/lib/Home.svelte';
import Join from '../src/lib/Join.svelte';

const F = 'fam1';
const alice = { uid: 'a', name: 'Alice' };
const bob = { uid: 'b', name: 'Bob' };

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 2));
    flushSync();
  }
};
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');
const btn = (el: HTMLElement, label: string) => {
  const b = Array.from(el.querySelectorAll<HTMLElement>('button, a')).find((x) => text(x).includes(label));
  if (!b) throw new Error(`Bouton « ${label} » introuvable.\n--- écran ---\n${text(el)}`);
  return b;
};
const click = async (el: HTMLElement) => {
  el.click();
  await settle();
};
const cell = (el: HTMLElement, grid: string, x: number, y: number) => {
  const c = el.querySelector<HTMLElement>(`[aria-label="${grid}"] [aria-label^="${coordLabel(x, y)} :"]`);
  if (!c) throw new Error(`Case ${coordLabel(x, y)} introuvable dans « ${grid} »`);
  return c;
};
function screen() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  resetStore();
  document.body.innerHTML = '';
  location.hash = '';
});

describe('deux joueurs, deux téléphones', () => {
  test('créer, rejoindre, placer, tirer chacun son tour, victoire / défaite, revanche', async () => {
    let lobby: GameDoc[] = [];
    watchLobby(F, (g) => (lobby = g), () => {});

    // --- Alice crée une partie depuis le menu
    const homeA = screen();
    const h = mount(Home, { target: homeA, props: { familyId: F, me: alice, games: [], loaded: true, error: false } });
    await click(btn(homeA, 'Créer une partie'));
    const gid = location.hash.replace('#/partie/', '');
    expect(gid).toBeTruthy();
    unmount(h);
    await settle();
    expect(lobby).toHaveLength(1);

    // --- Bob voit la partie dans « Rejoindre » et la rejoint
    const joinB = screen();
    const j = mount(Join, { target: joinB, props: { familyId: F, me: bob, games: lobby, loaded: true, error: false } });
    expect(text(joinB)).toContain('Alice');
    await click(btn(joinB, 'Rejoindre'));
    await settle();
    expect(location.hash).toBe(`#/partie/${gid}`);
    unmount(j);

    // --- Les deux écrans de jeu
    const A = screen();
    const B = screen();
    const ga = mount(Game, { target: A, props: { familyId: F, gameId: gid, me: alice } });
    const gb = mount(Game, { target: B, props: { familyId: F, gameId: gid, me: bob } });
    await settle();
    expect(text(A)).toContain('contre Bob');
    expect(text(B)).toContain('contre Alice');

    // Alice place au hasard et se déclare prête
    expect((btn(A, 'Prêt') as HTMLButtonElement).disabled).toBe(true);
    await click(btn(A, 'Au hasard'));
    expect((btn(A, 'Prêt') as HTMLButtonElement).disabled).toBe(false);
    await click(btn(A, 'Prêt'));
    expect(text(A)).toContain('En attente que Bob place sa flotte');
    expect(text(B)).toContain('Alice est prêt');

    // Bob place à la main : 5, 4, 3, 2 cases à l'horizontale, lignes 1, 3, 5, 7.
    // Le bateau de 5 posé trop à droite est décalé pour tenir dans la grille.
    await click(cell(B, 'Ma grille de placement', 8, 0));
    await click(cell(B, 'Ma grille de placement', 0, 2));
    await click(cell(B, 'Ma grille de placement', 0, 4));
    // Case occupée : on reprend le bateau, puis on le repose
    await click(cell(B, 'Ma grille de placement', 0, 4));
    expect(text(B)).toContain('Sous-marin repris');
    await click(cell(B, 'Ma grille de placement', 0, 4));
    await click(cell(B, 'Ma grille de placement', 0, 6));
    await click(btn(B, 'Prêt'));
    await settle();

    const bobShips = (dump()[`families/${F}/apps/bataille2bato/games/${gid}/boards/b`] as { ships: Ship[] }).ships;
    expect(bobShips[0]).toEqual({ size: 5, x: 5, y: 0, dir: 'h' });
    const aliceShips = (dump()[`families/${F}/apps/bataille2bato/games/${gid}/boards/a`] as { ships: Ship[] }).ships;

    // Combat : tirage au sort affiché, un seul des deux a la main
    expect(text(A)).toContain('Tirage au sort');
    const aFirst = text(A).includes('À toi de tirer');
    expect(text(B).includes('À toi de tirer')).toBe(!aFirst);
    // La grille de tir ne montre jamais les bateaux adverses
    expect(A.querySelectorAll('[aria-label="Grille de tir"] .ship')).toHaveLength(0);
    expect(B.querySelectorAll('[aria-label="Grille de tir"] .ship')).toHaveLength(0);

    const aTargets = bobShips.flatMap(shipCells);
    const occupied = new Set(aliceShips.flatMap(shipCells).map(([x, y]) => y * 10 + x));
    const bTargets = Array.from({ length: 100 }, (_, k) => k).filter((k) => !occupied.has(k));

    let turns = 0;
    while (!text(A).includes('Victoire') && turns < 200) {
      const aTurn = text(A).includes('À toi de tirer');
      const el = aTurn ? A : B;
      const other = aTurn ? B : A;
      const [x, y] = aTurn ? aTargets.shift()! : ((k) => [k % 10, Math.floor(k / 10)])(bTargets.shift()!);
      await click(cell(el, 'Grille de tir', x, y));
      expect(text(el)).toContain(`Feu en ${coordLabel(x, y)}`);
      await click(btn(el, 'Feu en'));
      // Après le tir, la main passe à l'autre
      if (!text(A).includes('Victoire')) {
        expect(text(el)).toContain('vise…');
        expect(text(other)).toContain('À toi de tirer');
      }
      if (aTurn && turns === 0) expect(text(A)).toMatch(/Ton tir en .+ : touché/);
      turns++;
    }

    expect(text(A)).toContain('Victoire');
    expect(text(A)).toContain('Tu as coulé toute la flotte de Bob');
    expect(text(B)).toContain('Défaite');
    expect(text(A)).toContain('14 tirs · 14 touchés · 100 % de réussite');
    expect((dump()[`families/${F}/apps/bataille2bato/games/${gid}`] as { status: string }).status).toBe('finished');

    // Revanche : Bob propose, Alice voit la proposition et l'accepte
    await click(btn(B, 'Rejouer'));
    await settle();
    const rid = location.hash.replace('#/partie/', '');
    expect(rid).not.toBe(gid);
    expect(text(A)).toContain('Bob te propose une revanche');
    location.hash = '';
    await click(btn(A, 'Accepter la revanche'));
    await settle();
    expect(location.hash).toBe(`#/partie/${rid}`);
    const r = dump()[`families/${F}/apps/bataille2bato/games/${rid}`] as { players: { uid: string }[] };
    expect(r.players.map((p) => p.uid)).toEqual(['b', 'a']);

    unmount(ga);
    unmount(gb);
  });

  test('abandon en deux temps : défaite pour celui qui abandonne, victoire pour l’autre', async () => {
    const homeA = screen();
    const h = mount(Home, { target: homeA, props: { familyId: F, me: alice, games: [], loaded: true, error: false } });
    await click(btn(homeA, 'Créer une partie'));
    const gid = location.hash.replace('#/partie/', '');
    unmount(h);
    const { joinGame } = await import('../src/lib/data');
    await joinGame(F, gid, bob);

    const A = screen();
    const B = screen();
    mount(Game, { target: A, props: { familyId: F, gameId: gid, me: alice } });
    mount(Game, { target: B, props: { familyId: F, gameId: gid, me: bob } });
    await settle();

    await click(btn(B, 'Abandonner'));
    expect(text(B)).toContain('Confirmer l’abandon');
    await click(btn(B, 'Continuer à jouer'));
    expect(text(B)).not.toContain('Confirmer');
    await click(btn(B, 'Abandonner'));
    await click(btn(B, 'Confirmer l’abandon'));
    await settle();
    expect(text(B)).toContain('Défaite');
    expect(text(B)).toContain('Tu as abandonné');
    expect(text(A)).toContain('Victoire');
    expect(text(A)).toContain('Bob a abandonné');
  });

  test('partie complète ouverte par un troisième membre, et partie supprimée', async () => {
    const homeA = screen();
    const h = mount(Home, { target: homeA, props: { familyId: F, me: alice, games: [], loaded: true, error: false } });
    await click(btn(homeA, 'Créer une partie'));
    const gid = location.hash.replace('#/partie/', '');
    unmount(h);

    // Avant l'arrivée de Bob, Carl qui ouvre le lien peut rejoindre
    const C = screen();
    const gc = mount(Game, { target: C, props: { familyId: F, gameId: gid, me: { uid: 'c', name: 'Carl' } } });
    await settle();
    expect(text(C)).toContain('Alice attend un adversaire');
    const { joinGame } = await import('../src/lib/data');
    await joinGame(F, gid, bob);
    await settle();
    expect(text(C)).toContain('déjà deux joueurs');
    unmount(gc);

    const D = screen();
    mount(Game, { target: D, props: { familyId: F, gameId: 'inexistante', me: alice } });
    await settle();
    expect(text(D)).toContain("n'existe plus");
  });
});
