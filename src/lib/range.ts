export function range(start: number, end: number, step = 1) {
  return {
    map: <T>(fn: (i: number) => T): Array<T> => {
      const arr: T[] = [];
      for (let i = start; i < end; i += step) {
        arr.push(fn(i));
      }
      return arr;
    }
  };
}
