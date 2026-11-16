<script lang="ts">
  import { fleetView, markSunk, sunkShips, targetView, type Battle, type Ship } from './engine';
  import Grid from './Grid.svelte';

  let {
    won,
    forfeit,
    oppName,
    battle,
    meUid,
    myShips,
    oppShips,
    rematchLabel,
    rematchNote,
    busy,
    error,
    onRematch,
  }: {
    won: boolean;
    /** 'me' : j'ai abandonné ; 'them' : l'adversaire a abandonné ; null : fin normale. */
    forfeit: 'me' | 'them' | null;
    oppName: string;
    battle: Battle | null;
    meUid: string;
    myShips: Ship[];
    oppShips: Ship[];
    rematchLabel: string;
    rematchNote: string;
    busy: boolean;
    error: string;
    onRematch: () => void;
  } = $props();

  const shots = $derived(battle?.shots ?? []);
  const myShots = $derived(shots.filter((s) => s.by === meUid));
  const hits = $derived(myShots.filter((s) => s.result !== 'miss').length);
  const accuracy = $derived(myShots.length ? Math.round((hits / myShots.length) * 100) : 0);
  // La partie est finie : on peut dévoiler toute la flotte adverse.
  const reveal = $derived.by(() => {
    const ships = fleetView(oppShips, []);
    return markSunk(targetView(myShots), sunkShips(oppShips, myShots)).map((v, i) =>
      v === 'water' && ships[i] === 'ship' ? 'ship' : v,
    );
  });
  const mine = $derived(fleetView(myShips, shots.filter((s) => s.by !== meUid)));
</script>

<div class="stack">
  <div class="result {won ? 'win' : 'lose'}" role="status">
    <div class="result-icon" aria-hidden="true">{won ? '🏆' : '🌊'}</div>
    <div class="result-title">{won ? 'Victoire !' : 'Défaite…'}</div>
    <p>
      {#if forfeit === 'them'}{oppName} a abandonné la partie.
      {:else if forfeit === 'me'}Tu as abandonné la partie.
      {:else if won}Tu as coulé toute la flotte de {oppName} !
      {:else}{oppName} a coulé toute ta flotte.{/if}
    </p>
  </div>

  {#if myShots.length > 0}
    <p class="center fc-muted" style="margin: 0">
      {myShots.length} tirs · {hits} touchés · {accuracy} % de réussite
    </p>
  {/if}

  {#if rematchNote}<p class="invite-note center">{rematchNote}</p>{/if}
  {#if error}<p class="fc-error center" role="alert">{error}</p>{/if}

  <button class="fc-btn fc-btn-primary fc-btn-block big-btn" type="button" disabled={busy} onclick={onRematch}>
    {busy ? '…' : rematchLabel}
  </button>
  <a class="fc-btn fc-btn-block" href="#/">Retour au menu</a>

  {#if oppShips.length > 0}
    <details class="fc-card">
      <summary>Voir les grilles</summary>
      <div class="stack" style="margin-top: 0.5rem">
        <h2>Flotte de {oppName}</h2>
        <Grid cells={reveal} label="Flotte adverse dévoilée" small />
        <h2>Ma flotte</h2>
        <Grid cells={mine} label="Ma flotte" small />
      </div>
    </details>
  {/if}
</div>
