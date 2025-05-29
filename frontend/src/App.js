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
      <button type="submit">Send</button>
    </form>
  );
}

function VideoList({ videos }) {
  if (!videos || videos.length === 0) {
    return <p>No videos to display. Try logging in or fetching your playlist.</p>;
  }

  return (
    <ul className="video-list"> {/* Added a class for potential styling */}
      {videos.map(video => (
        <li key={video.videoId || video.id} className="video-list-item"> {/* Ensure key is stable and added class */}
          {video.thumbnailUrl && (
            <img src={video.thumbnailUrl} alt={`Thumbnail for ${video.title}`} style={{ width: '120px', height: '90px', marginRight: '10px', float: 'left' }} />
          )}
          <div style={{ overflow: 'hidden' }}> {/* Container to clear float */}
            <h4>{video.title}</h4>
            <p><strong>Description:</strong> {video.description ? video.description.substring(0, 200) + '...' : 'No description'}</p> {/* Increased substring length */}
            {video.duration && <p><strong>Duration:</strong> {video.duration}</p>}
            {/* Not displaying views, likes, topics for suggested videos to keep it concise, but data is available if needed */}
            {video.reason && <p style={{ color: 'green', fontStyle: 'italic' }}><strong>Reason for suggestion:</strong> {video.reason}</p>}
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

  const fetchUserPlaylists = useCallback(async () => {
    setIsLoading(true);
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
      setIsLoading(false);
    }
  }, []);

  // Renamed to fetchPlaylistItems to be more specific
  const fetchPlaylistItems = useCallback(async (playlistId) => {
    if (!playlistId) {
      setVideos([]); // Clear videos if no playlist is selected
      return;
    }
    setIsLoading(true);
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
    } catch (err) {
      console.error("Error fetching playlist items:", err);
      setError(err.message);
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, []); // Dependencies might be needed if it uses state/props not defined in its scope

  // Effect to handle OAuth callback and set login status
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthStatus = urlParams.get('oauth_status');

    if (oauthStatus === 'success') {
      setIsLoggedIn(true); // Set logged in status
      // Clean the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthStatus === 'error') {
      setError("OAuth failed: " + urlParams.get('error_message'));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []); // Runs once on mount to check URL params

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
    setIsLoading(true);
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
      setIsLoading(false);
    }
  };


  return (
    <div className="App">
      <header className="App-header">
        <h1>YT Watch Later Manager</h1>
        {!isLoggedIn && <LoginButton onLoginSuccess={handleLoginSuccess} />}
        {isLoggedIn && <p>Welcome! You are logged in.</p>}
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
              <button onClick={refreshSelectedPlaylistItems} disabled={isLoading || !selectedPlaylistId} style={{marginLeft: '10px'}}>
                {isLoading && selectedPlaylistId ? 'Refreshing Items...' : 'Refresh Items'}
              </button>
            </div>
            {selectedPlaylistId && (
              <>
                <ChatInterface onQuerySubmit={handleQuerySubmit} />
                {/* Display success message after playlist items are fetched */}
                {!isLoading && videos.length > 0 && selectedPlaylistId && (
                  <p style={{ marginTop: '10px' }}>
                    Successfully loaded {videos.length} videos from playlist "{userPlaylists.find(p => p.id === selectedPlaylistId)?.title}".
                  </p>
                )}
                {/* Only show "Loading videos..." when videos are actually being fetched for the main list, not for suggestions */}
                {isLoading && !suggestedVideos.length && selectedPlaylistId && <p>Loading videos...</p>}

                <h2>Suggested Videos</h2>
                {isLoading && suggestedVideos.length === 0 && <p>Loading suggestions...</p>} {/* Show loading suggestions only if suggestions are being loaded */}
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
