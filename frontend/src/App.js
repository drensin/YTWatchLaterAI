import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

// Placeholder for Cloud Function URLs - replace with your actual URLs
const CLOUD_FUNCTIONS_BASE_URL = {
  handleYouTubeAuth: "https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth",
  getWatchLaterPlaylist: "https://us-central1-watchlaterai-460918.cloudfunctions.net/getWatchLaterPlaylist", // This will be for fetching items from a selected playlist
  listUserPlaylists: "https://us-central1-watchlaterai-460918.cloudfunctions.net/listUserPlaylists",
  categorizeVideo: "YOUR_CATEGORIZE_VIDEO_FUNCTION_URL",
  chatWithPlaylist: "https://us-central1-watchlaterai-460918.cloudfunctions.net/chatWithPlaylist"
};

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
  const [lastQuery, setLastQuery] = useState(''); // New state for the last submitted query

  const fetchUserPlaylists = useCallback(async () => {
    setShowOverlay(true); // Show overlay
    // setIsLoading(true); // setIsLoading can still be used for specific parts if needed
    setError(null);
    try {
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.listUserPlaylists, {
        method: 'GET', // As defined in the cloud function
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
      // setIsLoading(false);
      setShowOverlay(false); // Hide overlay
    }
  }, []); // Removed setShowOverlay from deps as it's a setter

  // Renamed to fetchPlaylistItems to be more specific
  const fetchPlaylistItems = useCallback(async (playlistId) => {
    if (!playlistId) {
      setVideos([]); 
      return;
    }
    setShowOverlay(true); // Show overlay
    // setIsLoading(true);
    setError(null);
    try {
      // This function now needs the playlistId to be passed to the backend
      // The backend 'getWatchLaterPlaylist' function will need to be modified to accept a playlistId
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.getWatchLaterPlaylist, { // This URL might need to change if the backend function is renamed/refactored
        method: 'POST', 
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playlistId: playlistId }), // Send playlistId in the body
        // headers: {
        //   'Authorization': `Bearer YOUR_ID_TOKEN_OR_ACCESS_TOKEN`, // If needed
        // },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Failed to fetch playlist: ${errData.message || response.statusText}`);
      }
      const data = await response.json();
      setVideos(data.videos || []);
      // Show success popup
      const playlistTitle = userPlaylists.find(p => p.id === playlistId)?.title || 'selected playlist';
      setPopup({ 
        visible: true, 
        message: `Successfully loaded ${data.videos?.length || 0} videos from playlist "${playlistTitle}".`, 
        type: 'success' 
      });
      setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 3000); // Hide after 3 seconds
    } catch (err) {
      console.error("Error fetching playlist items:", err);
      setError(err.message); // Keep existing error handling
      setVideos([]);
      setPopup({ visible: true, message: `Error fetching playlist: ${err.message}`, type: 'error' });
      setTimeout(() => setPopup(prev => ({ ...prev, visible: false })), 5000); // Hide error after 5 seconds
    } finally {
      // setIsLoading(false);
      setShowOverlay(false); // Hide overlay
    }
  }, [userPlaylists]); // Added userPlaylists to deps for accessing title

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
      setIsLoggedIn(false); // Ensure logged out on error
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      // No OAuth params, try to check auth by fetching playlists
      // This is a simplified check; a dedicated auth-check endpoint would be better.
      const attemptAutoLogin = async () => {
        setShowOverlay(true); // Show overlay during auth check
        // setIsLoading(true); 
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
          // setIsLoading(false);
          setShowOverlay(false); // Hide overlay
          setAuthChecked(true); 
        }
      };
      attemptAutoLogin();
    }
  }, []); // Runs once on mount

  // Effect to fetch user playlists when isLoggedIn becomes true
  useEffect(() => {
    if (isLoggedIn) {
      fetchUserPlaylists();
      // We don't fetch playlist items immediately, user needs to select a playlist first
      // Or, if we auto-select a playlist in fetchUserPlaylists, then fetchPlaylistItems could be called.
    } else {
      // Clear data if user logs out (not implemented yet, but good for future)
      setUserPlaylists([]);
      setSelectedPlaylistId('');
      setVideos([]);
    }
  }, [isLoggedIn, fetchUserPlaylists]);

  const handleLoginSuccess = () => {
    setIsLoggedIn(true); 
  };

  // Handler for when a playlist is selected from the dropdown
  const handlePlaylistSelection = (event) => {
    const newPlaylistId = event.target.value;
    setSelectedPlaylistId(newPlaylistId);
    if (newPlaylistId) {
      fetchPlaylistItems(newPlaylistId);
    } else {
      setVideos([]); // Clear videos if "Select a playlist" is chosen
    }
  };
  
  // Button to refresh items for the currently selected playlist
  const refreshSelectedPlaylistItems = () => {
    if (selectedPlaylistId) {
      fetchPlaylistItems(selectedPlaylistId);
    } else {
      alert("Please select a playlist first.");
    }
  };

  const handleQuerySubmit = async (query) => {
    if (!isLoggedIn && !CLOUD_FUNCTIONS_BASE_URL.chatWithPlaylist.startsWith("YOUR_")) {
        console.warn("User not logged in or chatWithPlaylist URL not set. Skipping query.");
        return;
    }
    setShowOverlay(true); 
    setLastQuery(query); // Store the submitted query
    setError(null);
    try {
      // This calls the 'chatWithPlaylist' Cloud Function
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.chatWithPlaylist, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': `Bearer YOUR_ID_TOKEN_OR_ACCESS_TOKEN`, // If needed
        },
        body: JSON.stringify({ query: query, playlistId: selectedPlaylistId, userId: "currentUser" }), // Added userId
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Failed to submit query: ${errData.message || response.statusText}`);
      }
      const data = await response.json();
      setSuggestedVideos(data.suggestedVideos || []); // Assuming { suggestedVideos: [...] }
    } catch (err) {
      console.error("Error submitting query:", err);
      setError(err.message);
      setSuggestedVideos([]);
    } finally {
      // setIsLoading(false);
      setShowOverlay(false); // Hide overlay
    }
  };


  return (
    <div className="App">
      {showOverlay && <LoadingOverlay />} 
      {popup.visible && <StatusPopup message={popup.message} type={popup.type} />} {/* Render StatusPopup */}
      <header className="App-header">
        <h1>YT Watch Later Manager</h1>
        {!authChecked && !showOverlay && <p>Checking authentication...</p>} {/* Hide "Checking auth" if overlay is shown for it */}
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
                className="refresh-button" // Added className
                style={{ marginLeft: '10px' }} // Removed padding from inline, will handle in CSS
                title="Refresh playlist items"
              >
                🔄 
              </button>
            </div>
            {selectedPlaylistId && (
              <>
                <ChatInterface onQuerySubmit={handleQuerySubmit} />
                {/* Removed the static success message paragraph, now handled by StatusPopup */}
                
                {/* Only show "Loading videos..." when videos are actually being fetched for the main list, not for suggestions */}
                {/* This isLoading is the general one, might need more specific one if overlay is active */}
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
                {/* Removed the display of the full video list that was here */}
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
