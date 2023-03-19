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
  itersRequested: number;
  setup: AttackSetup;
}

export interface ReturnMessage {
  buckets: [number, { damageObservations: number; costTotal: number; atks: number }][];
  numTrials: number;
  numHit: number;
  numAttacks: number;
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
  reductionRoll: ParsedRoll;
  costRoll: ParsedRoll;
};

function simulate(
  roller: DiceRoller,
  getRolls: GetRolls,
  setup: AttackSetup
): [damage: number, attacks: number, hit: number, cost: number] {
  const { attackRoll, damageRoll, acRoll, costRoll, reductionRoll } = getRolls();

  const roll = (r: ParsedRoll, crits = true) => {
    const result = roller.rollParsed(r);

    if (crits && setup.crits.failsMiss && getCritical(result) === 'failure') {
      return Number.NEGATIVE_INFINITY;
    }
    if (crits && setup.crits.successesHit && getCritical(result) === 'success') {
      return Number.POSITIVE_INFINITY;
    }

    return result.value;
  };

  let sum = 0;
  let numHit = 0;
  let costSum = 0;
  const numAttacks = roller.rollValue(setup.numAttacks);

  for (let atk = 0; atk < numAttacks; atk++) {
    costSum += roller.rollParsed(costRoll).value;
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
    if (setup.crits.successesCrit && attackResult === Number.POSITIVE_INFINITY) damage *= 2;

    sum += Math.max(0, damage - roller.rollParsed(reductionRoll).value);
  }

  return [sum, numAttacks, numHit, costSum];
}

function parseVariables(
  s: string
): [roll: string, variables: Array<{ name: string; roll: string }>] {
  const [attackString, ...vars] = s.split('%%').map((x) => x.trim());

  return [
    attackString,
    vars.map((varString) => {
      const eq = varString.indexOf('=');
      const name = varString.slice(0, eq).trim();
      const roll = varString.slice(eq + 1).trim();

      return { name, roll };
    })
  ];
}

function hasVariables(roll: string, variables: Array<{ name: string; roll: string }>): boolean {
  for (const { name } of variables) {
    if (roll.indexOf(name) !== -1) return true;
  }
  return false;
}

function evaluateVariables(
  roller: DiceRoller,
  vars: Array<{ name: string; roll: string }>
): Array<{ name: string; value: number }> {
  const values: Array<{ name: string; value: number }> = [];

  for (let i = 0; i < vars.length; i++) {
    const { name } = vars[i];
    let { roll } = vars[i];
    for (let j = 0; j < i; j++) {
      const { name, value } = values[j];
      roll = roll.replaceAll(name, value.toString());
    }
    const value = roller.rollValue(roll);
    values.push({ name, value });
  }

  return values;
}

function replaceVariables(roll: string, values: Array<{ name: string; value: number }>): string {
  for (const { name, value } of values) {
    roll = roll.replaceAll(name, value.toString());
  }
  return roll;
}

sw.addEventListener('message', (event) => {
  const data = event.data as IncomingMessage;

  const [attackString, vars] = parseVariables(data.setup.attackRoll);

  const roller = new DiceRoller();

  const cachedAttack = hasVariables(attackString, vars)
    ? null
    : roller.parse(data.setup.attackRoll);
  const cachedDamage = hasVariables(data.setup.damageRoll, vars)
    ? null
    : roller.parse(data.setup.damageRoll);
  const cachedAc = hasVariables(data.setup.versus.toString(), vars)
    ? null
    : roller.parse(data.setup.versus.toString());
  const cachedCost = hasVariables(data.setup.cost, vars) ? null : roller.parse(data.setup.cost);
  const cachedReduction = hasVariables(data.setup.reduction, vars)
    ? null
    : roller.parse(data.setup.reduction);

  const getRolls: GetRolls = () => {
    const evaluated = evaluateVariables(roller, vars);
    const rolls = {
      acRoll: cachedAc ?? roller.parse(replaceVariables(data.setup.versus.toString(), evaluated)),
      attackRoll: cachedAttack ?? roller.parse(replaceVariables(attackString, evaluated)),
      costRoll: cachedCost ?? roller.parse(replaceVariables(data.setup.cost, evaluated)),
      damageRoll: cachedDamage ?? roller.parse(replaceVariables(data.setup.damageRoll, evaluated)),
      reductionRoll:
        cachedReduction ?? roller.parse(replaceVariables(data.setup.reduction, evaluated))
    };

    return rolls;
  };

  const buckets = new Map<
    number,
    { damageObservations: number; costTotal: number; atks: number }
  >();

  let numHit = 0;
  let numAttacks = 0;
  for (let i = 0; i < data.itersRequested; i++) {
    const [result, atk, n, cost] = simulate(roller, getRolls, data.setup);
    numHit += n;
    numAttacks += atk;
    const bucket = buckets.get(result) ?? { costTotal: 0, damageObservations: 0, atks: 0 };
    bucket.costTotal += cost;
    bucket.damageObservations += 1;
    bucket.atks += atk;
    buckets.set(result, bucket);
  }

  event.source?.postMessage({
    buckets: [...buckets],
    numTrials: data.itersRequested,
    numAttacks,
    numHit,
    nonce: data.nonce
  } satisfies ReturnMessage);
});

sw.addEventListener('install', (e) => {
  sw.skipWaiting();
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(sw.clients.claim());
});
