<script lang="ts">
  import { toFrenchMessage } from 'famille-core';
  import { playBattle, sunkShips, type Player, type Ship, type Shot } from './engine';
  import {
    cancelGame,
    finishGame,
    fire,
    forfeit,
    joinGame,
    rematch,
    saveBoard,
    watchBoards,
    watchGame,
    watchShots,
  } from './data';
  import { isMine, opponentOf, type BoardDoc, type GameDoc } from './model';
  import { gameHash } from './nav';
  import { go } from './route';
  import Battle from './Battle.svelte';
  import End from './End.svelte';
  import Grid from './Grid.svelte';
  import Placement from './Placement.svelte';
  import { fleetView } from './engine';

  let { familyId, gameId, me }: { familyId: string; gameId: string; me: Player } = $props();

  // undefined : en cours de chargement ; null : la partie n'existe pas.
  let game = $state.raw<GameDoc | null | undefined>(undefined);
  let boards = $state.raw<Record<string, BoardDoc>>({});
  let shots = $state.raw<Shot[]>([]);
  let loadError = $state('');
  let rematchGame = $state.raw<GameDoc | null>(null);

  $effect(() => {
    const stops = [
      watchGame(familyId, gameId, (g) => (game = g), (e) => (loadError = toFrenchMessage(e))),
      watchBoards(familyId, gameId, (b) => (boards = b), (e) => (loadError = toFrenchMessage(e))),
      watchShots(familyId, gameId, (s) => (shots = s), (e) => (loadError = toFrenchMessage(e))),
    ];
    return () => stops.forEach((stop) => stop());
  });

  // La revanche éventuelle est écoutée pour savoir si l'adversaire l'a déjà proposée.
  const rematchId = $derived(game?.rematchId ?? null);
  $effect(() => {
    rematchGame = null;
    if (!rematchId) return;
    return watchGame(familyId, rematchId, (g) => (rematchGame = g), () => {});
  });

  const mine = $derived(game ? isMine(game, me.uid) : false);
  const opp = $derived(game ? opponentOf(game, me.uid) : null);
  const myBoard = $derived(boards[me.uid] ?? null);
  const oppBoard = $derived(opp ? (boards[opp.uid] ?? null) : null);
  const bothReady = $derived(!!myBoard?.ready && !!oppBoard?.ready);

  const battle = $derived(
    game && game.players.length === 2 && bothReady && myBoard && oppBoard
      ? playBattle(game.players, game.seed, { [me.uid]: myBoard.ships, [oppBoard.uid]: oppBoard.ships }, shots)
      : null,
  );
  const winner = $derived(game?.winner ?? battle?.winner ?? null);
  const finished = $derived(game?.status === 'finished' || !!battle?.winner);

  // Les deux téléphones peuvent constater la fin : l'écriture est idempotente.
  $effect(() => {
    if (game && battle?.winner && game.status !== 'finished') finishGame(familyId, game.id, battle.winner);
  });

  const oppSunk = $derived(
    battle && oppBoard ? sunkShips(oppBoard.ships, battle.shots.filter((s) => s.by === me.uid)) : [],
  );

  function ready(ships: Ship[]) {
    saveBoard(familyId, gameId, me.uid, ships);
  }

  function shoot(x: number, y: number) {
    if (!battle || battle.turn !== me.uid) return;
    fire(familyId, gameId, battle.nextN, me.uid, x, y);
  }

  // Abandon / annulation en deux temps (pas de boîte de dialogue du navigateur).
  let confirmQuit = $state(false);
  function quit() {
    if (!game) return;
    if (!confirmQuit) {
      confirmQuit = true;
      return;
    }
    if (game.status === 'waiting' || !opp) {
      cancelGame(familyId, game.id, me.uid);
      go('#/');
    } else {
      forfeit(familyId, game.id, me.uid, opp.uid);
    }
    confirmQuit = false;
  }

  let busy = $state(false);
  let actionError = $state('');
  const offlineMsg = 'Il faut être connecté à Internet pour rejoindre une partie.';

  async function joinHere() {
    if (busy || !game) return;
    busy = true;
    actionError = '';
    try {
      await joinGame(familyId, game.id, me);
    } catch (e) {
      actionError = navigator.onLine ? toFrenchMessage(e) : offlineMsg;
    } finally {
      busy = false;
    }
  }

  async function playAgain() {
    if (busy || !game) return;
    if (rematchGame && isMine(rematchGame, me.uid)) {
      go(gameHash(rematchGame.id));
      return;
    }
    busy = true;
    actionError = '';
    try {
      go(gameHash(await rematch(familyId, game.id, me)));
    } catch (e) {
      actionError = navigator.onLine ? toFrenchMessage(e) : offlineMsg;
    } finally {
      busy = false;
    }
  }

  const rematchByOpp = $derived(!!rematchGame && !isMine(rematchGame, me.uid) && rematchGame.status === 'waiting');
  const rematchLabel = $derived(
    rematchGame && isMine(rematchGame, me.uid) ? '▶ Ouvrir la revanche' : rematchByOpp ? '⚔️ Accepter la revanche' : '🔁 Rejouer',
  );
  const rematchNote = $derived(
    rematchByOpp
      ? `${opp?.name ?? 'Ton adversaire'} te propose une revanche !`
      : rematchGame && isMine(rematchGame, me.uid) && rematchGame.status === 'waiting'
        ? `Revanche proposée à ${opp?.name ?? 'ton adversaire'}.`
        : '',
  );
