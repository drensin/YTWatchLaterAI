import React, {useState, useEffect, useCallback, useRef} from 'react';
import './App.css';
import {auth} from './firebase'; // Import Firebase auth instance
import {GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut} from 'firebase/auth';

// Placeholder for Cloud Function URLs - replace with your actual URLs
const CLOUD_FUNCTIONS_BASE_URL = {
  // handleYouTubeAuth: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth', // To be replaced/removed
  getWatchLaterPlaylist: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/getWatchLaterPlaylist',
  listUserPlaylists: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/listUserPlaylists',
  categorizeVideo: 'YOUR_CATEGORIZE_VIDEO_FUNCTION_URL', // TODO: Update this if needed
  checkUserAuthorization: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/checkUserAuthorization',
  handleYouTubeAuth: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth', // Added for handleConnectYouTube
};

// Cloud Run WebSocket Service URL
const WEBSOCKET_SERVICE_URL = 'wss://gemini-chat-service-679260739905.us-central1.run.app';

// --- Components ---

/**
 * Renders a login button that uses Firebase Google Sign-In.
 * @returns {React.ReactElement} The rendered login button.
 */
function LoginButton() {
  const handleFirebaseLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Firebase login error:', error);
    }
  };
  return (
    <button onClick={handleFirebaseLogin} className='login-icon-button' title='Login with Google'>
      <img src={process.env.PUBLIC_URL + '/login.png'} alt="Login" />
    </button>
  );
}

/**
 * Renders a chat input form.
 * @param {object} props - The component's props.
 * @param {Function} props.onQuerySubmit - Callback when a query is submitted.
 * @param {boolean} props.disabled - Whether the input should be disabled.
 * @returns {React.ReactElement} The rendered chat form.
 */
function ChatInterface({onQuerySubmit, disabled}) {
  const [query, setQuery] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !disabled) {
      onQuerySubmit(query);
      setQuery('');
    }
  };
  return (
    <form onSubmit={handleSubmit}>
      <input
        type='text'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Ask about your playlist...'
        disabled={disabled}
      />
      <button type='submit' className='send-button' title='Send query' disabled={disabled}>➤</button>
    </form>
  );
}

/**
 * Renders a loading overlay with a spinner.
 * @returns {React.ReactElement} The rendered loading overlay.
 */
function LoadingOverlay() {
  return (
    <div className="loading-overlay">
      <div className="spinner"></div>
      <p>Loading...</p>
    </div>
  );
}

/**
 * Renders a status popup message.
 * @param {object} props - The component's props.
 * @param {string} props.message - The message to display.
 * @param {string} props.type - The type of popup (e.g., 'success', 'error').
 * @returns {React.ReactElement|null} The rendered popup or null if no message.
 */
function StatusPopup({message, type}) {
  if (!message) return null;
  return <div className={`status-popup ${type}`}>{message}</div>;
}

/**
 * Renders a list of videos.
 * @param {object} props - The component's props.
 * @param {Array<object>} props.videos - Array of video objects to display.
 * @returns {React.ReactElement} The rendered video list.
 */
