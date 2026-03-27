import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// STEP 1: Replace these values with your own Firebase config
// (you'll get this from the Firebase console — see the setup guide)
const firebaseConfig = {
  apiKey: "AIzaSyDXTP4dpLGvOtMO5ieS5fd0nySUAPmfDL4",
  authDomain: "seconds-f99cf.firebaseapp.com",
  databaseURL: "https://seconds-f99cf-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "seconds-f99cf",
  storageBucket: "seconds-f99cf.firebasestorage.app",
  messagingSenderId: "808789359547",
  appId: "1:808789359547:web:535ffe1d2f80b1ca92a29e",
  measurementId: "G-QQD7JHXC98"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
