/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import type { AttackSetup } from './routes/+page.svelte';

const sw = self as unknown as ServiceWorkerGlobalScope;

function roll(s: number) {
	return Math.ceil(Math.random() * s);
}

function simulate(attack: AttackSetup): number {
  let sum = 0;
  for (let atk = 0; atk < attack.nattacks; atk++) {
    const attackRoll = attack.type === 'advantage' ? Math.max(roll(20), roll(20)) : attack.type === 'disadvantage' ? Math.min(roll(20), roll(20)) : roll(20);
    if (attackRoll !== 20 && attackRoll + attack.modattack <= attack.ac || attackRoll === 1) continue;

    let damageRaw = 0;
    for (let dmg = 0; dmg < attack.n; dmg++) {
      damageRaw += roll(attack.s);
    };
    damageRaw += attack.mod;
    if (attackRoll === 20) damageRaw *= 2;

    sum += damageRaw;
  }

  return sum;
}

sw.addEventListener('message', (event) => {
	const data = event.data as { setup: AttackSetup; nonce: number };

	const samples: number[] = [];
  for (let i = 0; i < 1000000; i++) {
		samples.push(simulate(data.setup));
	}

	event.source?.postMessage({ samples, nonce: data.nonce });
});
