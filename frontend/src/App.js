/**
 * @fileoverview This file defines the main React application component for ReelWorthy.
 * It handles user authentication, YouTube API interactions, playlist management,
 * and the chat interface with the Gemini AI service.
 */
import React, {useState, useEffect, useCallback, useRef} from 'react';
import './App.css';
import useAuth from './hooks/useAuth';
import useYouTube from './hooks/useYouTube'; // Import the new hook

// Cloud Run WebSocket Service URL
const WEBSOCKET_SERVICE_URL = 'wss://gemini-chat-service-679260739905.us-central1.run.app';

// --- Components ---

/**
 * Renders a login button.
 * @param {object} props - The component's props.
 * @param {Function} props.onLogin - Callback to handle login.
 * @returns {React.ReactElement} The rendered login button.
 */
function LoginButton({onLogin}) {
  return (
    <button onClick={onLogin} className='auth-button'>
      Login
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
/**
 * The main application component for ReelWorthy.
 * Manages application state, user authentication, YouTube data fetching,
 * and interactions with the AI chat service.
 * @returns {React.ReactElement} The rendered App component.
 */
function App() {
  const ws = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const thinkingOutputContainerRef = useRef(null);

  const [popup, setPopup] = useState({visible: false, message: '', type: ''});
  const {
    currentUser,
    isLoggedIn,
    isAuthorizedUser,
    isYouTubeLinkedByAuthCheck,
    authChecked,
    appAuthorizationError,
    isLoadingAuth,
    handleFirebaseLogin,
    handleFirebaseLogout,
  } = useAuth(setPopup);

  const {
    userPlaylists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    // videos, // Videos for the selected playlist from useYouTube - Not directly used in App.js JSX
    fetchUserPlaylists,
    fetchPlaylistItems,
    handleConnectYouTube,
    isYouTubeLinked, // This is now isYouTubeLinkedForApp from useYouTube
    youtubeSpecificError,
    isLoadingYouTube,
    setVideos: setYouTubeVideos, // Exposing setters from useYouTube if needed by App
    setUserPlaylists: setYouTubeUserPlaylists,
    // setIsYouTubeLinked: setIsYouTubeLinkedAppLevel, // To manage the app's view if needed - Not used
    setYoutubeSpecificError: setYouTubeErrorAppLevel,
  } = useYouTube(currentUser, isLoggedIn, isAuthorizedUser, setPopup, isYouTubeLinkedByAuthCheck);


  // Chat specific state (to be moved to useWebSocketChat hook later)
  const [suggestedVideos, setSuggestedVideos] = useState([]);
  const [error, setError] = useState(null); // General app error, distinct from auth/youtube errors

  const [lastQuery, setLastQuery] = useState('');
  const [thinkingOutput, setThinkingOutput] = useState('');
  const [activeOutputTab, setActiveOutputTab] = useState('Results');
  const [isStreaming, setIsStreaming] = useState(false);
  // const [isReconnecting, setIsReconnecting] = useState(false); // Unused state
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY_MS = 1000;
  const MAX_RECONNECT_DELAY_MS = 30000;

  const showOverlay = isLoadingAuth || isLoadingYouTube; // Combined loading state

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
  }, [clearWebSocketTimers]);

  /**
   * Initializes or re-initializes the WebSocket connection to the chat service.
   * @param {string} playlistIdToConnect - The ID of the playlist to initialize the chat with.
   */
  const startWebSocketConnection = useCallback((playlistIdToConnect) => {
    if (!playlistIdToConnect) return;
    closeWebSocket();
    console.log('Attempting WebSocket connection...');
    ws.current = new WebSocket(WEBSOCKET_SERVICE_URL);
    setIsStreaming(false);
    ws.current.onopen = () => {
      console.log('WebSocket connected. Initializing chat...');
      setReconnectAttempt(0);
      // setIsReconnecting(false); // isReconnecting state was removed as unused
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
        // setIsReconnecting(true); // isReconnecting state was removed as unused
        const delay = Math.min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS * Math.pow(2, nextAttempt - 1));
        setPopup({visible: true, message: `Connection lost. Reconnecting (${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})...`, type: 'warning'});
        reconnectTimeoutRef.current = setTimeout(() => startWebSocketConnection(selectedPlaylistId), delay);
      } else if (selectedPlaylistId) {
        // setIsReconnecting(false); // isReconnecting state was removed as unused
        setError('Failed to reconnect to chat service.');
        setPopup({visible: true, message: 'Failed to reconnect. Please select playlist again or refresh.', type: 'error'});
      }
    };
    ws.current.onclose = handleWSCloseOrError;
    ws.current.onerror = handleWSCloseOrError;
  }, [selectedPlaylistId, reconnectAttempt, closeWebSocket, clearWebSocketTimers, setPopup, setError, setReconnectAttempt, pingIntervalRef, reconnectTimeoutRef]);

  useEffect(() => closeWebSocket, [closeWebSocket]);

  // Effect to fetch user playlists when auth and YouTube link status are favorable.
  // This logic is now simpler as useYouTube handles its own internal fetch after linking.
  useEffect(() => {
    if (isLoggedIn && isAuthorizedUser && isYouTubeLinked && userPlaylists.length === 0 && !isLoadingYouTube && !youtubeSpecificError && !appAuthorizationError) {
      console.log('App.js useEffect: Fetching user playlists (conditions met).');
      fetchUserPlaylists();
    } else if (!isLoggedIn || !isAuthorizedUser) {
      // Clear YouTube related data if app auth fails or user logs out
      setYouTubeUserPlaylists([]);
      setSelectedPlaylistId('');
      setYouTubeVideos([]);
      setSuggestedVideos([]); // Also clear chat suggestions
      if (ws.current) closeWebSocket();
    }
  }, [
    isLoggedIn,
    isAuthorizedUser,
    isYouTubeLinked, // from useYouTube
    userPlaylists.length,
    isLoadingYouTube,
    youtubeSpecificError,
    appAuthorizationError,
    fetchUserPlaylists,
    closeWebSocket,
    setYouTubeUserPlaylists, // from useYouTube
    setYouTubeVideos, // from useYouTube
    setSelectedPlaylistId, // Added missing dependency
  ]);


  useEffect(() => {
    if (activeOutputTab === 'Thinking' && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop = thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, activeOutputTab]);

  /**
   * Handles the selection of a new playlist from the dropdown.
   * Fetches items for the selected playlist and initializes the WebSocket connection.
   * @param {React.ChangeEvent<HTMLSelectElement>} event - The select change event.
   */
  const handlePlaylistSelection = useCallback(async (event) => {
    const newPlaylistId = event.target.value;
    setSelectedPlaylistId(newPlaylistId); // from useYouTube
    setSuggestedVideos([]);
    setThinkingOutput('');
    setLastQuery('');
    setActiveOutputTab('Results');
    setError(null); // General error
    setYouTubeErrorAppLevel(null); // Clear YouTube specific error via exposed setter

    if (newPlaylistId) {
      const fetchSuccess = await fetchPlaylistItems(newPlaylistId); // from useYouTube
      if (fetchSuccess) {
        startWebSocketConnection(newPlaylistId);
      }
    } else {
      setYouTubeVideos([]); // from useYouTube
      closeWebSocket();
    }
  }, [fetchPlaylistItems, startWebSocketConnection, closeWebSocket, setSelectedPlaylistId, setYouTubeVideos, setYouTubeErrorAppLevel]);

  /**
   * Refreshes the items for the currently selected playlist and re-initializes chat if connected.
   */
  const refreshSelectedPlaylistItems = async () => {
    if (selectedPlaylistId) {
      setError(null);
      setYouTubeErrorAppLevel(null);
      const fetchSuccess = await fetchPlaylistItems(selectedPlaylistId); // from useYouTube

      if (fetchSuccess) {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({type: 'INIT_CHAT', payload: {playlistId: selectedPlaylistId}}));
          setPopup({visible: true, message: 'Playlist refreshed and chat re-initialized.', type: 'info'});
          setTimeout(() => setPopup((p) => ({...p, visible: false})), 2000);
        } else {
          startWebSocketConnection(selectedPlaylistId);
        }
      }
    } else {
      setPopup({visible: true, message: 'Please select a playlist first.', type: 'error'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 3000);
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
        <h1 className="app-header-title">ReelWorthy</h1>
        <div className="header-login-control">
          {authChecked && !isLoggedIn && <LoginButton onLogin={handleFirebaseLogin} />}
          {authChecked && isLoggedIn && (
            <button onClick={handleFirebaseLogout} className='auth-button'>
              Logout
            </button>
          )}
        </div>
      </header>
      <main>
        {error && <p style={{color: 'red', fontWeight: 'bold'}}>App Error: {error}</p>}
        {appAuthorizationError && <p style={{color: 'orange', fontWeight: 'bold'}}>Authorization Error: {appAuthorizationError}</p>}
        {youtubeSpecificError && <p style={{color: 'yellow', backgroundColor: 'rgba(0,0,0,0.1)', padding: '5px', fontWeight: 'bold'}}>YouTube Error: {youtubeSpecificError}</p>}

        {isLoggedIn && isAuthorizedUser && !isYouTubeLinked && authChecked && (
          <div style={{padding: '20px', textAlign: 'center'}}>
            <p>{youtubeSpecificError || appAuthorizationError || 'Your YouTube account is not connected or the connection has expired.'}</p>
            <button onClick={handleConnectYouTube} style={{padding: '10px 20px', fontSize: '1em'}}>
        🔗 Connect YouTube Account
            </button>
          </div>
        )}

        {isLoggedIn && isAuthorizedUser && isYouTubeLinked && (
          <>
            <div>
              <label htmlFor='playlist-select'>Choose a playlist: </label>
              <select id='playlist-select' value={selectedPlaylistId} onChange={handlePlaylistSelection} disabled={isLoadingYouTube || !userPlaylists || userPlaylists.length === 0}>
                <option value=''>-- Select a playlist --</option>
                {userPlaylists.map((pl) => <option key={pl.id} value={pl.id}>{pl.title} ({pl.itemCount} items)</option>)}
              </select>
              <button onClick={refreshSelectedPlaylistItems} disabled={isLoadingYouTube || !selectedPlaylistId} className='refresh-button' style={{marginLeft: '10px'}} title='Refresh playlist items'>↺</button>
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
            {!selectedPlaylistId && userPlaylists && userPlaylists.length > 0 && !isLoadingYouTube &&
              <p>Select a playlist to see videos and get suggestions.</p>
            }
            {(!userPlaylists || userPlaylists.length === 0) && isLoggedIn && isAuthorizedUser && isYouTubeLinked &&
              !isLoadingYouTube && <p>No playlists found. Try connecting YouTube or refreshing if you recently added some.</p>
            }
          </>
        )}
        {isLoggedIn && !isAuthorizedUser && authChecked &&(
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
