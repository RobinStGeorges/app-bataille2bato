<script lang="ts">
  import { FLEET, SHIP_NAMES, SIZE, fits, fleetError, fleetView, randomFleet, shipAt, type Dir, type Ship } from './engine';
  import Grid from './Grid.svelte';

  let { onReady }: { onReady: (ships: Ship[]) => void } = $props();

  // $state.raw : les bateaux sont remplacés en bloc et passés tels quels aux fonctions pures.
  let ships = $state.raw<Ship[]>([]);
  let selected = $state<number | null>(FLEET[0]);
  let dir = $state<Dir>('h');
  let hint = $state('');

  const placedSizes = $derived(new Set(ships.map((s) => s.size)));
  const cells = $derived(fleetView(ships, []));
  const error = $derived(fleetError(ships));

  function nextUnplaced(list: Ship[]): number | null {
    const placed = new Set(list.map((s) => s.size));
    return FLEET.find((s) => !placed.has(s)) ?? null;
  }

  function pick(x: number, y: number) {
    hint = '';
    const i = shipAt(ships, x, y);
    if (i >= 0) {
      // Reprendre un bateau déjà posé pour le déplacer ou le pivoter.
      const s = ships[i];
      ships = ships.filter((_, j) => j !== i);
      selected = s.size;
      dir = s.dir;
      hint = `${SHIP_NAMES[s.size]} repris : touche une case pour le reposer.`;
      return;
    }
    if (selected === null) {
      hint = 'Choisis d’abord un bateau ci-dessous.';
      return;
    }
    // Si le bateau dépasse du bord, on le décale pour qu'il tienne (plus simple au doigt).
    const size = selected;
    const cx = dir === 'h' ? Math.min(x, SIZE - size) : x;
    const cy = dir === 'v' ? Math.min(y, SIZE - size) : y;
    const ship: Ship = { size, x: cx, y: cy, dir };
    if (!fits(ship, ships)) {
      hint = 'Pas assez de place ici : un autre bateau gêne.';
      return;
    }
    ships = [...ships, ship];
    selected = nextUnplaced(ships);
  }

  function choose(size: number) {
    hint = '';
    if (placedSizes.has(size)) {
      ships = ships.filter((s) => s.size !== size);
    }
    selected = size;
  }

  function rotate() {
    dir = dir === 'h' ? 'v' : 'h';
  }

  function shuffle() {
    hint = '';
    ships = randomFleet();
    selected = null;
  }

  function clear() {
    hint = '';
    ships = [];
    selected = FLEET[0];
  }
</script>

<div class="stack">
  <p class="instructions">
    {#if selected !== null}
      Touche la grille pour placer ton <strong>{SHIP_NAMES[selected]} ({selected} cases)</strong>,
      {dir === 'h' ? 'à l’horizontale' : 'à la verticale'}.
    {:else if !error}
      Flotte prête ! Touche un bateau pour le déplacer, ou appuie sur « Prêt ».
    {:else}
      Choisis un bateau ci-dessous.
    {/if}
  </p>

  <Grid {cells} label="Ma grille de placement" onPick={pick} />

  {#if hint}<p class="hint" role="status">{hint}</p>{/if}

  <div class="dock" role="group" aria-label="Bateaux à placer">
    {#each FLEET as size (size)}
      <button
        type="button"
        class="dock-ship"
        class:on={selected === size}
        class:placed={placedSizes.has(size)}
        aria-pressed={selected === size}
        onclick={() => choose(size)}
      >
        <span class="hull" style="--n: {size}" aria-hidden="true">
          {#each Array(size) as _, i (i)}<i></i>{/each}
        </span>
        <small>{SHIP_NAMES[size]}{placedSizes.has(size) ? ' ✓' : ''}</small>
      </button>
    {/each}
  </div>

  <div class="row">
    <button class="fc-btn grow" type="button" onclick={rotate}>
      ↻ {dir === 'h' ? 'Horizontal' : 'Vertical'}
    </button>
    <button class="fc-btn grow" type="button" onclick={shuffle}>🎲 Au hasard</button>
    <button class="fc-btn icon-btn" type="button" onclick={clear} aria-label="Tout retirer">🗑️</button>
  </div>

  <button class="fc-btn fc-btn-primary fc-btn-block big-btn" type="button" disabled={error !== null} onclick={() => onReady(ships)}>
    ⚓ Prêt !
  </button>
</div>
