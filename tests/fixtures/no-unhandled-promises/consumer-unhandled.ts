import { fetchData, getPromiseManually } from './async-source';

export function load(): void {
  fetchData();
  getPromiseManually();
}
