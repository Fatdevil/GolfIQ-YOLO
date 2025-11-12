export async function fetchMany<T>(
  ids: string[],
  fn: (id: string) => Promise<T>,
  limit = 4,
): Promise<T[]> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const results: T[] = new Array(ids.length);
  let resolved = 0;
  let cursor = 0;
  let active = 0;
  let settled = false;

  return new Promise<T[]>((resolve, reject) => {
    const maybeResolve = () => {
      if (!settled && resolved === ids.length) {
        settled = true;
        resolve(results);
      }
    };

    const kick = () => {
      if (settled || resolved === ids.length) {
        maybeResolve();
        return;
      }
      while (active < limit && cursor < ids.length) {
        const index = cursor++;
        const id = ids[index];
        active += 1;
        fn(id)
          .then((value) => {
            results[index] = value;
            resolved += 1;
            maybeResolve();
          })
          .catch((err) => {
            if (!settled) {
              settled = true;
              reject(err);
            }
          })
          .finally(() => {
            active -= 1;
            if (!settled && cursor < ids.length && resolved < ids.length) {
              kick();
            }
          });
      }
    };

    kick();
  });
}
