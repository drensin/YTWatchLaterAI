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
 * Custom hook to manage YouTube related state and operations.
 *
 * @param {object|null} currentUser - The current Firebase user object from useAuth.
 * @param {boolean} isLoggedIn - Whether the user is logged in via Firebase.
 * @param {boolean} isAuthorizedUser - Whether the user is authorized by the app's allow-list.
 * @param {function(config: {visible: boolean, message: string, type: string}): void} setAppPopup - Function from the main app to show popups.
 * @param {boolean} initialYouTubeLinkedStatus - Initial YouTube linked status from useAuth (isYouTubeLinkedByAuthCheck).
 * @returns {object} An object containing YouTube related state and handler functions.
 * The returned object includes:
 * - `userPlaylists`: (Array<object>) List of user's YouTube playlists.
 * - `selectedPlaylistId`: (string) ID of the currently selected playlist.
 * - `setSelectedPlaylistId`: (Function) Setter for `selectedPlaylistId`.
 * - `videos`: (Array<object>) List of videos for the selected playlist.
 * - `fetchUserPlaylists`: (Function) Function to fetch user playlists.
 * - `fetchPlaylistItems`: (Function) Function to fetch items for a playlist.
 * - `handleConnectYouTube`: (Function) Function to initiate YouTube OAuth connection.
 * - `isYouTubeLinked`: (boolean) True if YouTube account is considered linked by this hook.
 * - `youtubeSpecificError`: (string|null) Error message for YouTube specific operations.
 * - `isLoadingYouTube`: (boolean) True if YouTube operations are in progress.
 * - `setVideos`: (Function) Setter for `videos`.
 * - `setUserPlaylists`: (Function) Setter for `userPlaylists`.
 * - `setIsYouTubeLinked`: (Function) Setter for `isYouTubeLinked`.
 * - `setYoutubeSpecificError`: (Function) Setter for `youtubeSpecificError`.
 */
