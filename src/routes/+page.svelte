<script lang="ts" context="module">
  import type { IncomingMessage, ReturnMessage } from './../service-worker';
  export type AdvType = 'advantage' | 'disadvantage' | 'normal';

  export interface AttackSetup {
    numAttacks: string;
    attackRoll: string;

    cost: string;
    reduction: string;

    damageRoll: string;
    adv?: AdvType;

    versus: number | string;
    crits: {
      failsMiss: boolean;
      successesHit: boolean;
      successesCrit: boolean;
    };
  }

  export const kDefaultMaxTrials = 500_000;
  export const kDefaultTrialsPerChunk = 5_000;

  export const kAttackRollPlaceholder = '1d20+3';
  export const kDamageRollPlaceholder = '2d6+1d8+3';
</script>

<script lang="ts">
  import Box from '$lib/Box.svelte';
  import Histogram from '$lib/Histogram.svelte';
  import TextInput from '$lib/TextInput.svelte';
  import { afterUpdate, onMount } from 'svelte';
  import { persistentStore } from '../lib/browserStore';
  import { range } from '$lib/range';

  let nattacks = persistentStore('nattacks', '');
  let attackRoll = persistentStore('attackRoll', '');
  let damageRoll = persistentStore('damageRoll', '');
  let ac = persistentStore<string>('ac', '');
  let reduction = persistentStore<string>('reduction', '');
  let cost = persistentStore<string>('cost', '');
  let type = persistentStore<AdvType>('adv', 'normal');

  let maxTrials = persistentStore('maxTrials', kDefaultMaxTrials);
  let trialsPerChunk = persistentStore('trialsPerChunk', 5_000);

  let crits = persistentStore<AttackSetup['crits']>('crits', {
    failsMiss: true,
    successesCrit: true,
    successesHit: true
  });

  let containerWidth: number = 0;

  const buckets = new Map<number, { costSum: number; observations: number; attacks: number; }>(); // damage -> observations
  let nTrials = 0;
  let nAttacks = 0;
  let nHit = 0;

  let nonce = 0;
  let lastNonce = 0;

  const requestUpdate = async () => {
    if (nTrials >= ($maxTrials ?? kDefaultMaxTrials)) return;

    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      setup: {
        numAttacks: $nattacks?.toString() || '1',
        versus: $ac || 0,
        attackRoll: $attackRoll || kAttackRollPlaceholder,
        damageRoll: $damageRoll || kDamageRollPlaceholder,
        adv: $type,
        crits: $crits,
        cost: $cost || '0',
        reduction: $reduction || '0'
      },
      nonce,
      itersRequested: Math.min(
        $trialsPerChunk ?? kDefaultTrialsPerChunk,
        ($maxTrials ?? kDefaultMaxTrials) - nTrials
      )
    } satisfies IncomingMessage);
  };

  onMount(() => {
    const onMessage = ({ data }: { data: ReturnMessage }) => {
      if (data.nonce !== nonce) return;
      for (const [key, { damageObservations, costTotal, atks }] of data.buckets) {
        const costData = buckets.get(key) ?? { costSum: 0, observations: 0, attacks: 0 };
        costData.observations += damageObservations;
        costData.costSum += costTotal;
        costData.attacks += atks;
        buckets.set(key, costData);
      }

      nTrials += data.numTrials;
      nAttacks += data.numAttacks;
      nHit += data.numHit;

      requestUpdate();
    };

    const onRefresh = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyR') {
        e.preventDefault();
        nonce++;
      }
    };
    document.addEventListener('keydown', onRefresh);
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      document.removeEventListener('keydown', onRefresh);
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  });

  afterUpdate(() => {
    if (nonce === lastNonce) return;

    lastNonce = nonce;
    buckets.clear();
    nTrials = 0;
    nAttacks = 0;
    nHit = 0;
    requestUpdate();
  });

  $: points = [...buckets].map<[number, number, number]>(([n, { costSum, observations }]) => [
    n,
    observations / nTrials,
    costSum / observations
  ]);
  $: maximum = points.map(([x]) => x).reduce((p, v) => Math.max(p, v), Number.NEGATIVE_INFINITY);
  $: minimum = points.map(([x]) => x).reduce((p, v) => Math.min(p, v), Number.POSITIVE_INFINITY);

  $: cumulative = range(minimum, maximum + 1).map<[number, number, undefined]>((i) => [
    i,
    points.slice(i - minimum).reduce((p, [x, y]) => p + y, 0),
    undefined
  ]);

  $: cumulativeNeg = range(minimum, maximum + 1).map<[number, number, undefined]>((i) => [
    i,
    points.slice(0, i - minimum + 1).reduce((p, [x, y]) => p + y, 0),
    undefined
  ]);

  $: expectedDamage = points.map(([amount, prob]) => amount * prob).reduce((p, v) => p + v, 0);

  $: if ([$nattacks, $type, $attackRoll, $damageRoll, $ac, $crits, $maxTrials, $trialsPerChunk, $cost, $reduction]) {
    nonce++;
  }
