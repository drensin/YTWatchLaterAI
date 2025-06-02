/**
 * @fileoverview This file defines the main React application component for ReelWorthy.
 * It handles user authentication, YouTube API interactions, playlist management,
 * and the chat interface with the Gemini AI service.
 */
import React, {useState, useEffect, useCallback, useRef, memo} from 'react';
import {FixedSizeList as List} from 'react-window';
import './App.css';
import useAuth from './hooks/useAuth';
import useYouTube from './hooks/useYouTube';
import useWebSocketChat from './hooks/useWebSocketChat'; // Import the new hook

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
// Individual Video Item, memoized for performance
const VideoRow = memo(({index, style, data}) => {
  const {videos, expandedDescriptions, toggleDescription} = data;
  const video = videos[index];

  if (!video) {
    return <div style={style}>Loading video...</div>;
  }

  const videoId = video.videoId || video.id;

  const renderDescription = () => {
    const description = video.description || 'No description';
    const isExpanded = expandedDescriptions[videoId];
    const maxLength = 150; // Adjusted for potentially smaller row height
    if (description.length <= maxLength) {
      return <p className="video-description"><strong>Description:</strong> {description}</p>;
    }
    return (
      <p className="video-description">
        <strong>Description:</strong> {isExpanded ? description : `${description.substring(0, maxLength)}...`}
        <button onClick={() => toggleDescription(videoId)} className="more-less-button">
          {isExpanded ? 'Less...' : 'More...'}
        </button>
      </p>
    );
  };

  return (
    <div style={style} className="video-list-item-wrapper">
      <div className="video-list-item">
        {video.thumbnailUrl && (
          <img
            src={video.thumbnailUrl}
            alt={`Thumbnail for ${video.title}`}
            loading="lazy" // Lazy load images
            className="video-thumbnail" // Added class for styling if needed
          />
        )}
        <div className="video-details">
          <h4>{video.title}</h4>
          {video.duration && <p><strong>Duration:</strong> {video.duration}</p>}
          {renderDescription()}
          {video.reason && <p style={{color: 'green', fontStyle: 'italic'}}><strong>Reason:</strong> {video.reason}</p>}
          <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="watch-link" title="Watch on YouTube">
            ▶ Watch
          </a>
        </div>
      </div>
    </div>
  );
});

