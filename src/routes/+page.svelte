<script lang="ts">
	import { browser } from '$app/environment';
	import * as d3 from 'd3';
	import { min, range } from 'd3';
	import { binomial, P } from './probability';
	import Decimal from 'decimal.js';

	let div: HTMLDivElement;

	let n = 1;
	let s = 20;
	let mod = 0;
	let dc = 10;

	let advantage = false;
	let disadvantage = false;

	let containerWidth: number;

	let pMatchExceed: number | null = null;
	let pExceed: number | null = null;

	$: if (containerWidth && browser && div && [n, s, mod, dc].every((x) => typeof x === 'number')) {
		const maximum = n * s + mod + 1;
		const minimum = mod + n;

		const points = range(minimum, maximum + 1).map((x) => [x, P(x, n, s, mod)]);
		const cumulative = range(minimum, maximum + 1).map((i) => [
			i,
			points.slice(i - minimum).reduce((p, [x, y]) => p + y, 0)
		]);
		pMatchExceed =
			dc - minimum < 0
				? 1
				: dc - minimum >= cumulative.length
				? 0
				: cumulative[dc - minimum]?.[1] ?? null;
		pExceed =
			dc + 1 - minimum < 0
				? 1
				: dc + 1 - minimum >= cumulative.length
				? 0
				: cumulative[dc + 1 - minimum]?.[1] ?? null;

		const yMax = cumulative.map(([x, y]) => y).reduce((p, v) => Math.max(p, v), -1);
		const displayMin = minimum - 1;

		const displayMax = cumulative
			.filter(([x, y]) => y > 0)
			.reduce((p, [x, y]) => Math.max(p, x), -1);

		// set the dimensions and margins of the graph
		const margin = { top: 100, right: 100, bottom: 100, left: 100 },
			width = containerWidth - margin.left - margin.right,
			height = 600 - margin.top - margin.bottom;

		// append the svg object to the body of the page
		d3.select(div).selectChildren().remove();
		const svg = d3
			.select(div)
			.append('svg')
			.attr('width', width + margin.left + margin.right)
			.attr('height', height + margin.top + margin.bottom)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		const xScale = d3.scaleLinear([displayMin, displayMax], [0, width]);
		const yScale = d3.scaleLinear([0, yMax], [height, 0]);

		const xAxis = d3.axisBottom(xScale).ticks(displayMax - displayMin);
		const yAxis = d3.axisLeft(yScale);

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
			.text('Probability to match or exceed');

		svg
			.selectAll('rect')
			.data(cumulative)
			.join('rect')
			.attr('x', 1)
			.attr('transform', ([x, y]) => `translate(${xScale(x - 1) + 4}, ${yScale(y)})`)
			.attr('width', ([x, y]) => Math.max(width / (displayMax - displayMin) - 8, 2))
			.attr('height', ([x, y]) => height - yScale(y))
			.style('fill', '#69b3a2');
	}
</script>

<div>
	<div>
		<label>
			<span>Number of dice:</span>
			<input bind:value={n} type="number" />
		</label>
	</div>
	<div>
		<label>
			<span>Number of sides:</span>
			<input bind:value={s} type="number" />
		</label>
	</div>
	<div>
		<label>
			<span>Modifier:</span>
			<input bind:value={mod} type="number" />
		</label>
	</div>
	<div style="margin-top: 2rem;">
		<label>
			<span>DC, AC, attack output, etc:</span>
			<input bind:value={dc} type="number" />
		</label>
		{#if pExceed !== null && pMatchExceed !== null}
			<span>
				{'=>'} Probability of match or exceed: {Math.round(pMatchExceed * 100)}%. Probability of
				exceeding: {Math.round(pExceed * 100)}%
			</span>
		{/if}
	</div>
</div>
<div class="root" bind:clientWidth={containerWidth}>
	<div class="inner" bind:this={div} />
</div>

<style>
	.root {
		width: 95vw;
	}
	.inner {
		width: 100%;
	}
</style>
