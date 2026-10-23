export const DB_NAME = 'BCRideDB';
export const DB_VERSION = 6;

let db: IDBDatabase | null = null;

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const database = (e.target as IDBOpenDBRequest).result;
      const tx = (e.target as IDBOpenDBRequest).transaction as IDBTransaction;
      if (!database.objectStoreNames.contains('vehicles')) database.createObjectStore('vehicles', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('logs')) {
        const ls = database.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        ls.createIndex('vehicleId', 'vehicleId', { unique: false });
      } else {
        const ls = tx.objectStore('logs');
        if (!ls.indexNames.contains('vehicleId')) ls.createIndex('vehicleId', 'vehicleId', { unique: false });
      }
      if (!database.objectStoreNames.contains('checklists')) database.createObjectStore('checklists', { keyPath: 'id', autoIncrement: true });
      if (!database.objectStoreNames.contains('rides')) {
        const rs = database.createObjectStore('rides', { keyPath: 'id', autoIncrement: true });
        rs.createIndex('startTime', 'start', { unique: false });
        rs.createIndex('vehicleId', 'vehicleId', { unique: false });
      }
    };
    req.onsuccess = e => {
      db = (e.target as IDBOpenDBRequest).result;
      resolve(db);
    };
    req.onerror = e => reject((e.target as IDBOpenDBRequest).error);
    req.onblocked = () => reject(new Error('Database diblokir. Tutup tab lain lalu reload.'));
  });
}

export function dbAction<T = unknown>(
  store: string,
  action: 'get' | 'getAll' | 'getIndex' | 'add' | 'put' | 'delete' | 'clear',
  data: unknown = null,
  indexName: string | null = null,
  indexValue: IDBValidKey | null = null,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database belum siap'));
    const readonly = ['get', 'getAll', 'getIndex'].includes(action);
    const tx = db.transaction([store], readonly ? 'readonly' : 'readwrite');
    const obj = tx.objectStore(store);
    let req: IDBRequest;
    if (action === 'add' || action === 'put') req = obj[action](data);
    else if (action === 'get') req = obj.get(data as IDBValidKey);
    else if (action === 'getAll') req = obj.getAll();
    else if (action === 'delete') req = obj.delete(data as IDBValidKey);
    else if (action === 'clear') req = obj.clear();
    else if (action === 'getIndex') req = obj.index(indexName as string).getAll(IDBKeyRange.only(indexValue as IDBValidKey));
    else return reject(new Error('Unknown action'));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = e => reject((e.target as IDBRequest).error);
  });
}
