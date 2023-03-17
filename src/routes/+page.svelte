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
	import * as d3 from 'd3';
	import { range } from 'd3';
	import { afterUpdate, onMount } from 'svelte';
	import { persistentStore } from './browserStore';

	let div: HTMLDivElement;

	let nattacks = persistentStore<number | undefined>('nattacks', 1);
	let attackRoll = persistentStore('attackRoll', '1d20');
	let damageRoll = persistentStore('damageRoll', '1d6');
	let ac = persistentStore<string>('ac', '0');
	let type = persistentStore<AdvType>('adv', 'normal');

	let maxIters = persistentStore('maxIters', 2_000);
	let trialsPerIter = persistentStore('perIter', 5_000);
	$: maxTrials = $maxIters * $trialsPerIter;

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
		if (nTrials >= maxTrials) return;

		const registration = await navigator.serviceWorker.ready;
		registration.active?.postMessage({
			setup: {
				numAttacks: $nattacks ?? 1,
				versus: $ac ?? 0,
				attackRoll: $attackRoll,
				damageRoll: $damageRoll,
				adv: $type,
				crits: $crits
			},
			nonce,
			itersRequested: $trialsPerIter,
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

	$: if ([$nattacks, $type, $attackRoll, $damageRoll, $ac, $crits, maxTrials]) {
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

<h1>Damage Estimator</h1>

<h2>About</h2>
<div>
	<div>
		<em>
			This tool will calculate the damage distribution for a given attack by rolling the attack
			against an enemy with a certain AC {maxTrials.toLocaleString()} times.
		</em>
	</div>
	<div>
		<em>
			Nat 1s will always fail, no matter the AC. Nat 20s always hit, no matter the AC, and do double
			damage.
		</em>
	</div>
	<div>
		<em>
			Current num. calculations: {nTrials.toLocaleString()}
		</em>
	</div>
	<p>
		<em> If things don't work, hard reload the page a couple times. Cmd+Shift+R / Ctrl+Shift+R </em>
	</p>
	<details>
		<summary>Advanced</summary>

		<div>
			<label>
				<span>Max number of iterations:</span>
				<input type="number" bind:value={$maxIters} />
			</label>
			<label>
				<span>Trials per iteration:</span>
				<input type="number" bind:value={$trialsPerIter} />
			</label>
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

<div>
	<div>
		<h2>Attack Setup</h2>
		<p>
			<em>Note that the first attack die will be used to determine critical success/failure</em>
		</p>
		<div>
			<label>
				<span>Number of attacks:</span>
				<input type="number" bind:value={$nattacks} />
			</label>
		</div>
		<div>
			<label>
				<span>Attack Roll (roll20 format, e.g. 2d6+1d8+3):</span>
				<input type="text" bind:value={$attackRoll} />
			</label>
		</div>
		<div>
			<span> Roll type: </span>

			<label>
				<input type="radio" bind:group={$type} value="normal" />
				<span>Normal</span>
			</label>
			<label>
				<input type="radio" bind:group={$type} value="advantage" />
				<span>Advantage</span>
			</label>
			<label>
				<input type="radio" bind:group={$type} value="disadvantage" />
				<span>Disadvantage</span>
			</label>
		</div>

		<div>
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
		</div>

		<h2>Damage Setup</h2>
		<div>
			<label>
				<span>Damage Roll (roll20 format, e.g. 2d6+1d8+3):</span>
				<input type="text" bind:value={$damageRoll} />
			</label>
		</div>
	</div>

	<h2>Opponent Setup</h2>
	<div>
		<label>
			<span>AC:</span>
			<input bind:value={$ac} type="text" />
		</label>
		<span>
			{'=>'} Average damage per turn: {Math.floor(expectedDamage * 1000) / 1000}. {#if nAttacks !== 0}
				Hit ratio: {Math.floor((nHit / nAttacks) * 10000) / 100}%
			{/if}
		</span>
	</div>
</div>
<div style="margin-bottom: 1rem;" />
<div class="root" bind:clientWidth={containerWidth}>
	<div class="inner" bind:this={div} />
</div>

<style>
	.root {
		width: 98vw;
	}
	.inner {
		width: 100%;
	}

	h2 {
		margin-bottom: 0.5rem;
	}
</style>
