/**
 * @fileoverview Custom React hook for managing YouTube API interactions,
 * playlist data, video data, and the YouTube OAuth connection flow.
 */
import {useState, useEffect, useCallback} from 'react';

// This will be imported from a shared config or App.js if not defined here.
// For now, defining it here for clarity of the hook's dependencies.
const CLOUD_FUNCTIONS_BASE_URL = {
  getWatchLaterPlaylist: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/getWatchLaterPlaylist',
  listUserPlaylists: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/listUserPlaylists',
  handleYouTubeAuth: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth',
};

/**
 * @typedef {object} YouTubePlaylist
 * @property {string} id - The ID of the playlist.
 * @property {string} title - The title of the playlist.
 * @property {number} itemCount - The number of items in the playlist.
 * @property {string} [thumbnailUrl] - Optional URL for the playlist thumbnail.
 */

/**
 * @typedef {object} YouTubeVideo
 * @property {string} id - The ID of the video item in the playlist (usually different from videoId).
 * @property {string} videoId - The actual YouTube video ID.
 * @property {string} title - The title of the video.
 * @property {string} [thumbnailUrl] - URL of the video's thumbnail.
 * @property {string} [duration] - Formatted duration of the video (e.g., "PT1M30S").
 * @property {string} [description] - Snippet of the video's description.
 * @property {string} [channelTitle] - The title of the channel that uploaded the video.
 * @property {string} [publishedAt] - The publication date of the video (ISO string).
 */

/**
 * @typedef {object} YouTubeHookReturn
 * @property {Array<YouTubePlaylist>} userPlaylists - List of user's YouTube playlists.
 * @property {string} selectedPlaylistId - ID of the currently selected playlist.
 * @property {React.Dispatch<React.SetStateAction<string>>} setSelectedPlaylistId - Setter for `selectedPlaylistId`.
 * @property {Array<YouTubeVideo>} videos - List of videos for the selected playlist.
 * @property {() => Promise<boolean>} fetchUserPlaylists - Function to fetch user playlists.
 * @property {(playlistId: string) => Promise<boolean>} fetchPlaylistItems - Function to fetch items for a playlist.
 * @property {() => Promise<void>} handleConnectYouTube - Function to initiate YouTube OAuth connection.
 * @property {boolean} isYouTubeLinked - True if YouTube account is considered linked by this hook.
 * @property {string|null} youtubeSpecificError - Error message for YouTube specific operations.
 * @property {boolean} isLoadingYouTube - True if YouTube operations are in progress.
 * @property {React.Dispatch<React.SetStateAction<Array<YouTubeVideo>>>} setVideos - Setter for `videos`.
 * @property {React.Dispatch<React.SetStateAction<Array<YouTubePlaylist>>>} setUserPlaylists - Setter for `userPlaylists`.
 * @property {React.Dispatch<React.SetStateAction<boolean>>} setIsYouTubeLinked - Setter for `isYouTubeLinked`.
 * @property {React.Dispatch<React.SetStateAction<string|null>>} setYoutubeSpecificError - Setter for `youtubeSpecificError`.
 */

/**
 * Custom hook to manage YouTube related state and operations, including OAuth flow,
 * fetching playlists, and fetching videos for a selected playlist.
 *
 * @param {import('firebase/auth').User|null} currentUser - The current Firebase user object from useAuth.
 * @param {boolean} isLoggedIn - Whether the user is logged in via Firebase.
 * @param {boolean} isAuthorizedUser - Whether the user is authorized by the app's allow-list.
 * @param {(config: {visible: boolean, message: string, type: string}) => void} setAppPopup - Function from the main app to show popups.
 * @param {boolean} initialYouTubeLinkedStatus - Initial YouTube linked status from useAuth (isYouTubeLinkedByAuthCheck).
 * @returns {YouTubeHookReturn} An object containing YouTube related state and handler functions.
 */
