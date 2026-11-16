export type Route = { name: 'home' } | { name: 'join' } | { name: 'game'; id: string };

export function parseHash(hash: string): Route {
  if (hash === '#/rejoindre') return { name: 'join' };
  const m = /^#\/partie\/([A-Za-z0-9_-]{1,64})$/.exec(hash);
  if (m) return { name: 'game', id: m[1] };
  return { name: 'home' };
}

export const gameHash = (id: string): string => `#/partie/${id}`;
