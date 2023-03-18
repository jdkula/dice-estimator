<script lang="ts" context="module">
  export const kHistogramMargins = 50;
</script>

<script lang="ts">
  export let buckets: [number, number][];
  export let color = '#69b3a2';
  export let yticks = 10;

  export let width: number;
  export let height: number;

  export let xlabel: string;
  export let ylabel: string;

  $: bounds = buckets.reduce(
    (prev, [bucket, obs]) => ({
      xMin: Math.min(prev.xMin, bucket),
      xMax: Math.max(prev.xMax, bucket),
      yMin: Math.min(prev.yMin, obs),
      yMax: Math.max(prev.yMax, obs)
    }),
    {
      xMin: Number.POSITIVE_INFINITY,
      xMax: Number.NEGATIVE_INFINITY,
      yMin: Number.POSITIVE_INFINITY,
      yMax: Number.NEGATIVE_INFINITY
    }
  );

  $: nBuckets = Math.max(0, bounds.xMax - bounds.xMin);

  $: xAxisY = height - kHistogramMargins - 30;
  $: yAxisX = kHistogramMargins + 30;

  $: xticks = Math.min(nBuckets, 40) + 1;
  $: xtickInterval = (width - yAxisX) / xticks;
  $: xtickStart = yAxisX + xtickInterval / 2;

  $: ytickStart = xAxisY;

  $: barInterval = (width - yAxisX - xtickInterval) / nBuckets;
  $: barWidth = barInterval * 0.8;
  $: barOffset = (xtickInterval - barWidth) / 2;
</script>

<svg class="select-none" {width} {height}>
  <g transform="translate({width / 2}, {height - kHistogramMargins})">
    <text text-anchor="middle" y="10">
      {xlabel}
    </text>
  </g>
  <g transform="translate(0, {height / 2})">
    <text transform="translate({kHistogramMargins}, 0) rotate(270)" text-anchor="middle" y="-20">
      {ylabel}
    </text>
  </g>
  <line x1={yAxisX} x2={width} y1={xAxisY} y2={xAxisY} stroke="black" />
  <line y1={xAxisY} y2={kHistogramMargins} x1={yAxisX} x2={yAxisX} stroke="black" />

  {#each { length: xticks } as _, i}
    {@const offset = xtickStart + xtickInterval * i}
    <line x1={offset} x2={offset} y1={xAxisY - 4} y2={xAxisY + 4} stroke="black" />
    <text
      x={offset}
      y={xAxisY + 8}
      text-anchor="middle"
      alignment-baseline="text-before-edge"
      font-size="9"
    >
      {#if nBuckets + 1 !== xticks}
        {Math.round((i / (xticks - 1)) * (bounds.xMax - bounds.xMin) * 10) / 10 + bounds.xMin}
      {:else}
        {bounds.xMin + i}
      {/if}
    </text>
  {/each}
  {#each { length: yticks + 1 } as _, i}
    {@const offset = ytickStart - (xAxisY - kHistogramMargins) * (i / yticks)}
    <line x1={yAxisX - 4} x2={yAxisX + 4} y1={offset} y2={offset} stroke="black" />
    <text x={yAxisX - 8} y={offset} text-anchor="end" alignment-baseline="middle" font-size="9">
      {((i / yticks) * bounds.yMax * 100).toFixed(2)}%
    </text>
  {/each}

  {#each buckets as [x, h], i (x)}
    {@const xStart = yAxisX + barInterval * (x - bounds.xMin) + barOffset}
    {@const barHeight = (xAxisY - kHistogramMargins) * (h / bounds.yMax)}
    {@const textX = xStart + barInterval / 2 - barOffset}
    {@const textY = xAxisY - barHeight - 3}
    <g class="group">
      <rect
        x={xStart}
        width={barWidth}
        y={xAxisY - barHeight}
        height={barHeight}
        fill={color}
        stroke={barInterval < 3 ? 'none' : 'black'}
      />
      <g
        transform="translate({textX}, {textY})"
        class="hidden group-hover:block"
      >
        <line x1={0} x2={0} y1={0} y2={-textY + 20} stroke="black" />
        <text y={-textY} text-anchor="middle" alignment-baseline="before-edge" font-size="12">
          ({x}, {(h * 100).toFixed(2)}%)
        </text>
      </g>
    </g>
  {/each}
</svg>
