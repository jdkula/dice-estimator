import { range } from 'd3';
import Decimal from 'decimal.js';
// https://stackoverflow.com/questions/37679987/efficient-computation-of-n-choose-k-in-node-js

// step 1: a basic LUT with a few steps of Pascal's triangle
const binomials = [
	[1],
	[1, 1],
	[1, 2, 1],
	[1, 3, 3, 1],
	[1, 4, 6, 4, 1],
	[1, 5, 10, 10, 5, 1],
	[1, 6, 15, 20, 15, 6, 1],
	[1, 7, 21, 35, 35, 21, 7, 1],
	[1, 8, 28, 56, 70, 56, 28, 8, 1]
	//  ...
];

// step 2: a function that builds out the LUT if it needs to.
export function binomial(n: number, k: number): Decimal {
	while (n >= binomials.length) {
		const s = binomials.length;
		const nextRow = [];
		nextRow[0] = 1;
		for (let i = 1, prev = s - 1; i < s; i++) {
			nextRow[i] = binomials[prev][i - 1] + binomials[prev][i];
		}
		nextRow[s] = 1;
		binomials.push(nextRow);
	}
	return new Decimal(binomials[n][k] ?? 0);
}

export function PDamage(output: number, n: number, s: number, mod: number): number {
	// General formula -> https://www.lucamoroni.it/the-dice-roll-sum-problem/
	output -= mod;
	const kmax = Math.floor((output - n) / s);

	const probability = Decimal.pow(s, -n).times(
		range(0, kmax + 1)
			.map((k) => new Decimal(k))
			.map((k) =>
				k
					.mod(2)
					.times(-2)
					.plus(1)
					.times(binomial(n, k.toNumber()))
					.times(binomial(output - s * k.toNumber() - 1, output - s * k.toNumber() - n))
			)
			.reduce((p, c) => p.add(c), new Decimal(0))
	);

	return probability.toNumber();
}

function P_NHits(pHit: number, nHits: number, maxHits: number): number {
	let prob = 1;
	for (let i = 0; i < maxHits; i++) {
		if (nHits > 0) {
			prob *= pHit;
			nHits--;
		} else {
			prob *= 1 - pHit;
		}
	}

	return prob;
}

function PDamageMulti(
	damage: number,
	n: number,
	s: number,
	mod: number,
	nAttacksHit: number
): number {
	// P(X damage | 1 attack hits) = PDamage(X)
	// P(X damage | 2 attacks hit) = PDamage(X)*PDamage(0) + PDamage(X-1)*PDamage(1) etc...
	// P(X damage | 3 attacks hit) = PPDamage(X)*PDamage(0)*PDamage(0) + PDamage(X-1)*PDamage(1)*PDamage(0) etc...

	function PDamageMultiRec(remaining: number, level: number): number {
		if (level >= nAttacksHit) return 0;
		if (level === nAttacksHit - 1) return PDamage(remaining, n, s, mod);

		let probability = 0;
		for (let i = 0; i < remaining; i++) {
			probability += PDamage(i, n, s, mod) * PDamageMultiRec(remaining - i, level + 1);
		}
		return probability;
	}

	return PDamageMultiRec(damage, 0);
}

export function P(
	damage: number,
	n: number,
	s: number,
	mod: number,
	numAttacks: number,
	pHit: number
): number {
	let probability = 0;

	for (let i = 0; i <= numAttacks; i++) {
		const probIAttacksHit = P_NHits(pHit, i, numAttacks);
		probability += probIAttacksHit * PDamageMulti(damage, n, s, mod, i);
	}

	return probability;
}
