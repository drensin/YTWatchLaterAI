/**
 * @fileoverview Custom React hook for managing YouTube API interactions,
 * playlist data, video data, and the YouTube OAuth connection flow.
 */
import {useState, useEffect, useCallback} from 'react';

// URLs for YouTube related cloud functions, sourced from environment variables with fallbacks.
const CLOUD_FUNCTIONS_BASE_URL = {
  getWatchLaterPlaylist: process.env.REACT_APP_GET_PLAYLIST_ITEMS_URL || 'https://us-central1-watchlaterai-460918.cloudfunctions.net/getWatchLaterPlaylist',
  listUserPlaylists: process.env.REACT_APP_LIST_USER_PLAYLISTS_URL || 'https://us-central1-watchlaterai-460918.cloudfunctions.net/listUserPlaylists',
  handleYouTubeAuth: process.env.REACT_APP_HANDLE_YOUTUBE_AUTH_URL_FOR_HOOK || 'https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth',
  requestSubscriptionFeedUpdate: process.env.REACT_APP_REQUEST_SUBSCRIPTION_FEED_UPDATE_URL || 'https://us-central1-watchlaterai-460918.cloudfunctions.net/requestSubscriptionFeedUpdate',
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
 * @typedef {object} PopupConfig
 * @property {boolean} visible - Whether the popup is visible.
 * @property {string} message - The message to display in the popup.
 * @property {string} type - The type of popup (e.g., 'info', 'error', 'success').
 */

/**
 * @typedef {object} YouTubeHookReturn
 * @property {Array<YouTubePlaylist>} userPlaylists - List of user's YouTube playlists.
 * @property {string} selectedPlaylistId - ID of the currently selected playlist.
 * @property {React.Dispatch<React.SetStateAction<string>>} setSelectedPlaylistId - Setter for `selectedPlaylistId`.
 * @property {Array<YouTubeVideo>} videos - List of videos for the selected playlist.
 * @property {function(): Promise<boolean>} fetchUserPlaylists - Function to fetch user playlists.
 * @property {function(string): Promise<boolean>} fetchPlaylistItems - Function to fetch items for a playlist.
 * @property {function(): Promise<void>} handleConnectYouTube - Function to initiate YouTube OAuth connection.
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
 * @param {function(PopupConfig): void} setAppPopup - Function from the main app to show popups.
 * @param {boolean} initialYouTubeLinkedStatus - Initial YouTube linked status from useAuth (isYouTubeLinkedByAuthCheck).
 * @returns {YouTubeHookReturn} An object containing YouTube related state and handler functions.
 */
function useYouTube(currentUser, isLoggedIn, isAuthorizedUser, setAppPopup, initialYouTubeLinkedStatus) {
  const [isYouTubeLinked, setIsYouTubeLinked] = useState(initialYouTubeLinkedStatus);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [videos, setVideos] = useState([]);
  const [youtubeSpecificError, setYoutubeSpecificError] = useState(null);
  const [isLoadingYouTube, setIsLoadingYouTube] = useState(false);

  useEffect(() => {
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

      if (!response.ok) {
        let errorPayload = {
          error: `Failed to fetch playlists (${response.status} ${response.statusText})`,
          code: 'HTTP_ERROR',
        };
        try {
          // Try to get a JSON error body from the server
          const errorJson = await response.json();
          errorPayload = {...errorPayload, ...errorJson}; // Merge, server's error is more specific
        } catch (e) {
          // If response body wasn't JSON, try to get it as text
          try {
            const errorText = await response.text();
            if (errorText) {
              errorPayload.error = `Server error (${response.status}): ${errorText.substring(0, 150)}`;
            }
          } catch (textErr) {
            // If reading as text also fails, stick with the initial HTTP status error
          }
        }

        setIsYouTubeLinked(false);

        if (errorPayload.code === 'YOUTUBE_AUTH_REQUIRED' || errorPayload.code === 'YOUTUBE_REAUTH_REQUIRED') {
          setYoutubeSpecificError(errorPayload.error || 'YouTube authorization issue. Please connect/re-connect.');
        } else {
          setYoutubeSpecificError(errorPayload.error);
        }
        setUserPlaylists([]);
        return false; // Indicate failure
      }

      // If response.ok is true:
      const successData = await response.json(); // Expect JSON for successful response
      setUserPlaylists(successData.playlists || []);
      setIsYouTubeLinked(true);
      setYoutubeSpecificError(null);
      // Optional: if (setAppPopup) setAppPopup({visible: true, message: 'Playlists loaded!', type: 'success'});
      return true; // Indicate success
    } catch (err) { // Catch for initial fetch error, or .json() error on OK response if malformed
      setUserPlaylists([]);
      setIsYouTubeLinked(false);
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
          localStorage.removeItem('youtubeOAuthNonce');
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }
      }

      if (stateObjectFromRedirect.nonce && storedNonce === stateObjectFromRedirect.nonce) {
        if (youtubeAuthStatus === 'success') {
          if (setAppPopup) setAppPopup({visible: true, message: 'YouTube account connected successfully!', type: 'success'});
          setIsYouTubeLinked(true);
          if (isLoggedIn && isAuthorizedUser) {
            fetchUserPlaylistsInternal().then(async (playlistsFetched) => {
              if (playlistsFetched && currentUser) {
                console.log('YouTube connected and playlists fetched. Requesting subscription feed update.');
                try {
                  const idToken = await currentUser.getIdToken();
                  fetch(CLOUD_FUNCTIONS_BASE_URL.requestSubscriptionFeedUpdate, {
                    method: 'POST',
                    headers: {'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json'},
                  });
                } catch (feedUpdateError) {
                  console.error('Error requesting subscription feed update after YouTube connect:', feedUpdateError);
                }
              }
            });
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
  }, [isLoggedIn, isAuthorizedUser, fetchUserPlaylistsInternal, setAppPopup, currentUser]); // Added currentUser

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
    setVideos,
    setUserPlaylists,
    setIsYouTubeLinked,
    setYoutubeSpecificError,
  };
}

export {useYouTube};
