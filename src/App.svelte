<script lang="ts">
  import { session } from 'famille-core';
  import { go, route } from './lib/route';
  import { watchLobby } from './lib/data';
  import type { GameDoc } from './lib/model';
  import Game from './lib/Game.svelte';
  import Gate from './lib/Gate.svelte';
  import Home from './lib/Home.svelte';
  import Join from './lib/Join.svelte';
  import Toast from './lib/Toast.svelte';
  import UpdateBanner from './lib/UpdateBanner.svelte';

  // Les parties non terminées de la famille sont écoutées une seule fois pour tout le menu,
  // et réécoutées quand la famille active change (choix fait dans le portail).
  const familyId = $derived($session.status === 'ready' ? $session.familyId : null);
  let lobby = $state.raw<GameDoc[]>([]);
  let lobbyLoaded = $state(false);
  let lobbyError = $state(false);
  let previousFamily: string | null = null;

  $effect(() => {
    if (!familyId) return;
    // Changement de famille pendant une partie : la partie appartient à l'ancienne famille.
    if (previousFamily && previousFamily !== familyId) go('#/');
    previousFamily = familyId;
    lobby = [];
    lobbyLoaded = false;
    lobbyError = false;
    return watchLobby(
      familyId,
      (g) => {
        lobby = g;
        lobbyLoaded = true;
        lobbyError = false;
      },
      () => {
        lobbyLoaded = true;
        lobbyError = true;
      },
    );
  });
</script>

<UpdateBanner />
<Toast />

{#if $session.status === 'loading'}
  <div class="center-screen">
    <div style="font-size: 3rem">🚢</div>
    <p class="fc-muted">Chargement…</p>
  </div>
{:else if $session.status === 'signedOut'}
  <Gate status="signedOut" />
{:else if $session.status === 'noFamily'}
  <Gate status="noFamily" />
{:else if $session.status === 'ready'}
  {@const me = { uid: $session.user.uid, name: $session.displayName || 'Joueur' }}
  {#if $route.name === 'join'}
    <Join familyId={$session.familyId} {me} games={lobby} loaded={lobbyLoaded} error={lobbyError} />
  {:else if $route.name === 'game'}
    {#key `${$session.familyId}/${$route.id}`}
      <Game familyId={$session.familyId} gameId={$route.id} {me} />
    {/key}
  {:else}
    <Home familyId={$session.familyId} {me} games={lobby} loaded={lobbyLoaded} error={lobbyError} />
  {/if}
{/if}
