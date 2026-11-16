// Remplaçant de famille-core pour les tests : même API publique utilisée par l'app.
import { writable } from 'svelte/store';
import { collection } from './fakeFirestore';

export class FamilleError extends Error {}
export const toFrenchMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const getServices = () => ({ db: {} });
export const appCollection = (fid: string, appId: string, ...segs: string[]) =>
  collection(null, 'families', fid, 'apps', appId, ...segs);
export const session = writable<Record<string, unknown>>({ status: 'loading' });
export const signIn = async () => {};
