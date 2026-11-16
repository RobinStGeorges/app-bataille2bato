// Faux Firestore en mémoire, juste assez fidèle pour tester l'app sans réseau :
// documents, collections, requête « where in », écoutes en temps réel, transactions
// avec contrôle de concurrence optimiste (une transaction dont un document lu a changé
// est rejouée, comme dans le vrai Firestore).

type Data = Record<string, unknown>;
interface Ref {
  kind: 'doc' | 'col';
  path: string;
  id: string;
}
interface Query {
  kind: 'query';
  col: Ref;
  field: string;
  values: unknown[];
}

const store = new Map<string, { data: Data; version: number }>();
const listeners = new Set<() => void>();
let autoId = 0;
let versionCounter = 0;

export function resetStore(): void {
  store.clear();
  listeners.clear();
  autoId = 0;
}
export function dump(): Record<string, Data> {
  return Object.fromEntries([...store].map(([k, v]) => [k, v.data]));
}

const notify = () => [...listeners].forEach((l) => l());

function segmentsOf(base: unknown, segs: string[]): string {
  const prefix = base && typeof base === 'object' && 'path' in (base as Ref) ? (base as Ref).path : '';
  return [prefix, ...segs].filter(Boolean).join('/');
}

export function collection(base: unknown, ...segs: string[]): Ref {
  const path = segmentsOf(base, segs);
  return { kind: 'col', path, id: path.split('/').pop()! };
}

export function doc(base: unknown, ...segs: string[]): Ref {
  const path = segs.length ? segmentsOf(base, segs) : `${(base as Ref).path}/auto${++autoId}`;
  return { kind: 'doc', path, id: path.split('/').pop()! };
}

export function where(field: string, _op: 'in', values: unknown[]) {
  return { field, values };
}
export function query(col: Ref, w: { field: string; values: unknown[] }): Query {
  return { kind: 'query', col, field: w.field, values: w.values };
}

function docSnap(ref: Ref) {
  const entry = store.get(ref.path);
  const data = entry ? structuredClone(entry.data) : undefined;
  return {
    id: ref.id,
    exists: () => entry !== undefined,
    data: () => data,
    metadata: { fromCache: false },
  };
}

function colSnap(target: Ref | Query) {
  const col = target.kind === 'query' ? target.col : target;
  const docs = [...store]
    .filter(([p]) => p.startsWith(col.path + '/') && !p.slice(col.path.length + 1).includes('/'))
    .filter(([, v]) => target.kind !== 'query' || target.values.includes(v.data[target.field]))
    .map(([p, v]) => ({ id: p.split('/').pop()!, data: () => structuredClone(v.data) }));
  return { docs };
}

export function onSnapshot(target: Ref | Query, onNext: (s: never) => void, _onError?: (e: unknown) => void) {
  const fire = () => onNext((target.kind === 'doc' ? docSnap(target) : colSnap(target)) as never);
  listeners.add(fire);
  queueMicrotask(fire);
  return () => listeners.delete(fire);
}

function assertPlain(data: Data) {
  // Le vrai Firestore refuse les objets non « simples » (proxys, classes).
  JSON.stringify(data);
  structuredClone(data);
}

function write(path: string, data: Data | null) {
  if (data === null) store.delete(path);
  else store.set(path, { data: structuredClone(data), version: ++versionCounter });
}

export async function setDoc(ref: Ref, data: Data) {
  assertPlain(data);
  write(ref.path, data);
  notify();
}
export async function updateDoc(ref: Ref, patch: Data) {
  const cur = store.get(ref.path);
  if (!cur) throw Object.assign(new Error('not-found'), { code: 'not-found' });
  assertPlain(patch);
  write(ref.path, { ...cur.data, ...patch });
  notify();
}
export async function deleteDoc(ref: Ref) {
  write(ref.path, null);
  notify();
}

export async function runTransaction<T>(_db: unknown, fn: (tx: unknown) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reads = new Map<string, number | undefined>();
    const writes: [string, Data | null, 'set' | 'update'][] = [];
    const tx = {
      async get(ref: Ref) {
        reads.set(ref.path, store.get(ref.path)?.version);
        // Laisse une autre transaction s'intercaler, comme sur le réseau.
        await new Promise((r) => setTimeout(r, 0));
        return docSnap(ref);
      },
      set(ref: Ref, data: Data) {
        assertPlain(data);
        writes.push([ref.path, data, 'set']);
      },
      update(ref: Ref, data: Data) {
        assertPlain(data);
        writes.push([ref.path, data, 'update']);
      },
    };
    const result = await fn(tx);
    const conflict = [...reads].some(([p, v]) => store.get(p)?.version !== v);
    if (conflict) continue;
    for (const [p, d, mode] of writes) {
      write(p, mode === 'update' ? { ...(store.get(p)?.data ?? {}), ...d } : d);
    }
    notify();
    return result;
  }
  throw Object.assign(new Error('aborted'), { code: 'aborted' });
}
