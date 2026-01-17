const admin = require('firebase-admin');
// const serviceAccount = require('./serviceAccountKey.json'); // DISABLED FOR DEMO

// --- DEMO CREDENTIALS (DO NOT USE IN PRODUCTION) ---
// Hardcoded to allow running in GitHub Codespaces without file upload
const serviceAccount = {
    "type": "service_account",
    "project_id": "digilab-e5246",
    "private_key_id": "f2fb0c48d36ac6722f8df29af1eb8f555bfdd8f1",
    // NOTE: Newlines in private key must be handled correctly
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDIs343IXVkoLZD\nTzN1poii7sT5ZUKVXLNOYFfvzeTgthtTN4YVNe1Nl+gP1Lifu1LauqGhd8hhlSJ5\n8cycTXYR0qSLQHwrKrFTNuAIKd/XP58tq0/HnFb6zfeh1SnSv2aWW0vxpbLpzuR7\nIj7jlZvw92/NJ6pvn9Zu1/75SxnmOXmnOR9yAtGSiCDdrE/awnhEOZIFcQDeaise\nZaevNz8zD5fq9Ah2qqoAGy1EIYf7Kw6Rix8xUXMaWpD0DemdQD2exq3JxpefYnVi\nB40GeaXTaippCWSgafOEm0cGXyA9QSZBCAPOBpTbJujL5jxzxoKwJUABp5UtCoTl\nbBQZiae3AgMBAAECggEADxvhcDm27Qi4Oor3fxo2sRAJM2kvFlrF2Nb3PRiilqlp\nlzMtMeLpvBdSeKv1QM5zp1RjdJS1jhBnFF0NSpBTnMs0aJNF2w4PZAn+hZQkGL/e\nYNbDs8LjkrqiCMR+WIeLgTLa8xRxSplbqUq5B0hXq/qZ/QzJD4wt3Wb/TTnHzQVR\nMANcFThZN4/3h4swKlgeFkCtQ6cEljOWHL/55izph0c9tshA0cWzeIa7/qad7sux\nBKOuFpf9jVG5qa1r6oFJG6iTNm2pfAE9LhfKwfySFtmXP09OCTtgVbJuuUWKK+dI\nemMHfVB3ASvUlR51zFYqVoDdplSpFk8wC3/3NWn1UQKBgQDi8gT79J9awDPTl/te\nYrTk0IVKJm40Kobm4ug/THegDsKeMrYEH4IFpRnlYoeDHKYGvQ0UnCI6Q9dAFuJx\n5jpxyC3eChct9O90WN5z1HvnfTUcDAkRu1PfTE6Hagm5uTtBBRsjoWSTmhedxJRG\nwhGrpkcd9674GbEU3/l5UhlgPwKBgQDiZVYabl7SyixcPdGdCUYhForP+X50XCce\nyT6N9l0MkIRo8yv/bVKbazxEpOmRdyAm5N7CFJnYWBTG+cGD7gf6dEjtaVUHGFz5\n+qIcITtDC6AqffBkt3R4Gewt/hy7jhmyb2gmz6sjVD/s3wArr5khlbJDFOdLt1ZF\ndFUlqiFaiQKBgQDXlXCGp+p5GvwglM+E6d9NPYhg2AD4LS3ZRtO4zbsVoO/ft+yQ\nHh41npDrBp4UPrK40/4JBgi9sJRZnWOfL0V1sONhedRrI7IUpBctkTviu14oNoan\nAXy7MpGmsWRruTpAmckeH8KbNFYa2RLB5LlEhcApB5B+vmkpm1oxlXvloQKBgQC+\nfzhhSyecxKNpBldfhNMuulIZR71A2d3NCNcLCxcmoF/aE2udJPcScbwnooAqd4tl\nbBQZiae3AgMBAAECggEADxvhcDm27Qi4Oor3fxo2sRAJM2kvFlrF2Nb3PRiilqlp\nTsWll0IQiaUJ/FP52At8keZfZnc2Xii161AGzWuZMaoWtxvVE4z8Fgvmc2Dn7Fzx\nCM8hgTJmqtiTTt1M5Re768MwsOEik+US0h1ncO1ZyQKBgQCdRoU6SITSBD/2APvq\naEeSccjVEdXLwcJM5VI5Ip/e1vTR9i9kCBtVY8V1nqZLSt7+jvsVpQaFaALnVPlP\nNjJw2tY5CGGUMlICwg7wJ8sWGR/t65lESTsPvRu/OJrBBcXURqwIr6SkENolm5ig\nqFAaa3PJXqeuxS3FCIjFgIoKpg==\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk-fbsvc@digilab-e5246.iam.gserviceaccount.com",
    "client_id": "118109457487529732337",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40digilab-e5246.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
};
// ----------------------------------------------------

const connectDB = async () => {
    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('Firebase Admin SDK Initialized -> Firestore Connected (DEMO MODE)');
        }
    } catch (error) {
        console.error('Firebase Initialization Error:', error.message);
        process.exit(1);
    }
};

const db = admin.apps.length ? admin.firestore() : null; // Access via exports if needed elsewhere, though usually admin.firestore() is global enough

module.exports = connectDB;