</script>

<svelte:head>
  <title>Damage Estimator</title>
</svelte:head>

<article class="prose-sm md:prose xl:prose-lg max-w-full md:max-w-full xl:max-w-full">
  <h1>Damage Estimator</h1>
  <p>
    This tool will calculate the damage distribution for a given attack by rolling the attack
    against an enemy with a certain AC {($maxTrials ?? kDefaultMaxTrials).toLocaleString()} times.
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
      <TextInput bind:value={$maxTrials} placeholder={kDefaultMaxTrials.toString()} type="number"
        >Max trials</TextInput
      >
      <TextInput
        bind:value={$trialsPerChunk}
        placeholder={kDefaultTrialsPerChunk.toString()}
        type="number"
      >
        Trials per chunk
      </TextInput>
    </div>

    <article class="prose-sm prose-pre:m-0">
      <p>To reset the current view/start re-rolling, press Alt+R.</p>

      <p>
        If you want to create a random variable to use in your roll expressions that retains its
        value across all expressions, you can use up to one variable. Append %% and then an
        expression X=&lt;roll&gt; to create a random variable.
      </p>
      <div>
        <div>Examples:</div>
        <div class="p-4 bg-gray-200 rounded-lg">
          <pre><code
              ># Roll between 1 and 6 d6s
Attack: 1d20 %% X=1d8
Damage: Xd6

# Could also be written as
Attack: 1d20
Damage: (1d8)d6</code
            ></pre>
        </div>
        <div class="p-4 bg-gray-200 rounded-lg mt-2">
          <pre><code
              ># Pick between 0 and 8 d2s to add to a pool,
# the contents of which are randomly allocated
# between attack and damage bonuses
Attack: 1d20+$ATKd2 %% $POOL=1d9 - 1 %% $ATK=1d$POOL %% $DMG=($POOL - $ATK)
Damage: 1d8+$DMGd2
</code></pre>
        </div>
      </div>
    </article>
  </details>
</div>

<div class="mt-8">
  <div class="flex flex-wrap gap-4 justify-around">
    <Box>
      <h2>Attack Setup</h2>
      <div>
        <TextInput bind:value={$nattacks} placeholder="1" type="text">Number of attacks</TextInput
        >
      </div>
      <div>
        <TextInput bind:value={$attackRoll} type="text" placeholder={kAttackRollPlaceholder}>
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
        <TextInput bind:value={$damageRoll} type="text" placeholder={kDamageRollPlaceholder}>
          Damage Roll (roll20 format)
        </TextInput>
      </div>
      <div>
        <TextInput bind:value={$cost} type="text" placeholder="0">
          Attack Cost (roll20 format)
        </TextInput>
      </div>
    </Box>

    <Box>
      <h2>Opponent Setup</h2>
      <div>
        <TextInput bind:value={$ac} type="text" placeholder="0">AC (roll20 format)</TextInput>
      </div>
      <div>
        <TextInput bind:value={$reduction} type="text" placeholder="0">
          Damage Reduce (roll20 format)
        </TextInput>
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
  <div class="inner">
    <Histogram
      buckets={points}
      height={600}
      width={containerWidth}
      xlabel="Attack Damage (misses as 0)"
      ylabel="Probability"
    />
    <Histogram
      buckets={cumulative}
      height={600}
      width={containerWidth}
      xlabel="Attack Damage (misses as 0)"
      ylabel="Probability of matching or exceeding"
    />
    <Histogram
      buckets={cumulativeNeg}
      height={600}
      width={containerWidth}
      xlabel="Attack Damage (misses as 0)"
      ylabel="Probability of matching or falling short"
    />
  </div>
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
