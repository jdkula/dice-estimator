/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import {
	DiceRoller,
	type RootType as ParsedRoll,
	type CriticalType,
	type RollBase
} from 'dice-roller-parser';

import type { AttackSetup } from './routes/+page.svelte';

export interface IncomingMessage {
	nonce: number;
	setup: AttackSetup;
}

export interface ReturnMessage {
	buckets: [number, number][];
	numTrials: number;
	numHit: number;
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

type GetRolls = () => {
	attackRoll: ParsedRoll;
	damageRoll: ParsedRoll;
	acRoll: ParsedRoll;
};

function simulate(
	roller: DiceRoller,
	getRolls: GetRolls,
	setup: AttackSetup
): [damage: number, hit: number] {
	const { attackRoll, damageRoll, acRoll } = getRolls();

	const roll = (r: ParsedRoll, crits = true) => {
		const result = roller.rollParsed(r);

		if (crits) {
			if (getCritical(result) === 'failure') return Number.NEGATIVE_INFINITY;
			if (getCritical(result) === 'success') return Number.POSITIVE_INFINITY;
		}

		return result.value;
	};

	let sum = 0;
	let numHit = 0;

	for (let atk = 0; atk < setup.numAttacks; atk++) {
		const attackResult =
			setup.adv === 'advantage'
				? Math.max(roll(attackRoll), roll(attackRoll))
				: setup.adv === 'disadvantage'
				? Math.min(roll(attackRoll), roll(attackRoll))
				: roll(attackRoll);
		if (
			(attackResult !== Number.POSITIVE_INFINITY && attackResult <= roll(acRoll)) ||
			attackResult === Number.NEGATIVE_INFINITY
		)
			continue;

		numHit++;
		let damage = roll(damageRoll, /* crits = */ false);
		if (attackResult === Number.POSITIVE_INFINITY) damage *= 2;

		sum += damage;
	}

	return [sum, numHit];
}

sw.addEventListener('message', (event) => {
	const data = event.data as IncomingMessage;

	const [attackString, ...vars] = data.setup.attackRoll.split('%%').map((x) => x.trim());
	const damageString = data.setup.damageRoll;
	const acString =
		typeof data.setup.versus === 'number' ? data.setup.versus.toString() : data.setup.versus;

	const roller = new DiceRoller();

	let getRolls: GetRolls;
	if (vars.length > 0) {
		const varStrings: Record<string, string> = {};
		for (const variable of vars) {
			const eq = variable.indexOf('=');
			const name = variable.slice(0, eq).trim();
			const rollString = variable.slice(eq + 1).trim();
			varStrings[name] = rollString;
		}
		getRolls = () => {
			let attack = attackString;
			let damage = damageString;
			let ac = acString;

			const entries = Object.entries(varStrings);
			const values: [string, number][] = [];

			for (let i = 0; i < entries.length; i++) {
				let [varName, varString] = entries[i];
				for (let j = 0; j < i; j++) {
					const [otherName, otherValue] = values[j];
					varString = varString.replaceAll(otherName, otherValue.toString());
				}
				const varRoll = roller.parse(varString);
				const value = roller.rollParsed(varRoll).value;
				attack = attack.replaceAll(varName, value.toString());
				damage = damage.replaceAll(varName, value.toString());
				ac = ac.replaceAll(varName, value.toString());
				values.push([varName, value]);
			}

			return {
				attackRoll: roller.parse(attack),
				damageRoll: roller.parse(damage),
				acRoll: roller.parse(ac)
			};
		};
	} else {
		const atkParsed = roller.parse(attackString);
		const dmgParsed = roller.parse(damageString);
		const acParsed = roller.parse(acString);

		getRolls = () => ({
			attackRoll: atkParsed,
			damageRoll: dmgParsed,
			acRoll: acParsed
		});
	}

	const kTrials = 1000;

	const buckets = new Map<number, number>();
	let numHit = 0;
	for (let i = 0; i < kTrials; i++) {
		const [result, n] = simulate(roller, getRolls, data.setup);
		numHit += n;
		buckets.set(result, (buckets.get(result) ?? 0) + 1);
	}

	event.source?.postMessage({
		buckets: [...buckets],
		numTrials: kTrials,
		numHit: numHit,
		nonce: data.nonce
	} satisfies ReturnMessage);
});