/**
 * Renders a virtualized list of videos.
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

  // FixedSizeList requires itemData to pass data to Row component
  const itemData = {
    videos,
    expandedDescriptions,
    toggleDescription,
  };

  // These values might need adjustment based on your CSS and content.
  // Consider making them responsive or dynamically calculated if possible.
  const ITEM_HEIGHT = 200; // Approximate height of one video item
  const LIST_HEIGHT = 600; // Desired height of the scrollable list area
  const LIST_WIDTH = '100%'; // Or a fixed pixel value

  return (
    <List
      className="video-list-virtualized" // Add a class for styling the List container
      height={LIST_HEIGHT}
      itemCount={videos.length}
      itemSize={ITEM_HEIGHT}
      itemData={itemData}
      width={LIST_WIDTH}
    >
      {VideoRow}
    </List>
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
  const thinkingOutputContainerRef = useRef(null); // Keep ref for DOM manipulation here

  const [popup, setPopup] = useState({visible: false, message: '', type: ''});
  const [error, setError] = useState(null); // General app error, distinct from auth/youtube errors
  const [isPlaylistDataReadyForChat, setIsPlaylistDataReadyForChat] = useState(false);

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
    fetchUserPlaylists,
    fetchPlaylistItems,
    handleConnectYouTube,
    isYouTubeLinked,
    youtubeSpecificError,
    isLoadingYouTube,
    setVideos: setYouTubeVideos,
    setUserPlaylists: setYouTubeUserPlaylists,
    setYoutubeSpecificError: setYouTubeErrorAppLevel,
  } = useYouTube(currentUser, isLoggedIn, isAuthorizedUser, setPopup, isYouTubeLinkedByAuthCheck);

  const {
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    activeOutputTab,
    setActiveOutputTab,
    isStreaming,
    handleQuerySubmit, // This now comes from useWebSocketChat
  } = useWebSocketChat(selectedPlaylistId, isPlaylistDataReadyForChat, setPopup, setError);


  const showOverlay = isLoadingAuth || isLoadingYouTube; // isLoadingChat can be added if useWebSocketChat exposes it

  // Effect to fetch user playlists when auth and YouTube link status are favorable.
  useEffect(() => {
    if (isLoggedIn && isAuthorizedUser && isYouTubeLinked && userPlaylists.length === 0 && !isLoadingYouTube && !youtubeSpecificError && !appAuthorizationError) {
      console.log('App.js useEffect: Fetching user playlists (conditions met).');
      fetchUserPlaylists();
    } else if (!isLoggedIn || !isAuthorizedUser) {
      setYouTubeUserPlaylists([]);
      setSelectedPlaylistId('');
      setYouTubeVideos([]);
      // suggestedVideos will be cleared by useWebSocketChat when selectedPlaylistId changes
      // if (ws.current) closeWebSocket(); // closeWebSocket is now internal to useWebSocketChat
    }
  }, [
    isLoggedIn,
    isAuthorizedUser,
    isYouTubeLinked,
    userPlaylists.length,
    isLoadingYouTube,
    youtubeSpecificError,
    appAuthorizationError,
    fetchUserPlaylists,
    setYouTubeUserPlaylists,
    setSelectedPlaylistId,
    setYouTubeVideos,
  ]);


  useEffect(() => {
    if (activeOutputTab === 'Thinking' && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop = thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, activeOutputTab]);

  /**
   * Handles the selection of a new playlist from the dropdown.
   * @param {React.ChangeEvent<HTMLSelectElement>} event - The select change event.
   */
  const handlePlaylistSelection = useCallback(async (event) => {
    const newPlaylistId = event.target.value;
    setIsPlaylistDataReadyForChat(false); // Reset readiness
    setSelectedPlaylistId(newPlaylistId);
    setError(null);
    setYouTubeErrorAppLevel(null);

    if (newPlaylistId) {
      const fetchSuccess = await fetchPlaylistItems(newPlaylistId);
      if (fetchSuccess) {
        setIsPlaylistDataReadyForChat(true); // Signal data is ready
      }
      // WebSocket connection is managed by useWebSocketChat based on selectedPlaylistId and isPlaylistDataReadyForChat
    } else {
      setYouTubeVideos([]);
      // isPlaylistDataReadyForChat remains false, useWebSocketChat will see selectedPlaylistId is null/empty
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, setYouTubeVideos, setYouTubeErrorAppLevel, setError, setIsPlaylistDataReadyForChat]);

  /**
   * Refreshes the items for the currently selected playlist and re-initializes chat if connected.
   */
  const refreshSelectedPlaylistItems = async () => {
    if (selectedPlaylistId) {
      setError(null);
      setYouTubeErrorAppLevel(null);
      const fetchSuccess = await fetchPlaylistItems(selectedPlaylistId);
      if (fetchSuccess) {
        // Re-triggering chat initialization is handled by useWebSocketChat's
        // dependency on selectedPlaylistId, if it needs to re-init.
        // Or, if explicit re-init is needed, useWebSocketChat could expose a function.
        // For now, assuming selection change or this refresh implies re-sync.
        if (setPopup) setPopup({visible: true, message: 'Playlist refreshed.', type: 'info'});
        setTimeout(() => {
          if (setPopup) setPopup((p) => ({...p, visible: false}));
        }, 2000);
      }
    } else {
      if (setPopup) setPopup({visible: true, message: 'Please select a playlist first.', type: 'error'});
      setTimeout(() => {
        if (setPopup) setPopup((p) => ({...p, visible: false}));
      }, 3000);
    }
  };

  // handleQuerySubmit is now provided by useWebSocketChat

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
