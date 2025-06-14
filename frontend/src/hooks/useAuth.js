/**
 * @fileoverview Custom React hook for managing Firebase authentication,
 * application authorization, and initial YouTube linkage status.
 */
import {useState, useEffect, useCallback} from 'react';
import {auth} from '../firebase'; // Adjust path if firebase.js is elsewhere
import {GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut} from 'firebase/auth';

// URLs for cloud functions, sourced from environment variables with fallbacks.
const CLOUD_FUNCTIONS_BASE_URL = {
  checkUserAuthorization: process.env.REACT_APP_CHECK_USER_AUTHORIZATION_URL || 'https://us-central1-watchlaterai-460918.cloudfunctions.net/checkUserAuthorization',
  requestSubscriptionFeedUpdate: process.env.REACT_APP_REQUEST_SUBSCRIPTION_FEED_UPDATE_URL || 'https://us-central1-watchlaterai-460918.cloudfunctions.net/requestSubscriptionFeedUpdate',
};

/**
 * Custom hook to manage user authentication and authorization status.
 * Handles Firebase login/logout, checks application-level authorization,
 * and determines initial YouTube linkage and available AI models based on a backend check.
 *
 * @param {function(PopupConfig): void} setAppPopup - Callback function from the main app to display status popups.
 * @returns {AuthHookReturn} An object containing the authentication state and handler functions.
 *
 * @typedef {object} PopupConfig
 * @property {boolean} visible - Whether the popup is visible.
 * @property {string} message - The message to display in the popup.
 * @property {string} type - The type of popup (e.g., 'info', 'error', 'success').
 *
 * @typedef {object} AuthHookReturn
 * @property {import('firebase/auth').User | null} currentUser - The current Firebase user object.
 * @property {boolean} isLoggedIn - Whether the user is currently logged in.
 * @property {boolean} isAuthorizedUser - Whether the user is authorized to use the application.
 * @property {boolean} isYouTubeLinkedByAuthCheck - True if YouTube was linked based on the initial backend check.
 * @property {boolean} isSubscriptionFeedReady - True if the user's subscription feed is ready.
 * @property {string[]} availableModels - List of available AI model IDs.
 * @property {boolean} authChecked - True once the initial Firebase auth state check has completed.
 * @property {string | null} appAuthorizationError - Error message related to application authorization.
 * @property {boolean} isLoadingAuth - True if any auth/authZ check is in progress.
 * @property {function(): Promise<void>} handleFirebaseLogin - Function to initiate Firebase login.
 * @property {function(): Promise<void>} handleFirebaseLogout - Function to initiate Firebase logout.
 */
