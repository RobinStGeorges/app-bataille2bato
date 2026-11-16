<script lang="ts">
  import { SIZE, coordLabel, key, type CellView } from './engine';

  let {
    cells,
    label,
    onPick,
    selected = null,
    last = null,
    small = false,
    canPick = () => true,
  }: {
    cells: CellView[];
    label: string;
    onPick?: (x: number, y: number) => void;
    selected?: number | null;
    last?: number | null;
    small?: boolean;
    canPick?: (x: number, y: number) => boolean;
  } = $props();

  const idx = Array.from({ length: SIZE }, (_, i) => i);
  const LETTERS = idx.map((i) => String.fromCharCode(65 + i));
  const NAMES: Record<CellView, string> = {
    water: 'eau',
    ship: 'bateau',
    miss: "à l'eau",
    hit: 'touché',
    sunk: 'coulé',
  };
</script>

<div class="grid-wrap" class:small role="grid" aria-label={label}>
  <div class="sea-grid">
    <span class="axis"></span>
    {#each LETTERS as l (l)}<span class="axis">{l}</span>{/each}
    {#each idx as y (y)}
      <span class="axis">{y + 1}</span>
      {#each idx as x (x)}
        {@const k = key(x, y)}
        {@const v = cells[k]}
        {#if onPick && canPick(x, y)}
          <button
            type="button"
            class="cell {v}"
            class:selected={selected === k}
            class:last={last === k}
            aria-label="{coordLabel(x, y)} : {NAMES[v]}"
            onclick={() => onPick(x, y)}
          ></button>
        {:else}
          <span class="cell {v}" class:selected={selected === k} class:last={last === k} aria-label="{coordLabel(x, y)} : {NAMES[v]}"></span>
        {/if}
      {/each}
    {/each}
  </div>
</div>
