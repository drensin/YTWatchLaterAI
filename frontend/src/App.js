import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

// Placeholder for Cloud Function URLs - replace with your actual URLs
const CLOUD_FUNCTIONS_BASE_URL = {
  handleYouTubeAuth: "https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth",
  getWatchLaterPlaylist: "https://us-central1-watchlaterai-460918.cloudfunctions.net/getWatchLaterPlaylist",
  categorizeVideo: "YOUR_CATEGORIZE_VIDEO_FUNCTION_URL",
  chatWithPlaylist: "YOUR_CHAT_WITH_PLAYLIST_FUNCTION_URL"
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
    <ul>
      {videos.map(video => (
        <li key={video.id}>
          <h4>{video.title}</h4>
          <p>{video.description ? video.description.substring(0, 100) + '...' : 'No description'}</p>
          {/* Add more video details as needed */}
        </li>
      ))}
    </ul>
  );
}

// --- Main App ---

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [videos, setVideos] = useState([]);
  const [suggestedVideos, setSuggestedVideos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Renamed to fetchPlaylistInternal for clarity within component scope
  const fetchPlaylistInternal = useCallback(async () => {
    // URL placeholder check can be removed if we ensure this is called appropriately
    // if (CLOUD_FUNCTIONS_BASE_URL.getWatchLaterPlaylist.startsWith("YOUR_")) {
    //   console.warn("getWatchLaterPlaylist URL not set. Skipping fetch.");
    //   return;
    // }
    setIsLoading(true);
    setError(null);
    try {
      // This function would be called by the user, or after login.
      // It calls the 'getWatchLaterPlaylist' Cloud Function.
      // The Cloud Function should be secured and expect an auth token (e.g., ID token)
      // passed in the Authorization header if it's not the one setting up the initial session.
      const response = await fetch(CLOUD_FUNCTIONS_BASE_URL.getWatchLaterPlaylist, {
        method: 'POST', // Or GET, depending on your function
        // headers: {
        //   'Authorization': `Bearer YOUR_ID_TOKEN_OR_ACCESS_TOKEN`, // If needed
        // },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Failed to fetch playlist: ${errData.message || response.statusText}`);
      }
      const data = await response.json();
      setVideos(data.videos || []); // Assuming the function returns { videos: [...] }
    } catch (err) {
      console.error("Error fetching playlist:", err);
      setError(err.message);
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, []); // Removed isLoggedIn from here, will be handled by the calling effect

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

  // Effect to fetch playlist when isLoggedIn becomes true
  useEffect(() => {
    if (isLoggedIn) {
      fetchPlaylistInternal();
    }
  }, [isLoggedIn, fetchPlaylistInternal]); // Runs when isLoggedIn or fetchPlaylistInternal changes

  const handleLoginSuccess = () => { // This might not be strictly needed if useEffect handles it
    setIsLoggedIn(true); // This will trigger the useEffect above
  };

  // Public fetchPlaylist for button click, points to the internal memoized version
  const fetchPlaylist = fetchPlaylistInternal;

  const handleQuerySubmit = async (query) => {
    if (!isLoggedIn && !CLOUD_FUNCTIONS_BASE_URL.chatWithPlaylist.startsWith("YOUR_")) {
        console.warn("User not logged in or chatWithPlaylist URL not set. Skipping query.");
        // setError("Please login to chat with your playlist.");
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
        body: JSON.stringify({ query: query }),
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
            <button onClick={fetchPlaylist} disabled={isLoading}>
              {isLoading ? 'Fetching Playlist...' : 'Refresh Watch Later Playlist'}
            </button>
            <ChatInterface onQuerySubmit={handleQuerySubmit} />
            <h2>Suggested Videos</h2>
            {isLoading && <p>Loading suggestions...</p>}
            <VideoList videos={suggestedVideos} />
            <h2>Full Playlist (Latest)</h2>
            {isLoading && <p>Loading playlist...</p>}
            <VideoList videos={videos} />
          </>
        )}
        {!isLoggedIn && <p>Please log in to manage your YouTube Watch Later playlist.</p>}
      </main>
    </div>
  );
}

export default App;
