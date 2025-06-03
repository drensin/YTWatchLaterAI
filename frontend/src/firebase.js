/**
 * @fileoverview This file initializes and configures Firebase for the ReelWorthy application.
 * It sets up the Firebase app instance and exports the Firebase auth service.
 */
import {initializeApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyA6tkhrfL42sIJ1zVISqDMPMA6g6n_GMII',
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

export {app, auth};
