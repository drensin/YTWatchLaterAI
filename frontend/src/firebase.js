/**
 * @fileoverview This file initializes and configures Firebase for the ReelWorthy application.
 * It sets up the Firebase app instance and exports the Firebase auth service.
 */
import {initializeApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyCZFNosMQwC96PHjdfgLLa9ru4zctDFJtI',
  authDomain: 'watchlaterai-460918.firebaseapp.com',
  projectId: 'watchlaterai-460918',
  storageBucket: 'watchlaterai-460918.firebasestorage.app', // Using the value you provided
  messagingSenderId: '679260739905',
  appId: '1:679260739905:web:1c3dbcdd694526f0ca29c0',
  // measurementId is not present in your config, so it's omitted.
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);

/**
 * The initialized Firebase app instance.
 * @type {import('firebase/app').FirebaseApp}
 */
export {app};

/**
 * The Firebase Authentication service instance.
 * @type {import('firebase/auth').Auth}
 */
export {auth};