function useAuth(setAppPopup) {
  /** @state The current Firebase user object, or null if not logged in. @type {import('firebase/auth').User|null} */
  const [currentUser, setCurrentUser] = useState(null);
  /** @state True if a user is currently logged in via Firebase. @type {boolean} */
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  /** @state True if the logged-in user is authorized to use the application (e.g., on an allow-list). @type {boolean} */
  const [isAuthorizedUser, setIsAuthorizedUser] = useState(false);
  /**
   * @state True if the user's YouTube account was linked, based on the initial backend authorization check.
   * This is distinct from linkage status derived from OAuth redirect or subsequent API calls.
   * @type {boolean}
   */
  const [isYouTubeLinkedByAuthCheck, setIsYouTubeLinkedByAuthCheck] = useState(false);
  /** @state True if the user's subscription feed is ready based on backend check. @type {boolean} */
  const [isSubscriptionFeedReady, setIsSubscriptionFeedReady] = useState(false);
  /** @state List of available Gemini model IDs fetched from the backend. @type {string[]} */
  const [availableModels, setAvailableModels] = useState([]);
  /** @state Stores any error message related to application-level authorization. @type {string|null} */
  const [appAuthorizationError, setAppAuthorizationError] = useState(null);
  /** @state True once the initial Firebase authentication state check has completed. @type {boolean} */
  const [authChecked, setAuthChecked] = useState(false);
  /** @state True if any authentication or authorization check is currently in progress. @type {boolean} */
  const [isLoadingAuth, setIsLoadingAuth] = useState(true); // Start true for initial check

  /**
   * Effect to subscribe to Firebase authentication state changes.
   * When auth state changes (login/logout), it updates user state and performs
   * an application-level authorization check against a backend service,
   * also fetching YouTube linkage status and available AI models.
   */
  useEffect(() => {
    setIsLoadingAuth(true);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsLoadingAuth(true); // Show loading during async checks
      setAppAuthorizationError(null); // Clear previous app auth errors
      setAvailableModels([]); // Reset models on auth change
      setIsSubscriptionFeedReady(false); // Reset on auth change

      if (user) {
        setCurrentUser(user);
        setIsLoggedIn(true);
        try {
          const idToken = await user.getIdToken();
          const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.checkUserAuthorization, {
            method: 'POST', // Or GET, ensure backend supports it
            headers: {'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json'},
          });
          const authZData = await response.json();

          if (response.ok && authZData.authorized) {
            setIsAuthorizedUser(true);
            const youtubeLinked = !!authZData.youtubeLinked;
            const subscriptionFeedReady = !!authZData.isSubscriptionFeedReady;
            setIsYouTubeLinkedByAuthCheck(youtubeLinked);
            setIsSubscriptionFeedReady(subscriptionFeedReady);
            setAvailableModels(authZData.availableModels || []);
            console.log('User is authorized. YouTube linked:', youtubeLinked, 'Feed Ready:', subscriptionFeedReady, 'Models:', authZData.availableModels);

            // If YouTube is linked but feed isn't ready, request an update
            if (youtubeLinked && !subscriptionFeedReady) {
              console.log('YouTube linked but subscription feed not ready. Requesting update.');
              try {
                // No need to await, let it run in background
                fetch(CLOUD_FUNCTIONS_BASE_URL.requestSubscriptionFeedUpdate, {
                  method: 'POST',
                  headers: {'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json'},
                });
              } catch (feedUpdateError) {
                console.error('Error requesting subscription feed update:', feedUpdateError);
                // Non-critical, don't block UI
              }
            }
          } else {
            setIsAuthorizedUser(false);
            setIsYouTubeLinkedByAuthCheck(false);
            setIsSubscriptionFeedReady(false);
            setAppAuthorizationError(authZData.error || 'User not on allow-list.');
            console.warn('User not on allow-list or backend error:', user.email, authZData.error);
          }
        } catch (err) {
          console.error('Error checking user authorization (allow-list) or fetching models:', err);
          setIsAuthorizedUser(false);
          setIsYouTubeLinkedByAuthCheck(false);
          setIsSubscriptionFeedReady(false);
          setAppAuthorizationError('Failed to verify app authorization status.');
        }
      } else { // User is logged out
        setCurrentUser(null);
        setIsLoggedIn(false);
        setIsAuthorizedUser(false);
        setIsYouTubeLinkedByAuthCheck(false);
        setIsSubscriptionFeedReady(false);
        setAppAuthorizationError(null);
        // setAvailableModels([]); // Already reset at the start of onAuthStateChanged callback
      }
      setAuthChecked(true);
      setIsLoadingAuth(false);
    });

    return () => {
      unsubscribe();
      setIsLoadingAuth(false); // Ensure loading is false on unmount
    };
  }, []); // Empty dependency array: runs once on mount, cleans up on unmount

  /**
   * Initiates the Firebase Google Sign-In popup flow.
   * Includes a scope for YouTube readonly access.
   * Updates loading and error states via `setAppPopup`.
   * @type {() => Promise<void>}
   */
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

  /**
   * Signs the current user out of Firebase.
   * Updates loading state and shows a popup message on success or failure.
   * @type {() => Promise<void>}
   */
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
    isSubscriptionFeedReady, // Expose new state
    availableModels, // Expose available models
    authChecked,
    appAuthorizationError,
    isLoadingAuth,
    handleFirebaseLogin,
    handleFirebaseLogout,
  };
}

export {useAuth};
