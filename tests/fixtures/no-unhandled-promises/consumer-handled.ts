import { fetchData, getPromiseManually } from './async-source';

export async function load(): Promise<void> {
  await fetchData();
  await getPromiseManually();
}
