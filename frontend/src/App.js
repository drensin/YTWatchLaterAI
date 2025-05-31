import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

// Placeholder for Cloud Function URLs - replace with your actual URLs
const CLOUD_FUNCTIONS_BASE_URL = {
  handleYouTubeAuth: "https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth",
  getWatchLaterPlaylist: "https://us-central1-watchlaterai-460918.cloudfunctions.net/getWatchLaterPlaylist", // This will be for fetching items from a selected playlist
  listUserPlaylists: "https://us-central1-watchlaterai-460918.cloudfunctions.net/listUserPlaylists",
  categorizeVideo: "YOUR_CATEGORIZE_VIDEO_FUNCTION_URL",
  // chatWithPlaylist: "https://us-central1-watchlaterai-460918.cloudfunctions.net/chatWithPlaylist" // Replaced by WebSocket
};

// Cloud Run WebSocket Service URL
const WEBSOCKET_SERVICE_URL = "wss://gemini-chat-service-679260739905.us-central1.run.app";

// --- Components ---

function LoginButton({ onLoginSuccess }) {
  const handleLogin = () => {
    // Redirect to the OAuth 2.0 authorization URL
    // This URL should point to your 'handleYouTubeAuth' Cloud Function
    // The Cloud Function will then redirect to Google's OAuth server
    window.location.href = CLOUD_FUNCTIONS_BASE_URL.handleYouTubeAuth;
  };

  // In a real app, you'd check if the user is already logged in
  // For now, we'll just show the button
  return (
    <button onClick={handleLogin}>Login with YouTube</button>
  );
}

function ChatInterface({ onQuerySubmit }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
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
      />
      <button type="submit" className="send-button" title="Send query">➤</button>
    </form>
  );
}

// --- Loading Overlay Component ---
function LoadingOverlay() {
  return (
    <div className="loading-overlay">
      <div className="spinner"></div>
      <p>Loading...</p>
    </div>
  );
}

// --- Status Popup Component ---
function StatusPopup({ message, type }) {
  if (!message) return null;
  return (
    <div className={`status-popup ${type}`}>
      {message}
    </div>
  );
}

