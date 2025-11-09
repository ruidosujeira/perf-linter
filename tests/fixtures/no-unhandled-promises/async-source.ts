export async function fetchData(): Promise<string> {
  return Promise.resolve('ok');
}

export function getPromiseManually() {
  return Promise.resolve(42);
}
