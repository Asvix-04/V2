const dotenv = require('dotenv');
const path = require('path');
// Node bridge .env is in the same directory as this script (after cd crypt/backend)
dotenv.config({ path: path.resolve(__dirname, '.env') });

const key = process.env.FIREBASE_PRIVATE_KEY;
console.log("Length:", key ? key.length : 'NULL');
console.log("JSON Stringified:", JSON.stringify(key));
