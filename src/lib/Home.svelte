<script lang="ts">
  import type { Player } from './engine';
  import { createGame } from './data';
  import { ago, joinable, myOngoing, opponentOf, type GameDoc } from './model';
  import { gameHash } from './nav';
  import { go } from './route';

  let {
    familyId,
    me,
    games,
    loaded,
    error,
  }: { familyId: string; me: Player; games: GameDoc[]; loaded: boolean; error: boolean } = $props();

  const now = new Date();
  const mine = $derived(myOngoing(games, me.uid));
  const available = $derived(joinable(games, me.uid, now));
  const invites = $derived(available.filter((g) => g.reservedFor === me.uid));

  function create() {
    go(gameHash(createGame(familyId, me)));
  }
</script>

<div class="stack">
  <header class="row">
    <a class="fc-btn icon-btn" href="/" aria-label="Retour au portail">←</a>
    <h1>🚢 Bataille 2</h1>
  </header>

  <div class="hero">
    <div class="hero-waves" aria-hidden="true">🌊 ⚓ 🌊</div>
    <p>Bataille navale !</p>
  </div>

  <button class="fc-btn fc-btn-primary fc-btn-block" type="button" onclick={create}>➕ Créer une partie</button>
  <a class="fc-btn fc-btn-block" href="#/rejoindre">
    🧭 Rejoindre une partie
    {#if loaded && available.length > 0}<span class="count">{available.length}</span>{/if}
  </a>

  {#each invites as g (g.id)}
    <a class="fc-card invite" href="#/rejoindre">
      ⚔️ <strong>{g.players[0]?.name}</strong> te propose une revanche
    </a>
  {/each}

  {#if error}
    <p class="fc-error">Impossible de charger les parties. Vérifiez votre connexion.</p>
  {:else if !loaded}
    <p class="fc-muted center">Chargement des parties…</p>
  {:else if mine.length > 0}
    <section class="fc-card stack">
      <h2>Mes parties en cours</h2>
      {#each mine as g (g.id)}
        {@const opp = opponentOf(g, me.uid)}
        <a class="fc-btn fc-btn-block pick" href={gameHash(g.id)}>
          <span class="grow">
            {#if opp}contre <strong>{opp.name}</strong>{:else}En attente d'un adversaire{/if}
            <small class="fc-muted"> · {ago(g.createdAt, now)}</small>
          </span>
          <span aria-hidden="true">▶</span>
        </a>
      {/each}
    </section>
  {/if}

  <details class="fc-card">
    <summary>Rappel des règles</summary>
    <div class="stack" style="margin-top: 0.5rem">
      <p style="margin: 0">Chaque joueur place en secret ses 4 bateaux (5, 4, 3 et 2 cases) sur sa grille, à l'horizontale ou à la verticale. Les bateaux peuvent se toucher mais pas se chevaucher.</p>
      <p style="margin: 0">Quand les deux joueurs sont prêts, un tirage au sort désigne qui commence. On tire <strong>chacun son tour, un tir par tour</strong>, qu'il touche ou non.</p>
      <p style="margin: 0">Un bateau est <strong>coulé</strong> quand toutes ses cases sont touchées. Le premier qui coule toute la flotte adverse gagne.</p>
    </div>
  </details>
</div>