function useYouTube(currentUser, isLoggedIn, isAuthorizedUser, setAppPopup, initialYouTubeLinkedStatus) {
  /** @state Tracks if the user's YouTube account is currently considered linked. Initialized by `initialYouTubeLinkedStatus`. @type {boolean} */
  const [isYouTubeLinked, setIsYouTubeLinked] = useState(initialYouTubeLinkedStatus);
  /** @state Stores the list of the user's YouTube playlists. @type {Array<YouTubePlaylist>} */
  const [userPlaylists, setUserPlaylists] = useState([]);
  /** @state Stores the ID of the currently selected YouTube playlist. @type {string} */
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  /** @state Stores the list of videos for the currently selected playlist. @type {Array<YouTubeVideo>} */
  const [videos, setVideos] = useState([]);
  /** @state Stores any error messages specific to YouTube operations. @type {string|null} */
  const [youtubeSpecificError, setYoutubeSpecificError] = useState(null);
  /** @state Flag indicating if any YouTube-related operations (fetching playlists/items) are in progress. @type {boolean} */
  const [isLoadingYouTube, setIsLoadingYouTube] = useState(false);

  /**
   * Effect to synchronize the internal `isYouTubeLinked` state with the
   * `initialYouTubeLinkedStatus` prop. This prop might change if `useAuth` re-evaluates
   * (e.g., after a token refresh that re-checks backend authorization).
   */
  useEffect(() => {
    // Update internal isYouTubeLinked state if the initial check from useAuth changes
    // This helps if useAuth re-evaluates and provides a new initial status.
    setIsYouTubeLinked(initialYouTubeLinkedStatus);
  }, [initialYouTubeLinkedStatus]);

  /**
   * Fetches the list of the current user's YouTube playlists from the backend.
   * Requires the user to be logged in. Updates `userPlaylists`, `isYouTubeLinked`,
   * and `youtubeSpecificError` states based on the outcome.
   * This function is intended for internal use by the hook and is wrapped by an exported version.
   * @type {() => Promise<boolean>}
   */
  const fetchUserPlaylistsInternal = useCallback(async () => {
    if (!currentUser) {
      setYoutubeSpecificError('User not logged in. Cannot fetch playlists.');
      return false;
    }
    setIsLoadingYouTube(true);
    setYoutubeSpecificError(null); // Clear previous errors
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.listUserPlaylists, {headers: {'Authorization': `Bearer ${idToken}`}});
      let data = {}; // Initialize data to handle potential non-JSON responses gracefully

      // Attempt to parse response, robustly handling non-JSON or error statuses
      try {
        if (!response.ok) {
          const rawText = await response.text(); // Get raw text for detailed error
          try {
            data = JSON.parse(rawText); // Try to parse as JSON if possible
          } catch (parseError) {
            // If parsing fails, use the raw text in the error
            data = {error: `Server returned non-OK status ${response.status} with non-JSON body: ${rawText.substring(0, 100)}`, code: 'SERVER_ERROR_NON_JSON'};
          }
        } else {
          data = await response.json(); // Standard JSON parsing for OK responses
        }
      } catch (e) {
        // Catch network errors or issues during response.json()/text()
        setYoutubeSpecificError('Failed to get playlist data (network or processing error).');
        setIsYouTubeLinked(false); setUserPlaylists([]); return false;
      }

      if (!response.ok) {
        setIsYouTubeLinked(false); // Assume not linked if fetching playlists fails
        // Handle specific error codes from backend
        if (data && (data.code === 'YOUTUBE_AUTH_REQUIRED' || data.code === 'YOUTUBE_REAUTH_REQUIRED')) {
          setYoutubeSpecificError(data.error || 'YouTube authorization issue. Please connect/re-connect.');
        } else {
          // Generic error message
          setYoutubeSpecificError(data.error || data.message || response.statusText || `Failed to fetch playlists (${response.status}).`);
        }
        setUserPlaylists([]); return false;
      } else {
        // Success case
        setUserPlaylists(data.playlists || []);
        setIsYouTubeLinked(true); // Successfully fetched, so YouTube is linked
        setYoutubeSpecificError(null); return true;
      }
    } catch (err) {
      // Catch errors from getIdToken or other unexpected issues
      setUserPlaylists([]); setIsYouTubeLinked(false);
      setYoutubeSpecificError(err.message || 'An unexpected error occurred while fetching playlists.');
      if (setAppPopup) setAppPopup({visible: true, message: `Error fetching playlists: ${err.message}`, type: 'error'});
      return false;
    } finally {
      setIsLoadingYouTube(false);
    }
  }, [currentUser, setAppPopup]);

  /**
   * Fetches the items (videos) for a specific playlist ID from the backend.
   * Requires the user to be logged in and a playlist ID to be provided.
   * Updates `videos`, `isYouTubeLinked`, and `youtubeSpecificError` states.
   * This function is intended for internal use by the hook and is wrapped by an exported version.
   * @param {string} playlistId - The ID of the playlist to fetch items for.
   * @type {(playlistId: string) => Promise<boolean>}
   */
  const fetchPlaylistItemsInternal = useCallback(async (playlistId) => {
    if (!playlistId || !currentUser) {
      setVideos([]); // Clear videos if no playlist or user
      if (!currentUser) setYoutubeSpecificError('User not logged in. Cannot fetch playlist items.');
      return false;
    }
    setIsLoadingYouTube(true); setYoutubeSpecificError(null); // Clear previous errors
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.getWatchLaterPlaylist, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}`},
        body: JSON.stringify({playlistId}),
      });
      const data = await response.json(); // Assume JSON response for simplicity here, add robust parsing if needed
      if (!response.ok) {
        if (data.code === 'YOUTUBE_AUTH_REQUIRED' || data.code === 'YOUTUBE_REAUTH_REQUIRED') {
          setIsYouTubeLinked(false); // Mark as not linked if auth is required
          setYoutubeSpecificError(data.error || 'YouTube authorization required for this playlist.');
        } else {
          setYoutubeSpecificError(data.message || response.statusText || 'Failed to fetch playlist items.');
        }
        setVideos([]); return false;
      }
      // Success case
      setVideos(data.videos || []);
      setIsYouTubeLinked(true); // Successfully fetched, so YouTube is linked
      setYoutubeSpecificError(null);
      const playlistTitle = userPlaylists.find((p) => p.id === playlistId)?.title || 'selected playlist';
      if (setAppPopup) setAppPopup({visible: true, message: `Loaded ${data.videos?.length || 0} videos from "${playlistTitle}".`, type: 'success'});
      return true;
    } catch (err) {
      // Catch errors from getIdToken or other unexpected issues
      setVideos([]);
      setYoutubeSpecificError(err.message || 'An unexpected error occurred while fetching items.');
      if (setAppPopup) setAppPopup({visible: true, message: `Error fetching playlist items: ${err.message}`, type: 'error'});
      return false;
    } finally {
      setIsLoadingYouTube(false);
    }
  }, [currentUser, userPlaylists, setAppPopup]);

  /**
   * Effect to handle the OAuth redirect from YouTube after the user attempts to connect their account.
   * It parses URL parameters (`youtube_auth_status`, `state`, `error_message`) set by the
   * `handleYouTubeAuth` Cloud Function. It validates the OAuth state nonce for security,
   * updates the `isYouTubeLinked` state, and shows appropriate popups.
   * Finally, it cleans up the URL parameters.
   */
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const youtubeAuthStatus = urlParams.get('youtube_auth_status');
    const stateFromRedirect = urlParams.get('state');
    const oauthError = urlParams.get('error_message');

    // Only process if youtube_auth_status parameter is present
    if (youtubeAuthStatus) {
      const storedNonce = localStorage.getItem('youtubeOAuthNonce');
      let stateObjectFromRedirect = {};

      // Safely parse the state from redirect
      if (stateFromRedirect) {
        try {
          stateObjectFromRedirect = JSON.parse(atob(stateFromRedirect));
        } catch (e) {
          console.error('Error parsing state from redirect:', e);
          setYoutubeSpecificError('Invalid state received from YouTube auth redirect.');
          if (setAppPopup) setAppPopup({visible: true, message: 'YouTube connection failed (invalid state).', type: 'error'});
          // Clear nonce and URL params even on parse error to prevent re-processing
          localStorage.removeItem('youtubeOAuthNonce');
          window.history.replaceState({}, document.title, window.location.pathname);
          return; // Stop further processing
        }
      }

      // Validate nonce
      if (stateObjectFromRedirect.nonce && storedNonce === stateObjectFromRedirect.nonce) {
        if (youtubeAuthStatus === 'success') {
          if (setAppPopup) setAppPopup({visible: true, message: 'YouTube account connected successfully!', type: 'success'});
          setIsYouTubeLinked(true);
          // Fetch playlists only if user is fully authenticated and authorized at app level
          if (isLoggedIn && isAuthorizedUser) {
            fetchUserPlaylistsInternal();
          }
        } else { // youtubeAuthStatus is 'error' or other unexpected value
          const detailedError = oauthError || 'Unknown YouTube connection error';
          setYoutubeSpecificError(`YouTube connection failed: ${detailedError}`);
          if (setAppPopup) setAppPopup({visible: true, message: `YouTube connection error: ${detailedError}`, type: 'error'});
          setIsYouTubeLinked(false);
        }
      } else if (stateFromRedirect) { // Nonce mismatch or missing nonce in parsed state
        setYoutubeSpecificError('YouTube authorization failed (security check). Please try again.');
        if (setAppPopup) setAppPopup({visible: true, message: 'YouTube connection security check failed.', type: 'error'});
        setIsYouTubeLinked(false);
      } else if (!stateFromRedirect && youtubeAuthStatus === 'error') {
        // Case where state might be missing but error is reported directly
        setYoutubeSpecificError(`YouTube connection failed: ${oauthError || 'Unknown error during OAuth flow.'}`);
        if (setAppPopup) setAppPopup({visible: true, message: `YouTube connection error: ${oauthError || 'Unknown error.'}`, type: 'error'});
        setIsYouTubeLinked(false);
      }

      // Clean up: remove nonce from local storage and clear URL parameters
      localStorage.removeItem('youtubeOAuthNonce');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [isLoggedIn, isAuthorizedUser, fetchUserPlaylistsInternal, setAppPopup]); // Dependencies

  /**
   * Initiates the YouTube OAuth connection flow by redirecting the user to Google's OAuth page.
   * It generates a unique nonce for security, stores it in `localStorage`, and includes it
   * in the state parameter sent to the OAuth provider. The `handleYouTubeAuth` Cloud Function
   * will later use this nonce for validation.
   * Requires the user to be logged in via Firebase.
   * @type {() => Promise<void>}
   */
  const handleConnectYouTube = useCallback(async () => {
    if (!currentUser) {
      if (setAppPopup) setAppPopup({visible: true, message: 'Please log in with Firebase first.', type: 'error'});
      return;
    }
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('youtubeOAuthNonce', nonce);
    const finalRedirectUri = window.location.origin + window.location.pathname;
    const stateObject = {uid: currentUser.uid, nonce: nonce, finalRedirectUri: finalRedirectUri};
    const encodedState = btoa(JSON.stringify(stateObject));
    const scopes = 'https://www.googleapis.com/auth/youtube.readonly';
    const youtubeClientId = process.env.REACT_APP_YOUTUBE_CLIENT_ID;

    if (!youtubeClientId) {
      console.error('YouTube Client ID (REACT_APP_YOUTUBE_CLIENT_ID) is not configured.');
      if (setAppPopup) setAppPopup({visible: true, message: 'YouTube Client ID not configured for the app.', type: 'error'});
      return;
    }
    const params = {
      client_id: youtubeClientId,
      redirect_uri: CLOUD_FUNCTIONS_BASE_URL.handleYouTubeAuth,
      response_type: 'code', scope: scopes, access_type: 'offline', prompt: 'consent', state: encodedState,
    };
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(params).toString()}`;
  }, [currentUser, setAppPopup]);

  return {
    userPlaylists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    videos,
    fetchUserPlaylists: fetchUserPlaylistsInternal,
    fetchPlaylistItems: fetchPlaylistItemsInternal,
    handleConnectYouTube,
    isYouTubeLinked,
    youtubeSpecificError,
    isLoadingYouTube,
    setVideos, // Expose setVideos if App.js needs to clear it directly
    setUserPlaylists, // Expose setUserPlaylists if App.js needs to clear it
    setIsYouTubeLinked, // Expose if App.js needs to directly manipulate (e.g. on logout)
    setYoutubeSpecificError, // Expose if App.js needs to clear it
  };
}

export {useYouTube};
