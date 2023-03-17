/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { DiceRoller, type RootType as ParsedRoll, type CriticalType, type RollBase } from 'dice-roller-parser';

import type { AttackSetup } from './routes/+page.svelte';

export interface IncomingMessage {
	nonce: number;
	setup: AttackSetup;
}

export interface ReturnMessage {
	buckets: [number, number][];
	numTrials: number;
	nonce: number;
}

const sw = self as unknown as ServiceWorkerGlobalScope;

function getCritical(roll: any): CriticalType {
	if (Array.isArray(roll.dice)) {
		return getCritical(roll.dice[0]);
	}
	if (Array.isArray(roll.rolls)) {
		return getCritical(roll.rolls.filter((r: RollBase) => r.valid)[0]);
	}
	if (typeof roll.critical === 'string') {
		return roll.critical;
	}
	return null;
}

function simulate(
	roller: DiceRoller,
	attackRoll: ParsedRoll,
	damageRoll: ParsedRoll,
	setup: AttackSetup
): number {
	const roll = (r: ParsedRoll, crits = true) => {
		const result = roller.rollParsed(r);

		if (crits) {
			if (getCritical(result) === 'failure') return Number.NEGATIVE_INFINITY;
			if (getCritical(result) === 'success') return Number.POSITIVE_INFINITY;
		}

		return result.value;
	};

	let sum = 0;
	for (let atk = 0; atk < setup.numAttacks; atk++) {
		const attackResult =
			setup.adv === 'advantage'
				? Math.max(roll(attackRoll), roll(attackRoll))
				: setup.adv === 'disadvantage'
				? Math.min(roll(attackRoll), roll(attackRoll))
				: roll(attackRoll);
		if (
			(attackResult !== Number.POSITIVE_INFINITY && attackResult <= setup.versus) ||
			attackResult === Number.NEGATIVE_INFINITY
		)
			continue;

		let damage = roll(damageRoll, /* crits = */ false);
		if (attackResult === Number.POSITIVE_INFINITY) damage *= 2;

		sum += damage;
	}

	return sum;
}

sw.addEventListener('message', (event) => {
	const data = event.data as IncomingMessage;

	const roller = new DiceRoller();
	const atkParsed = roller.parse(data.setup.attackRoll);
	const dmgParsed = roller.parse(data.setup.damageRoll);

	const kTrials = 100000;

	const buckets = new Map<number, number>();
	for (let i = 0; i < kTrials; i++) {
		const result = simulate(roller, atkParsed, dmgParsed, data.setup);
		buckets.set(result, (buckets.get(result) ?? 0) + 1);
	}

	event.source?.postMessage({
		buckets: [...buckets],
		numTrials: kTrials,
		nonce: data.nonce
	} satisfies ReturnMessage);
});
