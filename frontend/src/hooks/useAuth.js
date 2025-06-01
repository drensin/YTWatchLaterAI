/**
 * @fileoverview Custom React hook for managing Firebase authentication,
 * application authorization, and initial YouTube linkage status.
 */
import {useState, useEffect, useCallback} from 'react';
import {auth} from '../firebase'; // Adjust path if firebase.js is elsewhere
import {GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut} from 'firebase/auth';

// Assuming CLOUD_FUNCTIONS_BASE_URL is accessible or passed in,
// or define it here if it's static and specific to this hook's needs.
// For simplicity, let's assume it's defined globally or imported if needed.
// If it's from App.js, it would need to be passed or imported from a shared config.
const CLOUD_FUNCTIONS_BASE_URL = {
  checkUserAuthorization: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/checkUserAuthorization',
};

/**
 * Custom hook to manage user authentication and authorization status.
 * Handles Firebase login/logout, checks application-level authorization,
 * and determines initial YouTube linkage based on backend check.
 *
 * @param {Function} setAppPopup Function from the main app to show popups.
 * @return {{
 *   currentUser: object|null,
 *   isLoggedIn: boolean,
 *   isAuthorizedUser: boolean,
 *   isYouTubeLinkedByAuthCheck: boolean, // YouTube link status from checkUserAuthorization
 *   authChecked: boolean,
 *   appAuthorizationError: string|null, // Specific to app-level auth errors
 *   isLoadingAuth: boolean,
 *   handleFirebaseLogin: Function,
 *   handleFirebaseLogout: Function
 * }} Auth state and handlers.
 */
function useAuth(setAppPopup) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthorizedUser, setIsAuthorizedUser] = useState(false);
  // This state reflects YouTube linkage as per checkUserAuthorization,
  // distinct from linkage status derived from OAuth redirect or API calls.
  const [isYouTubeLinkedByAuthCheck, setIsYouTubeLinkedByAuthCheck] = useState(false);
  const [appAuthorizationError, setAppAuthorizationError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true); // Start true for initial check

  // Effect for Firebase Auth State Listener & App Authorization Check
  useEffect(() => {
    setIsLoadingAuth(true);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsLoadingAuth(true); // Show loading during async checks
      setAppAuthorizationError(null); // Clear previous app auth errors

      if (user) {
        setCurrentUser(user);
        setIsLoggedIn(true);
        try {
          const idToken = await user.getIdToken();
          const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.checkUserAuthorization, {
            method: 'POST',
            headers: {'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json'},
          });
          const authZData = await response.json();

          if (response.ok && authZData.authorized) {
            setIsAuthorizedUser(true);
            setIsYouTubeLinkedByAuthCheck(!!authZData.youtubeLinked); // Set based on backend
            console.log('User is authorized by allow-list. YouTube linked per backend:', !!authZData.youtubeLinked);
          } else {
            setIsAuthorizedUser(false);
            setIsYouTubeLinkedByAuthCheck(false);
            setAppAuthorizationError(authZData.error || 'User not on allow-list.');
            console.warn('User not on allow-list or backend error:', user.email, authZData.error);
          }
        } catch (err) {
          console.error('Error checking user authorization (allow-list):', err);
          setIsAuthorizedUser(false);
          setIsYouTubeLinkedByAuthCheck(false);
          setAppAuthorizationError('Failed to verify app authorization status.');
        }
      } else { // User is logged out
        setCurrentUser(null);
        setIsLoggedIn(false);
        setIsAuthorizedUser(false);
        setIsYouTubeLinkedByAuthCheck(false);
        setAppAuthorizationError(null);
      }
      setAuthChecked(true);
      setIsLoadingAuth(false);
    });

    return () => {
      unsubscribe();
      setIsLoadingAuth(false); // Ensure loading is false on unmount
    };
  }, []); // Empty dependency array: runs once on mount, cleans up on unmount

  const handleFirebaseLogin = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    // This scope is for YouTube Data API, might be better handled by a dedicated
    // YouTube connection flow if login is just for Firebase.
    // For now, keeping it as it was in LoginButton.
    provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
    try {
      setIsLoadingAuth(true);
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle setting user states
    } catch (error) {
      console.error('Firebase login error:', error);
      setAppAuthorizationError(`Firebase login failed: ${error.message}`);
      if (setAppPopup) { // Use the passed-in popup setter
        setAppPopup({visible: true, message: `Login failed: ${error.message}`, type: 'error'});
        setTimeout(() => setAppPopup((p) => ({...p, visible: false})), 3000);
      }
    } finally {
      // setIsLoadingAuth(false); // onAuthStateChanged will set this
    }
  }, [setAppPopup]);

  const handleFirebaseLogout = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      await signOut(auth);
      // onAuthStateChanged will handle resetting states
      if (setAppPopup) {
        setAppPopup({visible: true, message: 'Logged out successfully.', type: 'info'});
        setTimeout(() => setAppPopup((p) => ({...p, visible: false})), 2000);
      }
    } catch (error) {
      console.error('Firebase logout error:', error);
      setAppAuthorizationError(`Firebase logout failed: ${error.message}`);
      if (setAppPopup) {
        setAppPopup({visible: true, message: `Logout failed: ${error.message}`, type: 'error'});
        setTimeout(() => setAppPopup((p) => ({...p, visible: false})), 3000);
      }
    } finally {
      // setIsLoadingAuth(false); // onAuthStateChanged will set this
    }
  }, [setAppPopup]);

  return {
    currentUser,
    isLoggedIn,
    isAuthorizedUser,
    isYouTubeLinkedByAuthCheck,
    authChecked,
    appAuthorizationError,
    isLoadingAuth,
    handleFirebaseLogin,
    handleFirebaseLogout,
  };
}

export default useAuth;