</script>

<div class="stack">
  <header class="row">
    <a class="fc-btn icon-btn" href="#/" aria-label="Retour au menu">←</a>
    <h1 class="grow">{opp ? `contre ${opp.name}` : 'Bataille 2'}</h1>
  </header>

  {#if loadError}
    <p class="fc-error" role="alert">Impossible de charger la partie. {loadError}</p>
  {:else if game === undefined}
    <p class="fc-muted center">Chargement de la partie…</p>
  {:else if game === null}
    <div class="fc-card center stack">
      <div style="font-size: 2.4rem">🏝️</div>
      <p style="margin: 0">Cette partie n'existe plus.</p>
      <a class="fc-btn fc-btn-primary fc-btn-block" href="#/">Retour au menu</a>
    </div>
  {:else if !mine}
    <div class="fc-card center stack">
      {#if game.status === 'waiting' && (!game.reservedFor || game.reservedFor === me.uid)}
        <p style="margin: 0"><strong>{game.players[0]?.name}</strong> attend un adversaire.</p>
        {#if actionError}<p class="fc-error" role="alert">{actionError}</p>{/if}
        <button class="fc-btn fc-btn-primary fc-btn-block" type="button" disabled={busy} onclick={joinHere}>
          {busy ? '…' : 'Rejoindre cette partie'}
        </button>
      {:else}
        <p style="margin: 0">Cette partie a déjà deux joueurs.</p>
      {/if}
      <a class="fc-btn fc-btn-block" href="#/">Retour au menu</a>
    </div>
  {:else if finished}
    <End
      won={winner === me.uid}
      forfeit={game.forfeitBy ? (game.forfeitBy === me.uid ? 'me' : 'them') : null}
      oppName={opp?.name ?? 'Ton adversaire'}
      {battle}
      meUid={me.uid}
      myShips={myBoard?.ships ?? []}
      oppShips={oppBoard?.ships ?? []}
      {rematchLabel}
      {rematchNote}
      {busy}
      error={actionError}
      onRematch={playAgain}
    />
  {:else}
    {#if !opp}
      <div class="waiting" role="status">
        ⏳ En attente d'un adversaire… Quelqu'un de la famille peut te rejoindre depuis « Rejoindre une partie ».
      </div>
    {/if}

    {#if !myBoard?.ready}
      {#if opp}
        <p class="fc-muted" style="margin: 0">
          {oppBoard?.ready ? `✅ ${opp.name} est prêt.` : `${opp.name} place sa flotte…`}
        </p>
      {/if}
      <Placement onReady={ready} />
    {:else if battle}
      <Battle {battle} meUid={me.uid} oppName={opp?.name ?? ''} myShips={myBoard.ships} {oppSunk} onFire={shoot} />
    {:else}
      <div class="turn" role="status">
        {opp ? `⏳ En attente que ${opp.name} place sa flotte…` : '⚓ Ta flotte est prête.'}
      </div>
      <Grid cells={fleetView(myBoard.ships, [])} label="Ma flotte" small />
    {/if}

    <button class="fc-btn fc-btn-danger fc-btn-block" type="button" onclick={quit}>
      {#if confirmQuit}
        {opp ? 'Confirmer l’abandon (défaite)' : 'Confirmer l’annulation'}
      {:else}
        {opp ? '🏳️ Abandonner' : 'Annuler la partie'}
      {/if}
    </button>
    {#if confirmQuit}
      <button class="fc-btn fc-btn-block" type="button" onclick={() => (confirmQuit = false)}>Continuer à jouer</button>
    {/if}
  {/if}
</div>
