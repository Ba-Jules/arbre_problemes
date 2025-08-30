// firebase-config.js
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  enableNetwork,
  // (facultatif mais conseillé pour le dev hors-ligne)
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// ⚠️ Garde ta configuration telle quelle
const firebaseConfig = {
  apiKey: "AIzaSyBwImSy2gHukUURjqHlH3v09emaFAz6U8E",
  authDomain: "arbre-problemes-2025.firebaseapp.com",
  projectId: "arbre-problemes-2025",
  storageBucket: "arbre-problemes-2025.firebasestorage.app",
  messagingSenderId: "433351448601",
  appId: "1:433351448601:web:88478a097068117416f288",
  measurementId: "G-2WNB30WJ57"
};

const app = initializeApp(firebaseConfig);

// ⬇️ IMPORTANT : on force un transport qui évite les endpoints "Write/channel"
// souvent bloqués par les bloqueurs. Ça bascule automatiquement sur long-polling.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  experimentalAutoDetectLongPolling: true,
  // évite l’usage des streams fetch (plus compatibles avec certains bloqueurs/proxys)
  useFetchStreams: false,
  // cache local pour de meilleures perfs hors-ligne (optionnel)
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// Active le réseau (utile si le cache a pris le dessus)
enableNetwork(db).catch((err) => {
  console.warn('Erreur réseau Firebase:', err);
});

export default app;