function VideoList({videos}) {
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  if (!videos || videos.length === 0) {
    return <p>No videos to display.</p>;
  }
  const toggleDescription = (videoId) =>
    setExpandedDescriptions((prev) => ({
      ...prev, [videoId]: !prev[videoId],
    }));

  const renderDescription = (video) => {
    const description = video.description || 'No description';
    const isExpanded = expandedDescriptions[video.videoId || video.id];
    const maxLength = 200;
    if (description.length <= maxLength) {
      return <p className="video-description"><strong>Description:</strong> {description}</p>;
    }
    return (
      <p className="video-description">
        <strong>Description:</strong> {isExpanded ? description : `${description.substring(0, maxLength)}...`}
        <button onClick={() => toggleDescription(video.videoId || video.id)} className="more-less-button">
          {isExpanded ? 'Less...' : 'More...'}
        </button>
      </p>
    );
  };
  return (
    <ul className="video-list">
      {videos.map((video) => (
        <li key={video.videoId || video.id} className="video-list-item">
          {video.thumbnailUrl && (
            <img src={video.thumbnailUrl} alt={`Thumbnail for ${video.title}`} />
          )}
          <div>
            <h4>{video.title}</h4>
            {video.duration && <p><strong>Duration:</strong> {video.duration}</p>}
            {renderDescription(video)}
            {video.reason && <p style={{color: 'green', fontStyle: 'italic'}}><strong>Reason:</strong> {video.reason}</p>}
            <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="watch-link" title="Watch on YouTube">
              ▶ Watch
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

// --- Main App ---
function App() {
  const ws = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const thinkingOutputContainerRef = useRef(null);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthorizedUser, setIsAuthorizedUser] = useState(false);
  const [authorizationError, setAuthorizationError] = useState(null);
  const [isYouTubeLinked, setIsYouTubeLinked] = useState(false);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [videos, setVideos] = useState([]);
  const [suggestedVideos, setSuggestedVideos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [popup, setPopup] = useState({visible: false, message: '', type: ''});
  const [lastQuery, setLastQuery] = useState('');
  const [thinkingOutput, setThinkingOutput] = useState('');
  const [activeOutputTab, setActiveOutputTab] = useState('Results');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY_MS = 1000;
  const MAX_RECONNECT_DELAY_MS = 30000;

  const clearWebSocketTimers = useCallback(() => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = null;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
  }, []);

  const closeWebSocket = useCallback(() => {
    clearWebSocketTimers();
    if (ws.current) {
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.close();
      ws.current = null;
      console.log('WebSocket connection intentionally closed.');
    }
  }, [clearWebSocketTimers]); // ws removed as it's a ref

  const startWebSocketConnection = useCallback((playlistIdToConnect) => {
    if (!playlistIdToConnect) return;
    closeWebSocket();
    console.log('Attempting WebSocket connection...');
    ws.current = new WebSocket(WEBSOCKET_SERVICE_URL);
    setIsStreaming(false);
    ws.current.onopen = () => {
      console.log('WebSocket connected. Initializing chat...');
      setReconnectAttempt(0);
      setIsReconnecting(false);
      clearWebSocketTimers();
      ws.current.send(JSON.stringify({type: 'INIT_CHAT', payload: {playlistId: playlistIdToConnect}}));
      setPopup({visible: true, message: 'Chat service connected.', type: 'info'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 2000);
      pingIntervalRef.current = setInterval(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({type: 'PING'}));
        }
      }, 30000);
    };
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'CHAT_INITIALIZED') {
        setPopup({visible: true, message: 'Chat session ready!', type: 'success'});
        setTimeout(() => setPopup((p) => ({...p, visible: false})), 2000);
        setIsStreaming(false);
      } else if (message.type === 'STREAM_CHUNK') {
        setThinkingOutput((prev) => prev + message.payload.textChunk);
        setIsStreaming(true);
        setActiveOutputTab('Thinking');
      } else if (message.type === 'STREAM_END') {
        setSuggestedVideos(message.payload.suggestedVideos || []);
        setPopup({visible: true, message: 'Suggestions received!', type: 'success'});
        setTimeout(() => setPopup((p) => ({...p, visible: false})), 2000);
        setActiveOutputTab('Results');
        setIsStreaming(false);
      } else if (message.type === 'ERROR') {
        setError(message.error);
        setPopup({visible: true, message: `Chat Error: ${message.error}`, type: 'error'});
        setTimeout(() => setPopup((p) => ({...p, visible: false})), 5000);
        setActiveOutputTab('Results');
        setIsStreaming(false);
      }
    };
    const handleWSCloseOrError = () => {
      clearWebSocketTimers();
      if (selectedPlaylistId && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        const nextAttempt = reconnectAttempt + 1;
        setReconnectAttempt(nextAttempt);
        setIsReconnecting(true);
        const delay = Math.min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS * Math.pow(2, nextAttempt - 1));
        setPopup({visible: true, message: `Connection lost. Reconnecting (${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})...`, type: 'warning'});
        reconnectTimeoutRef.current = setTimeout(() => startWebSocketConnection(selectedPlaylistId), delay);
      } else if (selectedPlaylistId) {
        setIsReconnecting(false);
        setError('Failed to reconnect to chat service.');
        setPopup({visible: true, message: 'Failed to reconnect. Please select playlist again or refresh.', type: 'error'});
      }
    };
    ws.current.onclose = handleWSCloseOrError;
    ws.current.onerror = handleWSCloseOrError;
  }, [selectedPlaylistId, reconnectAttempt, closeWebSocket, clearWebSocketTimers, setPopup, setError, setIsReconnecting, setReconnectAttempt, pingIntervalRef, reconnectTimeoutRef]); // ws removed as it's a ref

  useEffect(() => closeWebSocket, [closeWebSocket]);

  const fetchUserPlaylists = useCallback(async () => {
    setShowOverlay(true);
    setError(null);
    // setIsYouTubeLinked(true); // REMOVED optimistic set

    if (!currentUser) {
      setError('User not logged in. Cannot fetch playlists.');
      // setIsYouTubeLinked(false); // Ensure it's false if not already
      setShowOverlay(false);
      return;
    }
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.listUserPlaylists, {headers: {'Authorization': `Bearer ${idToken}`}});
      let data = {};
      try {
        // Log headers and status before attempting to parse JSON
        const responseHeaders = {};
        response.headers.forEach((value, name) => {
          responseHeaders[name] = value;
        });
        console.log('listUserPlaylists response status:', response.status);
        console.log('listUserPlaylists response headers:', responseHeaders);

        if (!response.ok) {
          const rawText = await response.text();
          console.log('listUserPlaylists non-OK raw response text:', rawText);
          // Try to parse it as JSON, as it might still be a JSON error from the server
          try {
            data = JSON.parse(rawText);
          } catch (parseError) {
            console.error('Failed to parse non-OK listUserPlaylists response text as JSON:', parseError);
            // Use the raw text or a generic error if parsing fails
            data = {error: `Server returned non-OK status ${response.status} with non-JSON body: ${rawText.substring(0, 100)}`, code: 'SERVER_ERROR_NON_JSON'};
          }
        } else {
          data = await response.json();
        }
      } catch (e) {
        console.error('Error processing listUserPlaylists response (e.g., network error before .json() or .text()):', e);
        setError('Failed to get playlist data (network or processing error).');
        setIsYouTubeLinked(false);
        setUserPlaylists([]);
        setShowOverlay(false);
        return;
      }
      console.log('Response from listUserPlaylists (parsed data):', {status: response.status, ok: response.ok, data});

      if (!response.ok) {
        setIsYouTubeLinked(false);
        if (data && data.code === 'YOUTUBE_AUTH_REQUIRED') {
          setAuthorizationError(data.error || 'YouTube account not linked. Please connect it.');
        } else if (data && data.code === 'YOUTUBE_REAUTH_REQUIRED') {
          setAuthorizationError(data.error || 'YouTube re-authentication required. Please connect your YouTube account again.');
        } else {
          setError(data.error || data.message || response.statusText || `Failed to fetch playlists (${response.status}).`);
        }
        setUserPlaylists([]);
      } else { // response.ok
        setUserPlaylists(data.playlists || []);
        setIsYouTubeLinked(true); // Correctly set to true on success
        setAuthorizationError(null);
      }
    } catch (err) {
      console.error('Error fetching user playlists (catch block):', err);
      setUserPlaylists([]);
      setIsYouTubeLinked(false); // SET TO FALSE on caught error
      setError(err.message || 'An unexpected error occurred while fetching playlists.');
      setPopup({visible: true, message: `Error fetching playlists: ${err.message}`, type: 'error'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 5000);
    } finally {
      setShowOverlay(false);
    }
  }, [currentUser, setAuthorizationError, setError, setIsYouTubeLinked, setPopup, setShowOverlay, setUserPlaylists]); // isYouTubeLinked REMOVED from dependencies

  const fetchPlaylistItems = useCallback(async (playlistId) => {
    if (!playlistId || !currentUser) {
      setVideos([]);
      if (!currentUser) setError('User not logged in. Cannot fetch playlist items.');
      setShowOverlay(false); return;
    }
    setShowOverlay(true); setError(null); setIsYouTubeLinked(true);
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.getWatchLaterPlaylist, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}`},
        body: JSON.stringify({playlistId}),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === 'YOUTUBE_AUTH_REQUIRED') {
          setIsYouTubeLinked(false);
          setAuthorizationError(data.error || 'YouTube account not linked for this playlist.');
        } else {
          setError(data.message || response.statusText || 'Failed to fetch playlist items.');
        }
        setVideos([]); return;
      }
      setVideos(data.videos || []);
      setIsYouTubeLinked(true);
      setAuthorizationError(null);
      const playlistTitle = userPlaylists.find((p) => p.id === playlistId)?.title || 'selected playlist';
      setPopup({visible: true, message: `Loaded ${data.videos?.length || 0} videos from "${playlistTitle}".`, type: 'success'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 3000);
    } catch (err) {
      console.error('Error fetching playlist items:', err);
      setVideos([]);
      // No longer need to check isYouTubeLinked here for popup, as errors should be clearer
      setPopup({visible: true, message: `Error fetching playlist: ${err.message}`, type: 'error'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 5000);
    } finally {
      setShowOverlay(false);
    }
  }, [currentUser, userPlaylists, setAuthorizationError, setError, setIsYouTubeLinked, setPopup, setShowOverlay, setVideos]); // isYouTubeLinked REMOVED from dependencies

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const youtubeAuthStatus = urlParams.get('youtube_auth_status');
    const stateFromRedirect = urlParams.get('state');
    const oauthError = urlParams.get('error_message');
    let handledRedirect = false;
    let justLinkedYouTube = false; // Flag to indicate YouTube was just linked

    if (youtubeAuthStatus) {
      handledRedirect = true;
      const storedNonce = localStorage.getItem('youtubeOAuthNonce');
      let stateObjectFromRedirect = {};
      if (stateFromRedirect) {
        try {
          stateObjectFromRedirect = JSON.parse(atob(stateFromRedirect));
        } catch (e) {
          console.error('Error parsing state from redirect:', e);
          setAuthorizationError('Invalid state received from YouTube auth redirect.');
          setPopup({visible: true, message: 'YouTube connection failed (invalid state).', type: 'error'});
        }
      }
      if (stateObjectFromRedirect.nonce && storedNonce === stateObjectFromRedirect.nonce) {
        if (youtubeAuthStatus === 'success') {
          setPopup({visible: true, message: 'YouTube account connected successfully!', type: 'success'});
          setIsYouTubeLinked(true);
          justLinkedYouTube = true; // Set flag
        } else {
          const detailedError = oauthError || 'Unknown YouTube connection error';
          setAuthorizationError(`YouTube connection failed: ${detailedError}`);
          setPopup({visible: true, message: `YouTube connection error: ${detailedError}`, type: 'error'});
          setIsYouTubeLinked(false);
        }
      } else if (stateFromRedirect) {
        setAuthorizationError('YouTube authorization failed (security check). Please try again.');
        setPopup({visible: true, message: 'YouTube connection security check failed.', type: 'error'});
        setIsYouTubeLinked(false);
      } else if (!stateFromRedirect && youtubeAuthStatus === 'error') {
        setAuthorizationError(`YouTube connection failed: ${oauthError || 'Unknown error during OAuth flow.'}`);
        setPopup({visible: true, message: `YouTube connection error: ${oauthError || 'Unknown error.'}`, type: 'error'});
        setIsYouTubeLinked(false);
      }
      localStorage.removeItem('youtubeOAuthNonce');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    setShowOverlay(true);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setShowOverlay(true);
      if (!handledRedirect) setAuthorizationError(null);

      if (user) {
        setCurrentUser(user);
        setIsLoggedIn(true);
        try {
          const idToken = await user.getIdToken();
          const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.checkUserAuthorization, {
            method: 'POST', headers: {'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json'},
          });
          const authZData = await response.json();
          if (response.ok && authZData.authorized) {
            setIsAuthorizedUser(true);
            console.log('User is authorized by allow-list:', user.email);
            if (justLinkedYouTube) { // If YouTube was just linked successfully
              fetchUserPlaylists(); // Call fetchUserPlaylists directly
            }
            // Otherwise, fetchUserPlaylists might be called by the other useEffect
            // that watches isLoggedIn and isAuthorizedUser, if isYouTubeLinked is already true.
          } else {
            setIsAuthorizedUser(false);
            if (!authorizationError && !handledRedirect) { // Don't overwrite specific redirect error
              setAuthorizationError(authZData.error || 'User not on allow-list.');
            }
            console.warn('User not on allow-list:', user.email, authZData.error);
          }
        } catch (err) {
          console.error('Error checking user authorization (allow-list):', err);
          setIsAuthorizedUser(false);
          if (!authorizationError && !handledRedirect) {
            setAuthorizationError('Failed to verify app authorization status.');
          }
        }
      } else {
        setCurrentUser(null);
        setIsLoggedIn(false);
        setIsAuthorizedUser(false);
        setIsYouTubeLinked(false); // Correctly reset to false
        setAuthorizationError(null);
      }
      setAuthChecked(true);
      setShowOverlay(false);
    });
    return () => unsubscribe();
  }, []); // REMOVED fetchUserPlaylists from dependencies, added authorizationError back if needed after testing

  useEffect(() => {
    // This effect now more clearly handles fetching playlists when auth state is stable
    // and YouTube is believed to be linked (or has just been linked).
    if (isLoggedIn && isAuthorizedUser && isYouTubeLinked && !isLoading) {
      // Check if playlists are empty AND we didn't *just* try to fetch them (to avoid loops on error)
      // The `justLinkedYouTube` flag in the other useEffect handles the immediate fetch after linking.
      // This one handles subsequent loads or if isYouTubeLinked was true from a previous session (hypothetically).
      if (userPlaylists.length === 0 && !error && !authorizationError?.includes('not linked')) {
         // Avoid fetching if an error already exists or if it's a "not linked" error
         // as that state should lead to the "Connect YouTube" button.
        console.log('isLoggedIn, isAuthorizedUser, isYouTubeLinked are all true. Attempting to fetch playlists.');
        fetchUserPlaylists();
      }
    } else if (!isLoggedIn || !isAuthorizedUser) {
      // Clear data if user logs out or is not authorized
      setUserPlaylists([]);
      setSelectedPlaylistId('');
      setVideos([]);
      setSuggestedVideos([]);
      if (ws.current) closeWebSocket();
    }
  }, [isLoggedIn, isAuthorizedUser, closeWebSocket]); // Removed fetchUserPlaylists from here

  useEffect(() => {
    if (activeOutputTab === 'Thinking' && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop = thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, activeOutputTab]);

  const handleFirebaseLogout = async () => {
    try {
      await signOut(auth);
      setThinkingOutput('');
      closeWebSocket();
    } catch (error) {
      console.error('Firebase logout error:', error);
      setError('Failed to log out. Please try again.');
    }
  };

  const handleConnectYouTube = async () => {
    if (!currentUser) {
      setPopup({visible: true, message: 'Please log in with Firebase first.', type: 'error'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 3000); return;
    }
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('youtubeOAuthNonce', nonce);
    // Construct the finalRedirectUri from the current page's origin and pathname
    const finalRedirectUri = window.location.origin + window.location.pathname;
    const stateObject = {uid: currentUser.uid, nonce: nonce, finalRedirectUri: finalRedirectUri};
    const encodedState = btoa(JSON.stringify(stateObject));
    const scopes = 'https://www.googleapis.com/auth/youtube.readonly';
    const youtubeClientId = process.env.REACT_APP_YOUTUBE_CLIENT_ID;
    if (!youtubeClientId) {
      console.error('YouTube Client ID (REACT_APP_YOUTUBE_CLIENT_ID) is not configured.');
      setPopup({visible: true, message: 'YouTube Client ID not configured for the app.', type: 'error'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 4000); return;
    }
    const params = {
      client_id: youtubeClientId,
      redirect_uri: CLOUD_FUNCTIONS_BASE_URL.handleYouTubeAuth,
      response_type: 'code', scope: scopes, access_type: 'offline', prompt: 'consent', state: encodedState,
    };
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(params).toString()}`;
  };

  const handlePlaylistSelection = useCallback((event) => {
    const newPlaylistId = event.target.value;
    setSelectedPlaylistId(newPlaylistId);
    setSuggestedVideos([]); setThinkingOutput(''); setActiveOutputTab('Results');
    if (newPlaylistId) {
      fetchPlaylistItems(newPlaylistId);
      startWebSocketConnection(newPlaylistId);
    } else {
      setVideos([]); closeWebSocket();
    }
  }, [fetchPlaylistItems, startWebSocketConnection, closeWebSocket]);

  const refreshSelectedPlaylistItems = () => {
    if (selectedPlaylistId) {
      fetchPlaylistItems(selectedPlaylistId);
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({type: 'INIT_CHAT', payload: {playlistId: selectedPlaylistId}}));
      } else {
        startWebSocketConnection(selectedPlaylistId);
      }
    } else {
      alert('Please select a playlist first.');
    }
  };

  const handleQuerySubmit = async (query) => {
    if (!selectedPlaylistId) {
      setPopup({visible: true, message: 'Please select playlist.', type: 'error'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 3000); return;
    }
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      setPopup({visible: true, message: 'Chat not connected. Try re-selecting playlist.', type: 'error'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 5000); return;
    }
    setLastQuery(query); setError(null); setSuggestedVideos([]);
    setThinkingOutput(''); setActiveOutputTab('Thinking'); setIsStreaming(true);
    try {
      ws.current.send(JSON.stringify({type: 'USER_QUERY', payload: {query}}));
    } catch (err) {
      console.error('Error sending query via WebSocket:', err);
      setError(err.message);
      setPopup({visible: true, message: `Query error: ${err.message}`, type: 'error'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 5000);
      setActiveOutputTab('Results'); setIsStreaming(false);
    }
  };

  return (
    <div className="App">
      {showOverlay && <LoadingOverlay />}
      {popup.visible && <StatusPopup message={popup.message} type={popup.type} />}
      <header className="App-header">
        <img src={process.env.PUBLIC_URL + '/ReelWorthyLogo.png'} alt="ReelWorthy Logo" id="app-logo" />
        <div className="header-title-text">
          {authChecked && isLoggedIn && isAuthorizedUser && isYouTubeLinked && <p style={{margin: '0'}}>ReelWorthy - Chat With Your Playlists {isReconnecting && `(Reconnecting... ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`}</p>}
          {authChecked && isLoggedIn && isAuthorizedUser && !isYouTubeLinked && <p style={{margin: '0', color: 'yellow'}}>YouTube Not Connected</p>}
          {authChecked && isLoggedIn && !isAuthorizedUser && <p style={{margin: '0', color: 'orange'}}>Access Denied</p>}
          {!isLoggedIn && authChecked && <p style={{margin: '0'}}>Please log in</p>}
          {!authChecked && <p style={{margin: '0'}}>Checking auth...</p>}
        </div>
        <div className="header-login-control">
          {authChecked && !isLoggedIn && <LoginButton />}
          {authChecked && isLoggedIn && (
            <button onClick={handleFirebaseLogout} className='logout-icon-button' title='Logout'>
              <img src={process.env.PUBLIC_URL + '/logout.png'} alt="Logout" />
            </button>
          )}
        </div>
      </header>
      <main>
        {error && <p style={{color: 'red', fontWeight: 'bold'}}>App Error: {error}</p>}
        {authorizationError && <p style={{color: 'orange', fontWeight: 'bold'}}>Authorization Error: {authorizationError}</p>}
        
        {isLoggedIn && isAuthorizedUser && !isYouTubeLinked && authChecked && (
          <div style={{padding: '20px', textAlign: 'center'}}>
            <p>{authorizationError || 'Your YouTube account is not connected or the connection has expired.'}</p>
            <button onClick={handleConnectYouTube} style={{padding: '10px 20px', fontSize: '1em'}}>
              🔗 Connect YouTube Account
            </button>
          </div>
        )}

        {isLoggedIn && isAuthorizedUser && isYouTubeLinked && (
          <>
            <div>
              <label htmlFor='playlist-select'>Choose a playlist: </label>
              <select id='playlist-select' value={selectedPlaylistId} onChange={handlePlaylistSelection} disabled={isLoading || !userPlaylists || userPlaylists.length === 0}>
                <option value=''>-- Select a playlist --</option>
                {userPlaylists.map((pl) => <option key={pl.id} value={pl.id}>{pl.title} ({pl.itemCount} items)</option>)}
              </select>
              <button onClick={refreshSelectedPlaylistItems} disabled={isLoading || !selectedPlaylistId} className='refresh-button' style={{marginLeft: '10px'}} title='Refresh playlist items'>↺</button>
            </div>
            {selectedPlaylistId && (
              <>
                <ChatInterface onQuerySubmit={handleQuerySubmit} disabled={isStreaming} />
                <div className='tabs'>
                  <button onClick={() => setActiveOutputTab('Results')} className={activeOutputTab === 'Results' ? 'active' : ''} disabled={isStreaming}>
                    Results
                  </button>
                  <button onClick={() => setActiveOutputTab('Thinking')} className={activeOutputTab === 'Thinking' ? 'active' : ''} disabled={isStreaming && activeOutputTab !== 'Thinking'}>
                    Thinking
                  </button>
                </div>
                {activeOutputTab === 'Results' && (
                  <>
                    <h2>{suggestedVideos.length > 0 ? `${suggestedVideos.length} Suggested Videos` : (lastQuery ? 'No Suggestions Found' : 'Suggested Videos')}</h2>
                    {lastQuery && <p className='last-query-display'>For query: <em>"{lastQuery}"</em></p>}
                    <VideoList videos={suggestedVideos} />
                  </>
                )}
                {activeOutputTab === 'Thinking' && (
                  <>
                    <h2>Gemini is Thinking...</h2>
                    {lastQuery && <p className='last-query-display'>For query: <em>"{lastQuery}"</em></p>}
                    <div ref={thinkingOutputContainerRef} className='thinking-output-container'>
                      <pre className='thinking-output'>{thinkingOutput}</pre>
                    </div>
                  </>
                )}
              </>
            )}
            {!selectedPlaylistId && userPlaylists && userPlaylists.length > 0 && !isLoading &&
              <p>Select a playlist to see videos and get suggestions.</p>
            }
            {(!userPlaylists || userPlaylists.length === 0) && isLoggedIn && isAuthorizedUser && isYouTubeLinked &&
              !isLoading && <p>No playlists found. Try connecting YouTube or refreshing if you recently added some.</p>
            }
          </>
        )}
        {isLoggedIn && !isAuthorizedUser && authChecked && (
          <p>Your account ({currentUser?.email}) is not authorized to use this application. Please contact the administrator.</p>
        )}
        {!isLoggedIn && authChecked && (
          <p>Please log in to manage your YouTube playlists.</p>
        )}
      </main>
    </div>
  );
}

export default App;
