const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let db;

const createInMemoryFirestore = () => {
    const collections = new Map();

    const clone = (value) => JSON.parse(JSON.stringify(value));

    const getCollectionStore = (name) => {
        if (!collections.has(name)) {
            collections.set(name, new Map());
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
                        async set(data) {
                            store.set(resolvedId, clone(data));
                        },
                        async update(data) {
                            const current = store.get(resolvedId);
                            if (!current) {
                                throw new Error(`Document ${name}/${resolvedId} does not exist`);
                            }
                            store.set(resolvedId, { ...current, ...clone(data) });
                        },
                        async delete() {
                            store.delete(resolvedId);
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
                private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
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

        db = createInMemoryFirestore();
        console.warn('Firebase credentials not found. Using in-memory database for development.');
        return db;

    } catch (error) {
        console.error(`Firebase initialization error: ${error.message}`);
        db = createInMemoryFirestore();
        console.warn('Falling back to in-memory database due to Firebase initialization failure.');
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
