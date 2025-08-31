// firebase-config.js
import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  enableNetwork,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// ⚠️ Garde ta configuration telle quelle
const firebaseConfig = {
  apiKey: "AIzaSyBwImSy2gHukUURjqHlH3v09emaFAz6U8E",
  authDomain: "arbre-problemes-2025.firebaseapp.com",
  projectId: "arbre-problemes-2025",
  storageBucket: "arbre-problemes-2025.firebasestorage.app",
  messagingSenderId: "433351448601",
  appId: "1:433351448601:web:88478a097068117416f288",
  measurementId: "G-2WNB30WJ57",
};

const app = initializeApp(firebaseConfig);

// Important pour les mobiles + bloqueurs (Brave, AdGuard…)
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  // bascule auto vers long-polling si nécessaire
  experimentalAutoDetectLongPolling: true,
  // évite les streams fetch parfois bloqués par les proxys/bloqueurs
  useFetchStreams: false,
  // cache local (optionnel mais confortable)
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// Force (dé)blocage réseau si besoin
enableNetwork(db).catch((err) => {
  console.warn("Erreur réseau Firebase:", err);
});

export default app;
