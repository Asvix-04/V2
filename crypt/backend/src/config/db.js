const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let db;
const FALLBACK_DB_PATH = path.join(__dirname, '../../.local-firestore.json');

const clone = (value) => JSON.parse(JSON.stringify(value));

const normalizePrivateKey = (privateKey) => {
    if (!privateKey || typeof privateKey !== 'string') {
        return privateKey;
    }

    return privateKey
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/\\n/g, '\n');
};

const loadFallbackCollections = () => {
    if (!fs.existsSync(FALLBACK_DB_PATH)) {
        return new Map();
    }

    try {
        const raw = fs.readFileSync(FALLBACK_DB_PATH, 'utf8');
        if (!raw.trim()) {
            return new Map();
        }

        const parsed = JSON.parse(raw);
        return new Map(
            Object.entries(parsed).map(([collectionName, documents]) => [
                collectionName,
                new Map(Object.entries(documents || {}))
            ])
        );
    } catch (error) {
        console.warn(`Failed to read local fallback database: ${error.message}`);
        return new Map();
    }
};

const persistFallbackCollections = (collections) => {
    const serialized = Object.fromEntries(
        [...collections.entries()].map(([collectionName, documents]) => [
            collectionName,
            Object.fromEntries(documents.entries())
        ])
    );

    fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(serialized, null, 2));
};

const createLocalFallbackFirestore = () => {
    const collections = loadFallbackCollections();

    const persist = () => persistFallbackCollections(collections);

    const getCollectionStore = (name) => {
        if (!collections.has(name)) {
            collections.set(name, new Map());
            persist();
        }
        return collections.get(name);
    };

    const makeQuery = (store, predicates = [], limitCount = null) => {
        return {
            where(field, op, value) {
                if (op !== '==') {
                    throw new Error(`In-memory Firestore only supports '==' operator. Received: ${op}`);
                }
                const predicate = (docData) => docData[field] === value;
                return makeQuery(store, [...predicates, predicate], limitCount);
            },
            limit(count) {
                return makeQuery(store, predicates, count);
            },
            async get() {
                let docs = [...store.entries()]
                    .filter(([, docData]) => predicates.every((predicate) => predicate(docData)))
                    .map(([id, docData]) => ({
                        id,
                        data: () => clone(docData)
                    }));

                if (typeof limitCount === 'number') {
                    docs = docs.slice(0, limitCount);
                }

                return {
                    empty: docs.length === 0,
                    docs
                };
            }
        };
    };

    return {
        collection(name) {
            const store = getCollectionStore(name);

            return {
                async add(data) {
                    const id = `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                    store.set(id, clone(data));
                    persist();
                    return { id };
                },
                doc(id) {
                    const resolvedId = id || `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                    return {
                        id: resolvedId,
                        async get() {
                            if (!store.has(resolvedId)) {
                                return { exists: false, id: resolvedId, data: () => undefined };
                            }
                            return {
                                exists: true,
                                id: resolvedId,
                                data: () => clone(store.get(resolvedId))
                            };
                        },
                        async set(data, options = {}) {
                            const nextData = clone(data);

                            if (options.merge && store.has(resolvedId)) {
                                store.set(resolvedId, { ...clone(store.get(resolvedId)), ...nextData });
                            } else {
                                store.set(resolvedId, nextData);
                            }

                            persist();
                        },
                        async update(data) {
                            const current = store.get(resolvedId);
                            if (!current) {
                                throw new Error(`Document ${name}/${resolvedId} does not exist`);
                            }
                            store.set(resolvedId, { ...current, ...clone(data) });
                            persist();
                        },
                        async delete() {
                            store.delete(resolvedId);
                            persist();
                        }
                    };
                },
                where(field, op, value) {
                    return makeQuery(store).where(field, op, value);
                },
                async get() {
                    const docs = [...store.entries()].map(([id, docData]) => ({
                        id,
                        data: () => clone(docData)
                    }));

                    return {
                        empty: docs.length === 0,
                        docs
                    };
                }
            };
        }
    };
};

const initializeFirebase = () => {
    try {
        // Check if Firebase is already initialized
        if (admin.apps.length > 0) {
            db = admin.firestore();
            console.log('Firebase already initialized');
            return db;
        }

        let serviceAccount = null;
        const keyPath = path.join(__dirname, '../../firebase-key.json');

        if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            serviceAccount = {
                project_id: process.env.FIREBASE_PROJECT_ID,
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                private_key: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)
            };
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS))) {
            serviceAccount = require(path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS));
        } else if (fs.existsSync(keyPath)) {
            serviceAccount = require(keyPath);
        }

        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
            });

            db = admin.firestore();
            console.log('Firebase initialized successfully');
            return db;
        }

        db = createLocalFallbackFirestore();
        console.warn(`Firebase credentials not found. Using local fallback database at ${FALLBACK_DB_PATH}.`);
        return db;

    } catch (error) {
        console.error(`Firebase initialization error: ${error.message}`);
        db = createLocalFallbackFirestore();
        console.warn(`Falling back to local fallback database at ${FALLBACK_DB_PATH} due to Firebase initialization failure.`);
        return db;
    }
};

const getFirestore = () => {
    if (!db) {
        initializeFirebase();
    }
    return db;
};

module.exports = { initializeFirebase, getFirestore };