function useYouTube(currentUser, isLoggedIn, isAuthorizedUser, setAppPopup, initialYouTubeLinkedStatus) {
  const [isYouTubeLinked, setIsYouTubeLinked] = useState(initialYouTubeLinkedStatus);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [videos, setVideos] = useState([]);
  const [youtubeSpecificError, setYoutubeSpecificError] = useState(null);
  const [isLoadingYouTube, setIsLoadingYouTube] = useState(false);

  useEffect(() => {
    // Update internal isYouTubeLinked state if the initial check from useAuth changes
    // This helps if useAuth re-evaluates and provides a new initial status.
    setIsYouTubeLinked(initialYouTubeLinkedStatus);
  }, [initialYouTubeLinkedStatus]);

  const fetchUserPlaylistsInternal = useCallback(async () => {
    if (!currentUser) {
      setYoutubeSpecificError('User not logged in. Cannot fetch playlists.');
      return false;
    }
    setIsLoadingYouTube(true);
    setYoutubeSpecificError(null);
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.listUserPlaylists, {headers: {'Authorization': `Bearer ${idToken}`}});
      let data = {};
      try {
        if (!response.ok) {
          const rawText = await response.text();
          try {
            data = JSON.parse(rawText);
          } catch (parseError) {
            data = {error: `Server returned non-OK status ${response.status} with non-JSON body: ${rawText.substring(0, 100)}`, code: 'SERVER_ERROR_NON_JSON'};
          }
        } else {
          data = await response.json();
        }
      } catch (e) {
        setYoutubeSpecificError('Failed to get playlist data (network or processing error).');
        setIsYouTubeLinked(false); setUserPlaylists([]); return false;
      }

      if (!response.ok) {
        setIsYouTubeLinked(false);
        if (data && (data.code === 'YOUTUBE_AUTH_REQUIRED' || data.code === 'YOUTUBE_REAUTH_REQUIRED')) {
          setYoutubeSpecificError(data.error || 'YouTube authorization issue. Please connect/re-connect.');
        } else {
          setYoutubeSpecificError(data.error || data.message || response.statusText || `Failed to fetch playlists (${response.status}).`);
        }
        setUserPlaylists([]); return false;
      } else {
        setUserPlaylists(data.playlists || []);
        setIsYouTubeLinked(true);
        setYoutubeSpecificError(null); return true;
      }
    } catch (err) {
      setUserPlaylists([]); setIsYouTubeLinked(false);
      setYoutubeSpecificError(err.message || 'An unexpected error occurred while fetching playlists.');
      if (setAppPopup) setAppPopup({visible: true, message: `Error fetching playlists: ${err.message}`, type: 'error'});
      return false;
    } finally {
      setIsLoadingYouTube(false);
    }
  }, [currentUser, setAppPopup]);

  const fetchPlaylistItemsInternal = useCallback(async (playlistId) => {
    if (!playlistId || !currentUser) {
      setVideos([]);
      if (!currentUser) setYoutubeSpecificError('User not logged in. Cannot fetch playlist items.');
      return false;
    }
    setIsLoadingYouTube(true); setYoutubeSpecificError(null);
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.getWatchLaterPlaylist, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}`},
        body: JSON.stringify({playlistId}),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === 'YOUTUBE_AUTH_REQUIRED' || data.code === 'YOUTUBE_REAUTH_REQUIRED') {
          setIsYouTubeLinked(false);
          setYoutubeSpecificError(data.error || 'YouTube authorization required for this playlist.');
        } else {
          setYoutubeSpecificError(data.message || response.statusText || 'Failed to fetch playlist items.');
        }
        setVideos([]); return false;
      }
      setVideos(data.videos || []);
      setIsYouTubeLinked(true);
      setYoutubeSpecificError(null);
      const playlistTitle = userPlaylists.find((p) => p.id === playlistId)?.title || 'selected playlist';
      if (setAppPopup) setAppPopup({visible: true, message: `Loaded ${data.videos?.length || 0} videos from "${playlistTitle}".`, type: 'success'});
      return true;
    } catch (err) {
      setVideos([]);
      setYoutubeSpecificError(err.message || 'An unexpected error occurred while fetching items.');
      if (setAppPopup) setAppPopup({visible: true, message: `Error fetching playlist items: ${err.message}`, type: 'error'});
      return false;
    } finally {
      setIsLoadingYouTube(false);
    }
  }, [currentUser, userPlaylists, setAppPopup]);

  // Effect for handling YouTube OAuth redirect parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const youtubeAuthStatus = urlParams.get('youtube_auth_status');
    const stateFromRedirect = urlParams.get('state');
    const oauthError = urlParams.get('error_message');

    if (youtubeAuthStatus) {
      const storedNonce = localStorage.getItem('youtubeOAuthNonce');
      let stateObjectFromRedirect = {};
      if (stateFromRedirect) {
        try {
          stateObjectFromRedirect = JSON.parse(atob(stateFromRedirect));
        } catch (e) {
          console.error('Error parsing state from redirect:', e);
          setYoutubeSpecificError('Invalid state received from YouTube auth redirect.');
          if (setAppPopup) setAppPopup({visible: true, message: 'YouTube connection failed (invalid state).', type: 'error'});
        }
      }

      if (stateObjectFromRedirect.nonce && storedNonce === stateObjectFromRedirect.nonce) {
        if (youtubeAuthStatus === 'success') {
          if (setAppPopup) setAppPopup({visible: true, message: 'YouTube account connected successfully!', type: 'success'});
          setIsYouTubeLinked(true);
          if (isLoggedIn && isAuthorizedUser) { // Check app auth status before fetching
            fetchUserPlaylistsInternal();
          }
        } else {
          const detailedError = oauthError || 'Unknown YouTube connection error';
          setYoutubeSpecificError(`YouTube connection failed: ${detailedError}`);
          if (setAppPopup) setAppPopup({visible: true, message: `YouTube connection error: ${detailedError}`, type: 'error'});
          setIsYouTubeLinked(false);
        }
      } else if (stateFromRedirect) {
        setYoutubeSpecificError('YouTube authorization failed (security check). Please try again.');
        if (setAppPopup) setAppPopup({visible: true, message: 'YouTube connection security check failed.', type: 'error'});
        setIsYouTubeLinked(false);
      } else if (!stateFromRedirect && youtubeAuthStatus === 'error') {
        setYoutubeSpecificError(`YouTube connection failed: ${oauthError || 'Unknown error during OAuth flow.'}`);
        if (setAppPopup) setAppPopup({visible: true, message: `YouTube connection error: ${oauthError || 'Unknown error.'}`, type: 'error'});
        setIsYouTubeLinked(false);
      }
      localStorage.removeItem('youtubeOAuthNonce');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [isLoggedIn, isAuthorizedUser, fetchUserPlaylistsInternal, setAppPopup]); // Dependencies

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

export default useYouTube;
