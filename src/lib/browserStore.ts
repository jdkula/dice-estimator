import { browser } from '$app/environment';
import { writable, type Writable } from 'svelte/store';

export function persistentStore<T>(key: string, def: T): Writable<T> {
  const store = writable(def);

  if (browser) {
    if (localStorage.getItem(key)) {
      store.set(JSON.parse(localStorage.getItem(key)));
    }
    store.subscribe((value) => {
      if (value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    });
  }

  return store;
}
