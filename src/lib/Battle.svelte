<script lang="ts">
  import {
    FLEET,
    SHIP_NAMES,
    alreadyShot,
    coordLabel,
    fleetView,
    key,
    markSunk,
    targetView,
    type Battle,
    type ResolvedShot,
    type Ship,
  } from './engine';
  import Grid from './Grid.svelte';

  let {
    battle,
    meUid,
    oppName,
    myShips,
    oppSunk,
    onFire,
  }: {
    battle: Battle;
    meUid: string;
    oppName: string;
    myShips: Ship[];
    /** Uniquement les bateaux adverses DÉJÀ coulés (rien d'autre n'est révélé). */
    oppSunk: Ship[];
    onFire: (x: number, y: number) => void;
  } = $props();

  const myTurn = $derived(battle.turn === meUid);
  const myShots = $derived(battle.shots.filter((s) => s.by === meUid));
  const incoming = $derived(battle.shots.filter((s) => s.by !== meUid));
  const target = $derived(markSunk(targetView(myShots), oppSunk));
  const fleet = $derived(fleetView(myShips, incoming));
  const lastShot = $derived<ResolvedShot | null>(battle.shots.at(-1) ?? null);
  const lastMine = $derived(myShots.at(-1) ?? null);
  const lastTheirs = $derived(incoming.at(-1) ?? null);
  const sunkSizes = $derived(new Set(oppSunk.map((s) => s.size)));
  const mySunk = $derived(
    new Set(myShips.filter((s) => fleet[key(s.x, s.y)] === 'sunk').map((s) => s.size)),
  );

  let selected = $state<number | null>(null);
  let sentFor = $state(-1);

  // Nouveau tour : on oublie la case visée.
  $effect(() => {
    void battle.nextN;
    selected = null;
  });

  function aim(x: number, y: number) {
    if (!myTurn) return;
    selected = key(x, y);
    sentFor = -1; // un tir refusé par le serveur peut être retenté
  }

  function fire() {
    if (!myTurn || selected === null || sentFor === battle.nextN) return;
    sentFor = battle.nextN; // empêche un double envoi avant le retour de l'écoute
    onFire(selected % 10, Math.floor(selected / 10));
  }

  const RESULT: Record<string, string> = { miss: "à l'eau", hit: 'touché !', sunk: 'coulé !' };

  function describe(s: ResolvedShot): string {
    const who = s.by === meUid ? 'Ton tir' : `Tir de ${oppName}`;
    const extra = s.result === 'sunk' && s.size ? ` (${SHIP_NAMES[s.size]})` : '';
    return `${who} en ${coordLabel(s.x, s.y)} : ${RESULT[s.result]}${extra}`;
  }
</script>

<div class="stack">
  {#if battle.nextN === 0}
    <div class="coin" role="status">
      🎲 Tirage au sort : <strong>{myTurn ? 'tu commences' : `${oppName} commence`}</strong> !
    </div>
  {/if}

  <div class="turn" class:mine={myTurn} role="status" aria-live="polite">
    {#if myTurn}🎯 À toi de tirer !{:else}⏳ {oppName} vise…{/if}
  </div>

  {#if lastShot}
    <p class="event {lastShot.result}">{describe(lastShot)}</p>
  {/if}

  <section class="stack tight">
    <h2>Grille adverse</h2>
    <Grid
      cells={target}
      label="Grille de tir"
      onPick={myTurn ? aim : undefined}
      canPick={(x, y) => !alreadyShot(myShots, x, y)}
      {selected}
      last={lastMine ? key(lastMine.x, lastMine.y) : null}
    />
    {#if myTurn}
      <button
        class="fc-btn fc-btn-primary fc-btn-block big-btn"
        type="button"
        disabled={selected === null || sentFor === battle.nextN}
        onclick={fire}
      >
        {selected === null ? 'Touche une case pour viser' : `💥 Feu en ${coordLabel(selected % 10, Math.floor(selected / 10))} !`}
      </button>
    {/if}
    <div class="fleet-status" aria-label="Flotte adverse">
      {#each FLEET as size (size)}
        <span class="chip-ship" class:down={sunkSizes.has(size)}>{SHIP_NAMES[size]} ({size})</span>
      {/each}
    </div>
  </section>

  <section class="stack tight">
    <h2>Ma flotte</h2>
    <Grid cells={fleet} label="Ma flotte" small last={lastTheirs ? key(lastTheirs.x, lastTheirs.y) : null} />
    <div class="fleet-status" aria-label="Ma flotte">
      {#each FLEET as size (size)}
        <span class="chip-ship" class:down={mySunk.has(size)}>{SHIP_NAMES[size]} ({size})</span>
      {/each}
    </div>
  </section>
</div>
