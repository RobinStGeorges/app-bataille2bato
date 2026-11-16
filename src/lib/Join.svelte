<script lang="ts">
  import { toFrenchMessage } from 'famille-core';
  import type { Player } from './engine';
  import { joinGame } from './data';
  import { ago, joinable, type GameDoc } from './model';
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
  const available = $derived(joinable(games, me.uid, now));
  let busy = $state<string | null>(null);
  let joinError = $state('');

  async function join(g: GameDoc) {
    if (busy) return;
    busy = g.id;
    joinError = '';
    try {
      await joinGame(familyId, g.id, me);
      go(gameHash(g.id));
    } catch (e) {
      joinError = navigator.onLine ? toFrenchMessage(e) : 'Il faut être connecté à Internet pour rejoindre une partie.';
    } finally {
      busy = null;
    }
  }
</script>

<div class="stack">
  <header class="row">
    <a class="fc-btn icon-btn" href="#/" aria-label="Retour au menu">←</a>
    <h1>Rejoindre une partie</h1>
  </header>

  {#if joinError}<p class="fc-error" role="alert">{joinError}</p>{/if}

  {#if error}
    <p class="fc-error">Impossible de charger les parties. Vérifiez votre connexion.</p>
  {:else if !loaded}
    <p class="fc-muted center">Chargement des parties…</p>
  {:else if available.length === 0}
    <div class="fc-card center stack">
      <div style="font-size: 2.4rem">🏝️</div>
      <p style="margin: 0">Aucune partie disponible pour l'instant.</p>
      <p class="fc-muted" style="margin: 0">Demande à quelqu'un de la famille d'en créer une, ou crée la tienne.</p>
      <a class="fc-btn fc-btn-primary fc-btn-block" href="#/">Retour au menu</a>
    </div>
  {:else}
    {#each available as g (g.id)}
      <div class="fc-card row">
        <div class="grow">
          <strong>{g.players[0]?.name ?? 'Joueur'}</strong>
          <div class="fc-muted small">
            {g.reservedFor ? 'te propose une revanche' : 'attend un adversaire'} · {ago(g.createdAt, now)}
          </div>
        </div>
        <button class="fc-btn fc-btn-primary" type="button" disabled={busy !== null} onclick={() => join(g)}>
          {busy === g.id ? '…' : 'Rejoindre'}
        </button>
      </div>
    {/each}
  {/if}
</div>
