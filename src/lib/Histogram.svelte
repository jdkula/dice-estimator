<script lang="ts" context="module">
  export const kHistogramMargins = 25;
</script>

<script lang="ts">
  export let buckets: [number, number, undefined | number][];
  export let color = '#69b3a2';
  export let yticks = 10;

  export let width: number;
  export let height: number;

  export let xlabel: string;
  export let ylabel: string;

  $: useableHight = height - kHistogramMargins * 2;
  $: usableWidth = width - kHistogramMargins * 2;

  $: bounds = buckets.reduce(
    (prev, [bucket, obs, cost = null]) => ({
      xMin: Math.min(prev.xMin, bucket),
      xMax: Math.max(prev.xMax, bucket),
      yMin: Math.min(prev.yMin, obs),
      yMax: Math.max(prev.yMax, obs),
      zMin: Math.min(prev.zMin, cost ?? Number.NaN),
      zMax: Math.max(prev.zMax, cost ?? Number.NaN)
    }),
    {
      xMin: Number.POSITIVE_INFINITY,
      xMax: Number.NEGATIVE_INFINITY,
      yMin: Number.POSITIVE_INFINITY,
      yMax: Number.NEGATIVE_INFINITY,
      zMin: Number.POSITIVE_INFINITY,
      zMax: Number.NEGATIVE_INFINITY
    }
  );

  $: nBuckets = Math.max(0, bounds.xMax - bounds.xMin + 1);

  $: xAxisY = useableHight - kHistogramMargins - 30;
  $: yAxisX = kHistogramMargins + 30;
  $: zAxisX = usableWidth - kHistogramMargins - 30;

  $: xticks = Math.min(nBuckets, 40);
  $: xtickInterval = (zAxisX - yAxisX) / xticks;
  $: xtickStart = yAxisX + xtickInterval / 2;

  $: ytickStart = xAxisY;
  $: ztickStart = xAxisY;

  $: xtickBarOffset = xtickInterval - (zAxisX - yAxisX) / nBuckets;
  $: barInterval = (zAxisX - yAxisX - xtickBarOffset) / nBuckets;
  $: barOffset = yAxisX + xtickBarOffset / 2;

  $: hideZ =
    Number.isNaN(bounds.zMin) ||
    !Number.isFinite(bounds.zMin) ||
    (bounds.zMax === 0 && bounds.zMin === 0);
</script>

<svg class="select-none" {width} {height}>
  <g transform="translate({kHistogramMargins}, {kHistogramMargins})">
    <g transform="translate({usableWidth / 2}, {useableHight - kHistogramMargins})">
      <text text-anchor="middle" y="10">
        {xlabel}
      </text>
    </g>
    <g transform="translate(0, {useableHight / 2})">
      <text transform="translate({kHistogramMargins}, 0) rotate(270)" text-anchor="middle" y="-20">
        {ylabel}
      </text>
    </g>
    <line x1={yAxisX} x2={zAxisX} y1={xAxisY} y2={xAxisY} stroke="black" />
    <line y1={xAxisY} y2={kHistogramMargins} x1={yAxisX} x2={yAxisX} stroke="black" />
    {#if !hideZ}
      <line y1={xAxisY} y2={kHistogramMargins} x1={zAxisX} x2={zAxisX} stroke="black" />
    {/if}

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
        {#if nBuckets !== xticks}
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
    {#if !hideZ}
      {#each { length: yticks + 1 } as _, i}
        {@const offset = ztickStart - (xAxisY - kHistogramMargins) * (i / yticks)}
        <line x1={zAxisX - 4} x2={zAxisX + 4} y1={offset} y2={offset} stroke="black" />
        <text
          x={zAxisX + 8}
          y={offset}
          text-anchor="start"
          alignment-baseline="middle"
          font-size="9"
        >
          {Math.floor((i / yticks) * bounds.zMax * 100) / 100}
        </text>
      {/each}
    {/if}

    {#each buckets as [x, h, z], i (x)}
      {@const xStart = barOffset + barInterval * (x - bounds.xMin)}
      {@const barHeight = (xAxisY - kHistogramMargins) * (h / bounds.yMax)}
      {@const textX = xStart + barInterval / 2}
      {@const textY = xAxisY - barHeight}
      <g class="group">
        <g transform="translate({xStart}, {xAxisY - barHeight})">
          <rect
            width={barInterval}
            height={barHeight}
            fill={color}
            stroke={barInterval < 3 ? 'none' : 'black'}
            transform="translate({barInterval * 0.1}, 0) scale({0.8}, 1)"
          />
        </g>
        <g transform="translate({textX}, {textY})" class="hidden group-hover:block">
          <line x1={0} x2={0} y1={0} y2={-textY + 20} stroke="black" />
          <text y={-textY} text-anchor="middle" alignment-baseline="before-edge" font-size="12">
            ({x}, {(h * 100).toFixed(2)}%)
          </text>
        </g>
        {#if z !== undefined && !hideZ}
          {@const pointY = xAxisY - (xAxisY - kHistogramMargins) * (z / bounds.zMax)}
          <circle
            cx={xStart + barInterval / 2}
            cy={pointY}
            fill="Green"
            r={barInterval * 0.8 * 0.5 * 0.8}
          />
        {/if}
      </g>
    {/each}
  </g>
</svg>
