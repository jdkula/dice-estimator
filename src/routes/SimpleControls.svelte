<script lang="ts">
  	let nattacks = 1;
	let modattack = 0;

	let n = 1;
	let s = 6;
	let mod = 0;

	let type: 'normal' | 'advantage' | 'disadvantage' = 'normal';

</script>

<div>
  <label>
    <span>Number of attacks:</span>
    <input
      value={nattacks}
      on:change={(e) => e.target.value !== '' && (nattacks = parseInt(e.target.value))}
      type="number"
    />
  </label>
</div>
<div>
  <label>
    <span>Modifier to attack:</span>
    <input
      value={modattack}
      on:change={(e) => e.target.value !== '' && (modattack = parseInt(e.target.value))}
      type="number"
    />
  </label>
</div>
<div>
  <label>
    <span>Per attack: number of dice:</span>
    <input
      value={n}
      on:change={(e) => e.target.value !== '' && (n = parseInt(e.target.value))}
      type="number"
    />
  </label>
</div>
<div>
  <label>
    <span>Per attack: number of sides:</span>
    <input
      value={s}
      on:change={(e) => e.target.value !== '' && (s = parseInt(e.target.value))}
      type="number"
    />
  </label>
</div>
<div>
  <label>
    <span>Per attack: modifier:</span>
    <input
      value={mod}
      on:change={(e) => e.target.value !== '' && (mod = parseInt(e.target.value))}
      type="number"
    />
  </label>
</div>
<div>
  <span> Roll type: </span>

  <label>
    <input type="radio" bind:group={type} value="normal" />
    <span>Normal</span>
  </label>
  <label>
    <input type="radio" bind:group={type} value="advantage" />
    <span>Advantage</span>
  </label>
  <label>
    <input type="radio" bind:group={type} value="disadvantage" />
    <span>Disadvantage</span>
  </label>
</div>