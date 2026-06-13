export function delay<T>(data: T, duration = 250): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(data), duration);
  });
}
