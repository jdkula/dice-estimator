<script lang="ts" context="module">
	export interface AttackSetup {
		n: number;
		s: number;
		mod: number;

		type: 'normal' | 'advantage' | 'disadvantage';

		nattacks: number;
		modattack: number;
		ac: number;
	}
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import * as d3 from 'd3';
	import { min, range } from 'd3';
	import { binomial, P } from './probability';
	import Decimal from 'decimal.js';
	import { afterUpdate, onMount } from 'svelte';

	let div: HTMLDivElement;

	let nattacks = 1;
	let modattack = 0;

	let n = 1;
	let s = 6;
	let mod = 0;
	let ac = 0;
	$: dc = ac === undefined ? ac : ac + 1;

	let advantage = false;
	let disadvantage = false;

	let containerWidth: number;

	let handle: number | null = null;
	let trials: number[] = [];
	let nonce = 0;
	let lastNonce = 0;

	const requestUpdate = async () => {
		console.log('Trials@', trials.length);
		if (trials.length >= 20_000_000) return;
		const registration = await navigator.serviceWorker.ready;
		registration.active?.postMessage({
			setup: {
				n,
				s,
				mod,
				ac,
				nattacks,
				modattack,
				type: 'normal'
			} satisfies AttackSetup,
			nonce
		});
	};

	onMount(() => {
		const onMessage = ({ data }: { data: { samples: number[]; nonce: number } }) => {
			if (data.nonce !== nonce) return;
			trials = trials.concat(data.samples);
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
		trials = [];
		requestUpdate();
	});

	$: maximum = nattacks * (n * s + mod) * 2 + 1;
	$: minimum = 0;

	$: histogram = d3
		.bin()
		.value((d) => d)
		.domain([minimum, maximum])
		.thresholds(maximum - minimum);

	$: bins = histogram(trials);
	$: points = bins.map<[number, number]>((bin) => [bin.x0 as number, bin.length / trials.length]);

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
		const margin = { top: 0, right: 50, bottom: 60, left: 100 },
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

	$: if ([n, s, mod, ac, advantage, disadvantage, nattacks, modattack]) {
		nonce++;
		console.log('NEW NONCE', nonce);
	}

	$: if (containerWidth && browser && div) {
		const pHit = Math.min(1, Math.max(0, (20 - ac + modattack) / 20));
		d3.select(div).selectChildren().remove();

		makeGraph('Possibility to equal', points);
		makeGraph('Possibility to match or exceed', cumulative);
		makeGraph('Possibility to match or fall short', cumulativeNeg);
	}
</script>

<svelte:head>
	<title>Damage Calculator</title>
</svelte:head>

<div>
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
	<div style="margin-top: 2rem;">
		<label>
			<span>AC:</span>
			<input
				value={ac}
				on:change={(e) => e.target.value !== '' && (ac = parseInt(e.target.value))}
				type="number"
			/>
		</label>
		<span>
			{'=>'} Average damage per turn: {Math.floor(expectedDamage * 1000) / 1000}.
		</span>
	</div>
</div>
<div style="margin-bottom: 1rem;">
	<div>
		<em>
			This tool will calculate the damage distribution for a given attack by rolling the attack
			against an enemy with a certain AC 20,000,000 times.
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
			Current num. calculations: {[...trials.length.toString()]
				.reverse()
				.reduce(
					(p, v, i, arr) => [...((i + 1) % 3 === 0 && i !== arr.length - 1 ? [','] : []), v, ...p],
					[]
				)
				.join('')}
		</em>
	</div>
</div>
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
</style>
