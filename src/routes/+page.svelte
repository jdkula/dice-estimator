<script lang="ts" context="module">
  import type { IncomingMessage, ReturnMessage } from './../service-worker';
  export type AdvType = 'advantage' | 'disadvantage' | 'normal';

  export interface AttackSetup {
    numAttacks: number;
    attackRoll: string;

    damageRoll: string;
    adv?: AdvType;

    versus: number | string;
    crits: {
      failsMiss: boolean;
      successesHit: boolean;
      successesCrit: boolean;
    };
  }
</script>

<script lang="ts">
  import { browser } from '$app/environment';
  import Box from '$lib/Box.svelte';
  import TextInput from '$lib/TextInput.svelte';
  import * as d3 from 'd3';
  import { range } from 'd3';
  import { afterUpdate, onMount } from 'svelte';
  import { persistentStore } from '../lib/browserStore';

  let div: HTMLDivElement;

  let nattacks = persistentStore<number | undefined>('nattacks', 1);
  let attackRoll = persistentStore('attackRoll', '');
  let damageRoll = persistentStore('damageRoll', '');
  let ac = persistentStore<string>('ac', '');
  let type = persistentStore<AdvType>('adv', 'normal');

  let maxTrials = persistentStore('maxTrials', 5_000_000);
  let trialsPerChunk = persistentStore('trialsPerChunk', 5_000);

  let crits = persistentStore<AttackSetup['crits']>('crits', {
    failsMiss: true,
    successesCrit: true,
    successesHit: true
  });

  let containerWidth: number = 0;

  const buckets = new Map<number, number>();
  let nTrials = 0;
  let nAttacks = 0;
  let nHit = 0;

  let nonce = 0;
  let lastNonce = 0;

  const requestUpdate = async () => {
    console.log('Trials@', nTrials);
    if (nTrials >= ($maxTrials ?? 5_000_000)) return;

    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      setup: {
        numAttacks: $nattacks ?? 1,
        versus: $ac ?? 0,
        attackRoll: $attackRoll || '1d20+3',
        damageRoll: $damageRoll || '2d6+1d8+3',
        adv: $type,
        crits: $crits
      },
      nonce,
      itersRequested: Math.min($trialsPerChunk ?? 5_000, ($maxTrials ?? 5_000_000) - nTrials)
    } satisfies IncomingMessage);
  };

  onMount(() => {
    const onMessage = ({ data }: { data: ReturnMessage }) => {
      if (data.nonce !== nonce) return;
      for (const [key, nResults] of data.buckets) {
        buckets.set(key, (buckets.get(key) ?? 0) + nResults);
      }
      nTrials += data.numTrials;
      nAttacks += data.numTrials * ($nattacks ?? 1);
      nHit += data.numHit;

      requestUpdate();
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  });

  afterUpdate(() => {
    if (nonce === lastNonce) return;

    console.log('Requesting update');
    lastNonce = nonce;
    buckets.clear();
    nTrials = 0;
    nAttacks = 0;
    nHit = 0;
    requestUpdate();
  });

  $: points = [...buckets].map<[number, number]>(([n, h]) => [n, h / nTrials]);
  $: maximum = points.map(([x]) => x).reduce((p, v) => Math.max(p, v), Number.NEGATIVE_INFINITY);
  $: minimum = points.map(([x]) => x).reduce((p, v) => Math.min(p, v), Number.POSITIVE_INFINITY);

  $: cumulative = range(minimum, maximum + 1).map<[number, number]>((i) => [
    i,
    points.slice(i - minimum).reduce((p, [x, y]) => p + y, 0)
  ]);

  $: cumulativeNeg = range(minimum, maximum + 1).map<[number, number]>((i) => [
    i,
    points.slice(0, i - minimum + 1).reduce((p, [x, y]) => p + y, 0)
  ]);

  $: expectedDamage = points.map(([amount, prob]) => amount * prob).reduce((p, v) => p + v, 0);

  function makeGraph(ylabel: string, pool: [number, number][]) {
    const margin = { top: 20, right: 50, bottom: 60, left: 100 },
      width = containerWidth - margin.left - margin.right,
      height = 600 - margin.top - margin.bottom;

    const yMax = pool.map(([x, y]) => y).reduce((p, v) => Math.max(p, v), -1);
    const displayMin = minimum - 1;
    const displayMax = pool.filter(([x, y]) => y > 0).reduce((p, [x, y]) => Math.max(p, x), -1);

    const xScale = d3.scaleLinear([displayMin, displayMax], [0, width]);
    const yScale = d3.scaleLinear([0, yMax], [height, 0]);
    const xAxis = d3.axisBottom(xScale).ticks(displayMax - displayMin);
    const yAxis = d3.axisLeft(yScale);

    // append the svg object to the body of the page
    const svg = d3
      .select(div)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    svg
      .append('g')
      .attr('transform', `translate(${-1 * (width / (2 * (displayMax - displayMin)))}, ${height})`)
      .call(xAxis);
    svg.append('g').attr('transform', `translate(0,0)`).call(yAxis);

    svg
      .append('text')
      .attr('class', 'x label')
      .attr('text-anchor', 'end')
      .attr('x', width / 2 + 90)
      .attr('y', height + 35)
      .text(`Dice Output`);
    svg
      .append('text')
      .attr('class', 'y label')
      .attr('text-anchor', 'end')
      .attr('x', -height / 2 + 50)
      .attr('y', -35)
      .attr('transform', 'rotate(-90)')
      .text(ylabel);

    svg
      .selectAll('rect')
      .data(pool)
      .join('rect')
      .attr('x', 1)
      .attr('transform', ([x, y]) => `translate(${xScale(x - 1) + 4}, ${yScale(y)})`)
      .attr('width', ([x, y]) => Math.max(width / (displayMax - displayMin) - 8, 2))
      .attr('height', ([x, y]) => height - yScale(y))
      .style('fill', '#69b3a2');
  }

  $: if ([$nattacks, $type, $attackRoll, $damageRoll, $ac, $crits, $maxTrials, $trialsPerChunk]) {
    nonce++;
    console.log('NEW NONCE', nonce);
  }

  $: if (containerWidth && browser && div) {
    d3.select(div).selectChildren().remove();

    makeGraph('Possibility to equal', points);
    makeGraph('Possibility to match or exceed', cumulative);
    makeGraph('Possibility to match or fall short', cumulativeNeg);
  }
</script>

<svelte:head>
  <title>Damage Estimator</title>
</svelte:head>

<article class="prose-sm md:prose xl:prose-lg max-w-full md:max-w-full xl:max-w-full">
  <h1>Damage Estimator</h1>
  <p>
    This tool will calculate the damage distribution for a given attack by rolling the attack
    against an enemy with a certain AC {maxTrials.toLocaleString()} times.
  </p>
  <p>
    <em>
      Current num. calculations: {nTrials.toLocaleString()}
    </em>
  </p>
  <p>
    <em> If things don't work, hard reload the page a couple times. Cmd+Shift+R / Ctrl+Shift+R </em>
  </p>
</article>

<div>
  <details>
    <summary>Advanced</summary>

    <div>
      <TextInput bind:value={$maxTrials} placeholder="5000000" type="number">Max trials</TextInput>
      <TextInput bind:value={$trialsPerChunk} placeholder="5000" type="number">
        Trials per chunk
      </TextInput>
    </div>

    <p>
      If you want to create a random variable to use in your roll expressions that retains its value
      across all expressions, you can use up to one variable. Append %% and then an expression
      X=&lt;roll&gt; to create a random variable.
    </p>
    <div>
      <div>Examples:</div>
      <div>
        <pre><code>
# Roll between 1 and 6 d6s
Attack: 1d20 %% X=1d8
Damage: Xd6

# Could also be written as
Attack: 1d20
Damage: (1d8)d6

# Pick between 0 and 8 d2s to add to a pool,
# the contents of which is randomly allocated
# between attack and damage bonuses
Attack: 1d20+$ATKd2 %% $POOL=1d8 %% $ATK=1d($POOL + 1) - 1 %% $DMG=($POOL - $ATK)
Damage: 1d8+$DMGd2
</code></pre>
      </div>
    </div>
  </details>
</div>

<div class="mt-8">
  <div class="flex flex-wrap gap-4 justify-around">
    <Box>
      <h2>Attack Setup</h2>
      <div>
        <TextInput bind:value={$nattacks} placeholder="1" type="number">Number of attacks</TextInput
        >
      </div>
      <div>
        <TextInput bind:value={$attackRoll} type="text" placeholder="1d20+3">
          Attack Roll (roll20 format)
        </TextInput>
      </div>
      <div
        class="relative my-2 rounded-xl bg-gray-100 border border-gray-300 overflow-hidden focus-within:border-gray-500"
      >
        <span class="text-xs text-gray-600 px-4 pt-1 absolute"> Roll Type </span>
        <div
          class="bg-transparent px-4 pt-5 pb-2 w-full focus:outline-none placeholder:text-gray-400"
        >
          <div>
            <label>
              <input type="radio" bind:group={$type} value="normal" />
              <span>Normal</span>
            </label>
          </div>
          <div>
            <label>
              <input type="radio" bind:group={$type} value="advantage" />
              <span>Advantage</span>
            </label>
          </div>
          <div>
            <label>
              <input type="radio" bind:group={$type} value="disadvantage" />
              <span>Disadvantage</span>
            </label>
          </div>
          <p class="text-gray-500">
            <em> Note that this applies to the entire roll. </em>
          </p>
        </div>
      </div>

      <div>
        <div
          class="relative my-2 rounded-xl bg-gray-100 border border-gray-300 overflow-hidden focus-within:border-gray-500"
        >
          <span class="text-xs text-gray-600 px-4 pt-1 absolute"> Crit Settings </span>
          <div
            class="bg-transparent px-4 pt-5 pb-2 w-full focus:outline-none placeholder:text-gray-400"
          >
            <div>
              <label>
                <input type="checkbox" bind:checked={$crits.failsMiss} />
                <span>Critical failures always miss</span>
              </label>
            </div>
            <div>
              <label>
                <input type="checkbox" bind:checked={$crits.successesHit} />
                <span>Critical successes always hit</span>
              </label>
            </div>
            {#if $crits.successesHit}
              <div>
                <label>
                  <input type="checkbox" bind:checked={$crits.successesCrit} />
                  <span>Critical successes double damage (crit)</span>
                </label>
              </div>
            {/if}
            <p class="text-gray-500">
              <em>
                Note that the first attack die will be used to determine critical success/failure
              </em>
            </p>
          </div>
        </div>
      </div>
    </Box>
    <Box>
      <h2>Damage Setup</h2>
      <div>
        <TextInput bind:value={$damageRoll} type="text" placeholder="2d6+1d8+3">
          Damage Roll (roll20 format)
        </TextInput>
      </div>
    </Box>

    <Box>
      <h2>Opponent Setup</h2>
      <div>
        <TextInput bind:value={$ac} type="text" placeholder="0">AC (roll20 format)</TextInput>
      </div>
    </Box>
  </div>

  <div style="margin-top: 1rem; text-align: center;">
    <span>
      Average damage per turn: <strong>{Math.floor(expectedDamage * 1000) / 1000}</strong>.
    </span>
    <span>
      Max: <strong>
        {#if $crits.successesHit && $crits.successesCrit}
          {(maximum / 2).toLocaleString()} ({maximum.toLocaleString()} with crits).
        {:else}
          {maximum.toLocaleString()}.
        {/if}
      </strong>
    </span>

    {#if nAttacks !== 0}
      <span>
        Hit ratio: <strong>{Math.floor((nHit / nAttacks) * 10000) / 100}%</strong>
      </span>
    {/if}
  </div>
</div>
<div style="margin-bottom: 1rem;" />
<div class="root" bind:clientWidth={containerWidth}>
  <div class="inner" bind:this={div} />
</div>

<style>
  .root {
    width: 100%;
  }
  .inner {
    width: 100%;
  }

  h2 {
    margin-bottom: 0.5rem;
  }
</style>
