<script lang="ts">
  export let type: 'number' | 'text';
  export let value: any;
  export let placeholder: string = '';

	let valueStr = value;
  let input: HTMLInputElement;

  function onChange(e: Event) {
    if (!(e.target instanceof HTMLInputElement)) return;

    if (type === 'number') {
      value = e.target.value ? e.target.valueAsNumber : undefined;
    } else {
      value = e.target.value;
    }
		valueStr = e.target.value;
  }
</script>

<div
  class="my-2 rounded-xl bg-gray-100 border border-gray-300 overflow-hidden focus-within:border-gray-500"
  on:click={() => input?.focus()}
  on:keypress|self={() => input?.focus()}
>
  <label>
    <span class="text-xs text-gray-600 px-4 pt-1 absolute"><slot /></span>
    <input
      bind:this={input}
      class="bg-transparent px-4 pt-5 pb-2 w-full focus:outline-none placeholder:text-gray-400"
      {type}
      value={valueStr}
      {placeholder}
      on:input={onChange}
    />
  </label>
</div>
