import React, {useState, useEffect, useCallback, useRef} from 'react';
import './App.css';

// Placeholder for Cloud Function URLs - replace with your actual URLs
const CLOUD_FUNCTIONS_BASE_URL = {
  handleYouTubeAuth: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth',
  getWatchLaterPlaylist: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/getWatchLaterPlaylist',
  listUserPlaylists: 'https://us-central1-watchlaterai-460918.cloudfunctions.net/listUserPlaylists',
  categorizeVideo: 'YOUR_CATEGORIZE_VIDEO_FUNCTION_URL',
};

// Cloud Run WebSocket Service URL
const WEBSOCKET_SERVICE_URL = 'wss://gemini-chat-service-679260739905.us-central1.run.app';

// --- Components ---

/**
 * Renders a login button that redirects to the YouTube authentication flow.
 * @param {object} props - The component's props.
 * @param {Function} props.onLoginSuccess - Callback function (currently unused).
 * @returns {React.ReactElement} The rendered login button.
 */
function LoginButton({onLoginSuccess}) {
  /**
   * Handles the login button click by redirecting to the auth URL.
   */
  const handleLogin = () => {
    window.location.href = CLOUD_FUNCTIONS_BASE_URL.handleYouTubeAuth;
  };
  // Return an icon button instead of text
  return <button onClick={handleLogin} className="login-icon-button" title="Login with YouTube">👤</button>;
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
  /**
   * Handles the form submission for the chat query.
   * @param {React.SyntheticEvent} e - The form submission event.
   */
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
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask about your playlist..."
        disabled={disabled}
      />
      <button type="submit" className="send-button" title="Send query" disabled={disabled}>➤</button>
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
  /**
   * Toggles the expanded state of a video's description.
   * @param {string} videoId - The ID of the video.
   */
  const toggleDescription = (videoId) =>
    setExpandedDescriptions((prev) => ({
      ...prev, [videoId]: !prev[videoId],
    }));

  /**
   * Renders the description for a video, with a toggle for long descriptions.
   * @param {object} video - The video object.
   * @returns {React.ReactElement} The rendered video description.
   */
  const renderDescription = (video) => {
    const description = video.description || 'No description';
    const isExpanded = expandedDescriptions[video.videoId || video.id];
    const maxLength = 200;
    if (description.length <= maxLength) {
      return (
        <p className="video-description">
          <strong>Description:</strong> {description}
        </p>
      );
    }
    return (
      <p className="video-description">
        <strong>Description:</strong> {
          isExpanded ?
            description :
            `${description.substring(0, maxLength)}...`
        }
        <button
          onClick={() => toggleDescription(video.videoId || video.id)}
          className="more-less-button">
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
            <img
              src={video.thumbnailUrl}
              alt={`Thumbnail for ${video.title}`}
              style={{
                width: '120px',
                height: '90px',
                marginRight: '10px',
                float: 'left',
              }}
            />
          )}
          <div style={{overflow: 'hidden'}}>
            <h4>{video.title}</h4>
            {video.duration && (
              <p><strong>Duration:</strong> {video.duration}</p>
            )}
            {renderDescription(video)}
            {video.reason && (
              <p style={{color: 'green', fontStyle: 'italic'}}>
                <strong>Reason:</strong> {video.reason}
              </p>
            )}
            <a
              href={`https://www.youtube.com/watch?v=${video.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="watch-link"
              title="Watch on YouTube">
                ▶ Watch
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

// --- Main App ---
/**
 * Main application component.
 * Manages state for authentication, playlists, videos, chat, and UI.
 * @returns {React.ReactElement} The rendered App component.
 */
function App() {
  const ws = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  // Ref for the thinking output container
  const thinkingOutputContainerRef = useRef(null);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [videos, setVideos] = useState([]); // Main playlist videos
  const [suggestedVideos, setSuggestedVideos] = useState([]);
  const [isLoading, setIsLoading] = useState(false); // General loading
  const [error, setError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false); // Auth/playlist load
  const [popup, setPopup] = useState({
    visible: false, message: '', type: '',
  });
  const [lastQuery, setLastQuery] = useState('');

  const [thinkingOutput, setThinkingOutput] = useState('');
  const [activeOutputTab, setActiveOutputTab] = useState('Results');
  const [isStreaming, setIsStreaming] = useState(false);

  // Reconnection state
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY_MS = 1000;
  const MAX_RECONNECT_DELAY_MS = 30000;

  /**
   * Clears WebSocket related timers (ping and reconnect).
   */
  const clearWebSocketTimers = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    pingIntervalRef.current = null;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectTimeoutRef.current = null;
  }, [pingIntervalRef, reconnectTimeoutRef]);

  /**
   * Closes the WebSocket connection and clears associated timers.
   */
  const closeWebSocket = useCallback(() => {
    clearWebSocketTimers();
    if (ws.current) {
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.close();
      ws.current = null;
      console.log('WebSocket connection intentionally closed.');
    }
  }, [clearWebSocketTimers, ws]);

  /**
   * Starts or restarts the WebSocket connection.
   * @param {string} playlistIdToConnect - The ID of the playlist to connect for.
   */
  const startWebSocketConnection = useCallback((playlistIdToConnect) => {
    if (!playlistIdToConnect) {
      return;
    }
    closeWebSocket();

    console.log('Attempting WebSocket connection...');
    ws.current = new WebSocket(WEBSOCKET_SERVICE_URL);
    setIsStreaming(false);

    ws.current.onopen = () => {
      console.log('WebSocket connected. Initializing chat...');
      setReconnectAttempt(0);
      setIsReconnecting(false);
      clearWebSocketTimers();

      ws.current.send(JSON.stringify({
        type: 'INIT_CHAT', payload: {playlistId: playlistIdToConnect},
      }));
      setPopup({
        visible: true, message: 'Chat service connected.', type: 'info',
      });
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 2000);

      pingIntervalRef.current = setInterval(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({type: 'PING'}));
        }
      }, 30000);
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('WS Message:', message);
      if (message.type === 'CHAT_INITIALIZED') {
        setPopup({
          visible: true, message: 'Chat session ready!', type: 'success',
        });
        setTimeout(() => setPopup((p) => ({...p, visible: false})), 2000);
        setIsStreaming(false);
      } else if (message.type === 'STREAM_CHUNK') {
        setThinkingOutput((prev) => prev + message.payload.textChunk);
        setIsStreaming(true);
        setActiveOutputTab('Thinking');
      } else if (message.type === 'STREAM_END') {
        setSuggestedVideos(message.payload.suggestedVideos || []);
        setPopup({
          visible: true, message: 'Suggestions received!', type: 'success',
        });
        setTimeout(() => setPopup((p) => ({...p, visible: false})), 2000);
        setActiveOutputTab('Results');
        setIsStreaming(false);
      } else if (message.type === 'ERROR') {
        setError(message.error);
        setPopup({
          visible: true, message: `Chat Error: ${message.error}`, type: 'error',
        });
        setTimeout(() => setPopup((p) => ({...p, visible: false})), 5000);
        setActiveOutputTab('Results');
        setIsStreaming(false);
      } else if (message.type === 'PONG') {
        console.log('Received PONG.');
      }
    };

    const handleCloseOrError = (evt) => {
      console.log('WebSocket closed or error.', evt);
      clearWebSocketTimers();

      if (selectedPlaylistId && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        const nextAttempt = reconnectAttempt + 1;
        setReconnectAttempt(nextAttempt);
        setIsReconnecting(true);
        const delay = Math.min(
            MAX_RECONNECT_DELAY_MS,
            INITIAL_RECONNECT_DELAY_MS * Math.pow(2, nextAttempt - 1),
        );
        const reconnectMsg =
          `Attempting reconnect ${nextAttempt}/` +
          `${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s...`;
        console.log(reconnectMsg);
        setPopup({
          visible: true,
          message: `Connection lost. Reconnecting ` +
                   `(${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})...`,
          type: 'warning',
        });
        reconnectTimeoutRef.current = setTimeout(
            () => startWebSocketConnection(selectedPlaylistId), delay,
        );
      } else if (selectedPlaylistId) {
        setIsReconnecting(false);
        setError('Failed to reconnect to chat service.');
        setPopup({
          visible: true,
          message: 'Failed to reconnect. ' +
                   'Please select playlist again or refresh.',
          type: 'error',
        });
      }
    };

    ws.current.onclose = handleCloseOrError;
    ws.current.onerror = handleCloseOrError;
  }, [
    selectedPlaylistId,
    reconnectAttempt,
    closeWebSocket,
    clearWebSocketTimers,
    setPopup,
    setError,
    setIsReconnecting,
    setReconnectAttempt,
    ws,
    pingIntervalRef,
    reconnectTimeoutRef,
  ]);

  useEffect(() => closeWebSocket, [closeWebSocket]);

  /**
   * Fetches the list of user's playlists from the backend.
   */
  const fetchUserPlaylists = useCallback(async () => {
    setShowOverlay(true); setError(null);
    try {
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.listUserPlaylists);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || response.statusText);
      }
      const data = await response.json();
      setUserPlaylists(data.playlists || []);
    } catch (err) {
      console.error('Error fetching user playlists:', err);
      setError(err.message);
      setUserPlaylists([]);
    } finally {
      setShowOverlay(false);
    }
  }, [setShowOverlay, setError, setUserPlaylists]);

  /**
   * Fetches items for a specific playlist from the backend.
   * @param {string} playlistId - The ID of the playlist to fetch items for.
   */
  const fetchPlaylistItems = useCallback(async (playlistId) => {
    if (!playlistId) {
      setVideos([]); return;
    }
    setShowOverlay(true); setError(null);
    try {
      const response = await fetch(
          CLOUD_FUNCTIONS_BASE_URL.getWatchLaterPlaylist,
          {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({playlistId}),
          },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || response.statusText);
      }
      const data = await response.json();
      setVideos(data.videos || []);
      const playlistTitle =
        userPlaylists.find((p) => p.id === playlistId)?.title ||
        'selected playlist';
      const popupMsg =
        `Loaded ${data.videos?.length || 0} videos from "${playlistTitle}".`;
      setPopup({visible: true, message: popupMsg, type: 'success'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 3000);
    } catch (err) {
      console.error('Error fetching playlist items:', err);
      setError(err.message);
      setVideos([]);
      setPopup({
        visible: true,
        message: `Error fetching playlist: ${err.message}`,
        type: 'error',
      });
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 5000);
    } finally {
      setShowOverlay(false);
    }
  }, [userPlaylists, setShowOverlay, setError, setVideos, setPopup]);

  /**
   * useEffect hook to handle OAuth status from URL parameters on initial load
   * and attempt auto-login if no OAuth status is present.
   */
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthStatus = urlParams.get('oauth_status');
    if (oauthStatus === 'success') {
      setIsLoggedIn(true); setAuthChecked(true);
      // Removed success popup
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthStatus === 'error') {
      const errorMsg = 'OAuth failed: ' + urlParams.get('error_message');
      setError(errorMsg);
      setAuthChecked(true);
      setIsLoggedIn(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const attemptAutoLogin = async () => {
        setShowOverlay(true);
        try {
          const response = await fetch(
              CLOUD_FUNCTIONS_BASE_URL.listUserPlaylists,
          );
          setIsLoggedIn(response.ok);
        } catch (err) {
          console.error('Auto-login check failed:', err);
          setIsLoggedIn(false);
        } finally {
          setShowOverlay(false); setAuthChecked(true);
        }
      };
      attemptAutoLogin();
    }
  }, [setShowOverlay, setIsLoggedIn, setAuthChecked, setError]);

  /**
   * useEffect hook to fetch user playlists when loggedIn state changes to true,
   * or clear user data and close WebSocket if loggedOut.
   */
  useEffect(() => {
    if (isLoggedIn) {
      fetchUserPlaylists();
    } else {
      setUserPlaylists([]);
      setSelectedPlaylistId('');
      setVideos([]);
      closeWebSocket();
    }
  }, [
    isLoggedIn,
    fetchUserPlaylists,
    setUserPlaylists,
    setSelectedPlaylistId,
    setVideos,
    closeWebSocket,
  ]);

  // Auto-scroll for thinking output
  useEffect(() => {
    if (activeOutputTab === 'Thinking' && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop =
        thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, activeOutputTab]);

  /**
   * Handles successful login.
   */
  const handleLoginSuccess = () => setIsLoggedIn(true);

  /**
   * Handles the selection of a playlist from the dropdown.
   * @param {React.ChangeEvent<HTMLSelectElement>} event - The select change event.
   */
  const handlePlaylistSelection = useCallback((event) => {
    const newPlaylistId = event.target.value;
    setSelectedPlaylistId(newPlaylistId);
    setSuggestedVideos([]);
    setThinkingOutput('');
    setActiveOutputTab('Results');

    if (newPlaylistId) {
      fetchPlaylistItems(newPlaylistId);
      startWebSocketConnection(newPlaylistId);
    } else {
      setVideos([]);
      closeWebSocket();
    }
  }, [fetchPlaylistItems, startWebSocketConnection, closeWebSocket]);

  /**
   * Refreshes the items for the currently selected playlist.
   */
  const refreshSelectedPlaylistItems = () => {
    if (selectedPlaylistId) {
      fetchPlaylistItems(selectedPlaylistId);
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({type: 'INIT_CHAT', payload: {playlistId: selectedPlaylistId}}));
      } else {
        startWebSocketConnection(selectedPlaylistId);
      }
    } else alert('Please select a playlist first.');
  };

  /**
   * Handles the submission of a query to the chat interface.
   * @param {string} query - The user's query string.
   */
  const handleQuerySubmit = async (query) => {
    if (!selectedPlaylistId) {
      setPopup({
        visible: true, message: 'Please select playlist.', type: 'error',
      });
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 3000); return;
    }
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      setPopup({
        visible: true,
        message: 'Chat not connected. Try re-selecting playlist.',
        type: 'error',
      });
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 5000); return;
    }
    setLastQuery(query); setError(null); setSuggestedVideos([]);
    setThinkingOutput('');
    setActiveOutputTab('Thinking');
    setIsStreaming(true);

    try {
      ws.current.send(JSON.stringify({type: 'USER_QUERY', payload: {query}}));
    } catch (err) {
      console.error('Error sending query via WebSocket:', err);
      setError(err.message);
      setPopup({
        visible: true, message: `Query error: ${err.message}`, type: 'error',
      });
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 5000);
      setActiveOutputTab('Results');
      setIsStreaming(false);
    }
  };

  return (
    <div className="App">
      {showOverlay && <LoadingOverlay />}
      {popup.visible && <StatusPopup message={popup.message} type={popup.type} />}
      <header className="App-header">
        <img src={process.env.PUBLIC_URL + '/ReelWorthyLogo.png'} alt="ReelWorthy Logo" id="app-logo" />
        <div className="header-title-text">
          {!authChecked && !showOverlay && <p style={{margin: '0'}}>Checking auth...</p>}
          {authChecked && isLoggedIn && <p style={{margin: '0'}}>ReelWorthy - Chat With Your Playlists {isReconnecting && `(Reconnecting... ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`}</p>}
        </div>
        <div className="header-login-control">
          {authChecked && !isLoggedIn && <LoginButton onLoginSuccess={handleLoginSuccess} />}
        </div>
      </header>
      <main>
        {error && <p style={{color: 'red'}}>Error: {error}</p>}
        {isLoggedIn && (
          <>
            <div>
              <label htmlFor="playlist-select">Choose a playlist: </label>
              <select id="playlist-select" value={selectedPlaylistId} onChange={handlePlaylistSelection} disabled={isLoading || userPlaylists.length === 0}>
                <option value="">-- Select a playlist --</option>
                {userPlaylists.map((pl) => <option key={pl.id} value={pl.id}>{pl.title} ({pl.itemCount} items)</option>)}
              </select>
              <button onClick={refreshSelectedPlaylistItems} disabled={isLoading || !selectedPlaylistId} className="refresh-button" style={{marginLeft: '10px'}} title="Refresh playlist items">↺</button>
            </div>
            {selectedPlaylistId && (
              <>
                <ChatInterface onQuerySubmit={handleQuerySubmit} disabled={isStreaming} />
                <div className="tabs">
                  <button
                    onClick={() => setActiveOutputTab('Results')}
                    className={activeOutputTab === 'Results' ? 'active' : ''}
                    disabled={isStreaming}>
                      Results
                  </button>
                  <button
                    onClick={() => setActiveOutputTab('Thinking')}
                    className={activeOutputTab === 'Thinking' ? 'active' : ''}
                    disabled={isStreaming && activeOutputTab !== 'Thinking'}>
                      Thinking
                  </button>
                </div>
                {activeOutputTab === 'Results' && (
                  <>
                    <h2>
                      {suggestedVideos.length > 0 ?
                       `${suggestedVideos.length} Suggested Videos` :
                       (lastQuery ? 'No Suggestions Found' : 'Suggested Videos')}
                    </h2>
                    {lastQuery &&
                      <p className="last-query-display">
                        For query: <em>"{lastQuery}"</em>
                      </p>
                    }
                    <VideoList videos={suggestedVideos} />
                  </>
                )}
                {activeOutputTab === 'Thinking' && (
                  <>
                    <h2>Gemini is Thinking...</h2>
                    {lastQuery &&
                      <p className="last-query-display">
                        For query: <em>"{lastQuery}"</em>
                      </p>
                    }
                    <div
                      ref={thinkingOutputContainerRef}
                      className="thinking-output-container">
                      <pre className="thinking-output">{thinkingOutput}</pre>
                    </div>
                  </>
                )}
              </>
            )}
            {!selectedPlaylistId && userPlaylists.length > 0 &&
              <p>Select a playlist to see videos and get suggestions.</p>
            }
            {!selectedPlaylistId && userPlaylists.length === 0 && isLoggedIn &&
              !isLoading && <p>No playlists found or loading.</p>
            }
          </>
        )}
        {!isLoggedIn &&
          <p>Please log in to manage your YouTube playlists.</p>
        }
      </main>
    </div>
  );
}

export default App;