function VideoList({ videos }) {
  const [expandedDescriptions, setExpandedDescriptions] = useState({});

  if (!videos || videos.length === 0) {
    return <p>No videos to display.</p>;
  }

  const toggleDescription = (videoId) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [videoId]: !prev[videoId]
    }));
  };

  const renderDescription = (video) => {
    const description = video.description || 'No description';
    const isExpanded = expandedDescriptions[video.videoId || video.id];
    const maxLength = 200;

    if (description.length <= maxLength) {
      return <p className="video-description"><strong>Description:</strong> {description}</p>;
    }

    if (isExpanded) {
      return (
        <p className="video-description">
          <strong>Description:</strong> {description}
          <button onClick={() => toggleDescription(video.videoId || video.id)} className="more-less-button">
            Less...
          </button>
        </p>
      );
    } else {
      return (
        <p className="video-description">
          <strong>Description:</strong> {description.substring(0, maxLength)}...
          <button onClick={() => toggleDescription(video.videoId || video.id)} className="more-less-button">
            More...
          </button>
        </p>
      );
    }
  };

  return (
    <ul className="video-list">
      {videos.map(video => (
        <li key={video.videoId || video.id} className="video-list-item">
          {video.thumbnailUrl && (
            <img src={video.thumbnailUrl} alt={`Thumbnail for ${video.title}`} style={{ width: '120px', height: '90px', marginRight: '10px', float: 'left' }} />
          )}
          <div style={{ overflow: 'hidden' }}>
            <h4>{video.title}</h4>
            {video.duration && <p><strong>Duration:</strong> {video.duration}</p>}
            {renderDescription(video)}
            {video.reason && <p style={{ color: 'green', fontStyle: 'italic' }}><strong>Reason:</strong> {video.reason}</p>}
            <a 
              href={`https://www.youtube.com/watch?v=${video.videoId}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="watch-link"
              title="Watch on YouTube"
            >
              📺 Watch
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

// --- Main App ---

function App() {
  // Refs for WebSocket and timers
  const ws = useRef(null); 
  const pingIntervalRef = useRef(null); 
  const reconnectTimeoutRef = useRef(null); 

  // State variables
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [videos, setVideos] = useState([]);
  const [suggestedVideos, setSuggestedVideos] = useState([]);
  const [isLoading, setIsLoading] = useState(false); 
  const [error, setError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false); 
  const [popup, setPopup] = useState({ visible: false, message: '', type: '' }); 
  const [lastQuery, setLastQuery] = useState(''); 

  // Reconnection state
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0); 
  const MAX_RECONNECT_ATTEMPTS = 5; 
  const INITIAL_RECONNECT_DELAY_MS = 1000; // 1 second
  const MAX_RECONNECT_DELAY_MS = 30000; // 30 seconds

  // Function to clear all WebSocket related timers/refs
  const clearWebSocketTimers = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, [pingIntervalRef, reconnectTimeoutRef]); 

  // Function to close WebSocket and clear timers
  const closeWebSocket = useCallback(() => {
    clearWebSocketTimers();
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  }, [clearWebSocketTimers, ws]); 

  // Function to establish WebSocket connection
  const startWebSocketConnection = useCallback((playlistIdToConnect) => {
    if (!playlistIdToConnect) {
      console.error("Cannot start WebSocket connection: playlistId is null or undefined.");
      return;
    }

    // Ensure any existing connection is closed before opening a new one
    closeWebSocket(); 
    
    console.log('Attempting to establish WebSocket connection...');
    ws.current = new WebSocket(WEBSOCKET_SERVICE_URL);

    ws.current.onopen = () => {
      console.log('WebSocket connected. Initializing chat...');
      // Reset reconnection state on successful connection
      setReconnectAttempt(0);
      setIsReconnecting(false);
      clearWebSocketTimers(); // Clear any pending reconnect timeouts

      // Send INIT_CHAT message with playlistId
      ws.current.send(JSON.stringify({ type: 'INIT_CHAT', payload: { playlistId: playlistIdToConnect } }));
      setPopup({ visible: true, message: 'Connecting to chat service...', type: 'info' });
      setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 2000);

      // Start heartbeat (ping)
      pingIntervalRef.current = setInterval(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'PING' }));
          console.log('Sent PING to server.');
        }
      }, 30000); // Send ping every 30 seconds
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Received from server:', message);

      if (message.type === 'CHAT_INITIALIZED') {
        setPopup({ visible: true, message: 'Chat session ready!', type: 'success' });
        setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 2000);
      } else if (message.type === 'AI_RESPONSE') {
        setSuggestedVideos(message.payload.suggestedVideos || []);
        setShowOverlay(false); // Hide overlay after AI response
        setPopup({ visible: true, message: 'Suggestions received!', type: 'success' });
        setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 2000);
      } else if (message.type === 'ERROR') {
        setError(message.error);
        setShowOverlay(false); // Hide overlay on error
        setPopup({ visible: true, message: `Chat Error: ${message.error}`, type: 'error' });
        setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 5000);
      } else if (message.type === 'PONG') {
        console.log('Received PONG from server.');
        // No specific action needed, just keeps connection alive
      }
    };

    const handleCloseOrError = (event) => {
      console.log('WebSocket disconnected or error occurred.', event, ws.current?.readyState); 
      closeWebSocket(); // Clear timers and close WS if not already closed

      // Attempt reconnection if not intentionally closed and within limits
      if (selectedPlaylistId && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        const nextAttempt = reconnectAttempt + 1;
        setReconnectAttempt(nextAttempt);
        setIsReconnecting(true);

        const delay = Math.min(
          MAX_RECONNECT_DELAY_MS,
          INITIAL_RECONNECT_DELAY_MS * Math.pow(2, nextAttempt - 1)
        );

        console.log(`Attempting reconnect ${nextAttempt}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s...`);
        setPopup({ visible: true, message: `Connection lost. Reconnecting (${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})...`, type: 'warning' });
        
        reconnectTimeoutRef.current = setTimeout(() => {
          startWebSocketConnection(selectedPlaylistId); // Try to reconnect
        }, delay);
      } else if (selectedPlaylistId) {
        // Max attempts reached
        setIsReconnecting(false);
        setPopup({ visible: true, message: 'Failed to reconnect to chat service. Please refresh the page.', type: 'error' });
        setError('Failed to reconnect to chat service.');
      } else {
        // No playlist selected, so no reconnection needed
        setPopup({ visible: true, message: 'Chat service disconnected.', type: 'warning' });
      }
    };

    ws.current.onclose = handleCloseOrError;
    ws.current.onerror = handleCloseOrError;

  }, [selectedPlaylistId, reconnectAttempt, clearWebSocketTimers, closeWebSocket, setPopup, setError, setIsReconnecting, setReconnectAttempt, ws]); 

  // Effect to close WebSocket and clear all timers on component unmount
  useEffect(() => {
    return () => {
      closeWebSocket(); 
    };
  }, [closeWebSocket]);

  const fetchUserPlaylists = useCallback(async () => {
    setShowOverlay(true); 
    setError(null);
    try {
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.listUserPlaylists, {
        method: 'GET', 
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Failed to fetch user playlists: ${errData.message || response.statusText}`);
      }
      const data = await response.json();
      setUserPlaylists(data.playlists || []);
      if (data.playlists && data.playlists.length > 0) {
        // Optionally auto-select the first playlist or let user choose
        // setSelectedPlaylistId(data.playlists[0].id); 
      }
    } catch (err) {
      console.error("Error fetching user playlists:", err);
      setError(err.message);
      setUserPlaylists([]);
    } finally {
      setShowOverlay(false); 
    }
  }, [setShowOverlay, setError, setUserPlaylists]); 

  // Renamed to fetchPlaylistItems to be more specific
  const fetchPlaylistItems = useCallback(async (playlistId) => {
    if (!playlistId) {
      setVideos([]); 
      return;
    }
    setShowOverlay(true); 
    setError(null);
    try {
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.getWatchLaterPlaylist, { 
        method: 'POST', 
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playlistId: playlistId }), 
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Failed to fetch playlist: ${errData.message || response.statusText}`);
      }
      const data = await response.json();
      setVideos(data.videos || []);
      const playlistTitle = userPlaylists.find(p => p.id === playlistId)?.title || 'selected playlist';
      setPopup({ 
        visible: true, 
        message: `Successfully loaded ${data.videos?.length || 0} videos from playlist "${playlistTitle}".`, 
        type: 'success' 
      });
      setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 3000); 
    } catch (err) {
      console.error("Error fetching playlist items:", err);
      setError(err.message); 
      setVideos([]);
      setPopup({ visible: true, message: `Error fetching playlist: ${err.message}`, type: 'error' });
      setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 5000); 
    } finally {
      setShowOverlay(false); 
    }
  }, [userPlaylists, setShowOverlay, setError, setVideos, setPopup]); 

  // Effect to handle OAuth callback AND initial auth check
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthStatus = urlParams.get('oauth_status');

    if (oauthStatus === 'success') {
      setIsLoggedIn(true);
      setAuthChecked(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthStatus === 'error') {
      setError("OAuth failed: " + urlParams.get('error_message'));
      setAuthChecked(true);
      setIsLoggedIn(false); 
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const attemptAutoLogin = async () => {
        setShowOverlay(true); 
        try {
          const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.listUserPlaylists); 
          if (response.ok) {
            setIsLoggedIn(true); 
          } else {
            setIsLoggedIn(false); 
          }
        } catch (err) {
          console.error("Auto-login check failed:", err);
          setIsLoggedIn(false); 
        } finally {
          setShowOverlay(false); 
          setAuthChecked(true); 
        }
      };
      attemptAutoLogin();
    }
  }, [setShowOverlay, setIsLoggedIn, setAuthChecked, setError]); 

  // Effect to fetch user playlists when isLoggedIn becomes true
  useEffect(() => {
    if (isLoggedIn) {
      fetchUserPlaylists();
    } else {
      setUserPlaylists([]);
      setSelectedPlaylistId('');
      setVideos([]);
    }
  }, [isLoggedIn, fetchUserPlaylists, setUserPlaylists, setSelectedPlaylistId, setVideos]); 

  const handleLoginSuccess = () => {
    setIsLoggedIn(true); 
  };

  // Handler for when a playlist is selected from the dropdown
  const handlePlaylistSelection = useCallback((event) => {
    const newPlaylistId = event.target.value;
    setSelectedPlaylistId(newPlaylistId);
    setSuggestedVideos([]); 

    if (newPlaylistId) {
      fetchPlaylistItems(newPlaylistId); 

      // Close existing WebSocket connection if open
      if (ws.current) {
        ws.current.close();
        ws.current = null;
        console.log('Existing WebSocket closed.');
      }

      // Start new WebSocket connection
      startWebSocketConnection(newPlaylistId);

    } else {
      setVideos([]); 
      closeWebSocket(); // Close WS if no playlist selected
      console.log('WebSocket closed due to no playlist selected.');
    }
  }, [fetchPlaylistItems, setSuggestedVideos, startWebSocketConnection, closeWebSocket]); 

  // Button to refresh items for the currently selected playlist
  const refreshSelectedPlaylistItems = () => {
    if (selectedPlaylistId) {
      fetchPlaylistItems(selectedPlaylistId);
      // Re-initialize chat session if refreshing playlist items
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'INIT_CHAT', payload: { playlistId: selectedPlaylistId } }));
        setPopup({ visible: true, message: 'Re-initializing chat session...', type: 'info' });
        setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 2000);
      } else if (selectedPlaylistId) {
        // If WS not open but playlist selected, try to re-establish
        startWebSocketConnection(selectedPlaylistId);
      }
    } else {
      alert("Please select a playlist first.");
    }
  };

  const handleQuerySubmit = async (query) => {
    if (!selectedPlaylistId) {
        setPopup({ visible: true, message: 'Please select a playlist before chatting.', type: 'error' });
        setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 3000);
        return;
    }
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        setPopup({ visible: true, message: 'Chat service not connected. Please try selecting the playlist again.', type: 'error' });
        setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 5000);
        console.error('WebSocket not open for sending query.');
        return;
    }

    setShowOverlay(true); 
    setLastQuery(query); 
    setError(null);
    setSuggestedVideos([]); 

    try {
      // Send query via WebSocket
      ws.current.send(JSON.stringify({ type: 'USER_QUERY', payload: { query: query } }));
      // Response will be handled by ws.current.onmessage
    } catch (err) {
      console.error("Error sending query via WebSocket:", err);
      setError(err.message);
      setShowOverlay(false);
      setPopup({ visible: true, message: `Error sending query: ${err.message}`, type: 'error' });
      setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 5000);
    }
  };


  return (
    <div className="App">
      {showOverlay && <LoadingOverlay />} 
      {popup.visible && <StatusPopup message={popup.message} type={popup.type} />} 
      <header className="App-header">
        <h1>YT Watch Later Manager</h1>
        {!authChecked && !showOverlay && <p>Checking authentication...</p>} 
        {authChecked && !isLoggedIn && <LoginButton onLoginSuccess={handleLoginSuccess} />}
        {authChecked && isLoggedIn && <p>Welcome! You are logged in.</p>}
      </header>
      <main>
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {isLoggedIn && (
          <>
            <div>
              <label htmlFor="playlist-select">Choose a playlist: </label>
              <select id="playlist-select" value={selectedPlaylistId} onChange={handlePlaylistSelection} disabled={isLoading || userPlaylists.length === 0}>
                <option value="">-- Select a playlist --</option>
                {userPlaylists.map(pl => (
                  <option key={pl.id} value={pl.id}>
                    {pl.title} ({pl.itemCount} items)
                  </option>
                ))}
              </select>
              <button 
                onClick={refreshSelectedPlaylistItems} 
                disabled={isLoading || !selectedPlaylistId} 
                className="refresh-button" 
                style={{ marginLeft: '10px' }} 
                title="Refresh playlist items"
              >
                🔄 
              </button>
            </div>
            {selectedPlaylistId && (
              <>
                <ChatInterface onQuerySubmit={handleQuerySubmit} />
                
                {isLoading && !showOverlay && !suggestedVideos.length && selectedPlaylistId && <p>Loading videos...</p>}

                <h2>
                  {suggestedVideos.length > 0 ? `${suggestedVideos.length} Suggested Videos` : (lastQuery ? "No Suggestions Found" : "Suggested Videos")}
                </h2>
                {lastQuery && (
                  <p className="last-query-display">
                    For query: <em>"{lastQuery}"</em>
                  </p>
                )}
                {isLoading && suggestedVideos.length === 0 && <p>Loading suggestions...</p>} 
                <VideoList videos={suggestedVideos} />
              </>
            )}
            {!selectedPlaylistId && userPlaylists.length > 0 && <p>Select a playlist above to see its videos and get suggestions.</p>}
            {!selectedPlaylistId && userPlaylists.length === 0 && isLoggedIn && !isLoading && <p>No playlists found or still loading playlists.</p>}
          </>
        )}
        {!isLoggedIn && <p>Please log in to manage your YouTube playlists.</p>}
      </main>
    </div>
  );
}

export default App;
