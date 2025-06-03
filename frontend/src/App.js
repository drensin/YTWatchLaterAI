/**
 * @fileoverview This file defines the main React application component for ReelWorthy.
 * It handles user authentication, YouTube API interactions, playlist management,
 * and the chat interface with the Gemini AI service.
 */
import React, {useState, useEffect, useCallback, useRef} from 'react';
import './App.css';
import useAuth from './hooks/useAuth';
import useYouTube from './hooks/useYouTube';
import useWebSocketChat from './hooks/useWebSocketChat';

import LoadingOverlay from './components/LoadingOverlay';
import StatusPopup from './components/StatusPopup';
import ScreenHeader from './components/ScreenHeader'; // Import ScreenHeader

// Import screen content components
import LoginScreen from './components/LoginScreen';
import ConnectYouTubeView from './components/ConnectYouTubeView';
import UserStatusMessages from './components/UserStatusMessages';
import BottomNavigationBar from './components/BottomNavigationBar';
import PlaylistsScreen from './components/PlaylistsScreen';
import ChatScreen from './components/ChatScreen';


/**
 * The main application component for ReelWorthy.
 */
function App() {
  /** @type {React.RefObject<HTMLDivElement>} Reference to the DOM element that displays the AI's thinking process, used for auto-scrolling. */
  const thinkingOutputContainerRef = useRef(null);

  /** @state Manages the visibility, message, and type of status popups. */
  const [popup, setPopup] = useState({visible: false, message: '', type: ''});
  /** @state Stores any general error messages to be displayed. */
  const [error, setError] = useState(null);
  /** @state Flag indicating if the selected playlist's items are loaded and ready for chat interaction. */
  const [isPlaylistDataReadyForChat, setIsPlaylistDataReadyForChat] = useState(false);
  /** @state Tracks the currently active screen/view in the application. */
  const [currentScreen, setCurrentScreen] = useState('playlists');
  /** @state Stores the list of available Gemini models fetched from the backend. */
  const [availableModels, setAvailableModels] = useState([]);
  /** @state Stores the ID of the Gemini model currently selected by the user. */
  const [selectedModelId, setSelectedModelId] = useState('');


  /**
   * Navigates to the specified screen.
   * @param {string} screen - The name of the screen to navigate to.
   */
  const navigateTo = (screen) => {
    setCurrentScreen(screen);
  };

  // Authentication-related state and handlers.
  const {
    currentUser,
    isLoggedIn,
    isAuthorizedUser,
    isYouTubeLinkedByAuthCheck,
    availableModels: fetchedModels, // Renamed to avoid conflict with state
    authChecked,
    appAuthorizationError,
    isLoadingAuth,
    handleFirebaseLogin,
    handleFirebaseLogout,
  } = useAuth(setPopup);

  // Effect to update availableModels state when fetchedModels changes,
  // and filter out "tts" or "vision" models.
  useEffect(() => {
    if (fetchedModels && fetchedModels.length > 0) {
      const filteredModels = fetchedModels.filter((modelName) => {
        const lowerModelName = modelName.toLowerCase();
        return !lowerModelName.includes('tts') && !lowerModelName.includes('vision');
      });
      setAvailableModels(filteredModels);
      if (filteredModels.length === 0 && fetchedModels.length > 0) {
        console.warn('All available models were filtered out (tts/vision). Check model list from backend if this is unexpected.');
      }
    } else if (fetchedModels) { // fetchedModels is an empty array
      setAvailableModels([]);
    }
  }, [fetchedModels]);

  // Effect to manage selectedModelId based on localStorage and the (now filtered) availableModels
  useEffect(() => {
    if (availableModels.length > 0) {
      const storedPreference = localStorage.getItem('preferredGeminiModel');

      if (storedPreference && availableModels.includes(storedPreference)) {
        setSelectedModelId(storedPreference);
      } else {
        // No stored preference, or stored preference is no longer valid.
        // Backend already sorts availableModels alphabetically descending.
        // Try to find the first model containing "flash"
        const flashModel = availableModels.find((modelName) => modelName.toLowerCase().includes('flash'));

        let defaultToSet;
        if (flashModel) {
          defaultToSet = flashModel;
        } else if (availableModels.length > 0) {
          // If no "flash" model, use the first model from the (descending sorted) list
          defaultToSet = availableModels[0];
        } else {
          // Absolute fallback if availableModels is somehow empty (should not happen if backend works)
          defaultToSet = 'models/gemini-1.5-flash-latest'; // Or some other hardcoded app default
        }

        if (defaultToSet) {
          setSelectedModelId(defaultToSet);
          localStorage.setItem('preferredGeminiModel', defaultToSet);
          // console.log('Default AI model set to:', defaultToSet); // Line removed
        }
      }
    }
  }, [availableModels]);

  /**
   * Handles changes to the selected Gemini model.
   * Updates the state and stores the preference in localStorage.
   * @param {string} newModelId - The ID of the newly selected model.
   */
  const handleModelSelection = (newModelId) => {
    setSelectedModelId(newModelId);
    localStorage.setItem('preferredGeminiModel', newModelId);
    if (setPopup) {
      const modelDisplayName = newModelId.split('/').pop(); // Get 'gemini-x-y-latest' part
      setPopup({visible: true, message: `AI Model set to: ${modelDisplayName}`, type: 'info'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 2000);
    }
  };

  // YouTube API interaction state and handlers.
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

  // WebSocket chat functionality state and handlers.
  const {
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    activeOutputTab,
    setActiveOutputTab,
    isStreaming,
    handleQuerySubmit: originalHandleQuerySubmit,
  } = useWebSocketChat(selectedPlaylistId, isPlaylistDataReadyForChat, setPopup, setError, selectedModelId);

  /**
   * Handles the submission of a new query to the chat, setting the active output tab to 'Thinking'.
   * @param {string} query - The user's query.
   */
  const handleQuerySubmit = (query) => {
    setActiveOutputTab('Thinking');
    originalHandleQuerySubmit(query);
  };

  /** @type {boolean} Boolean flag to determine if the loading overlay should be shown. */
  const showOverlay = isLoadingAuth || isLoadingYouTube;

  /** @type {React.RefObject<boolean>} Reference to the previous streaming state, used to detect when streaming ends. */
  const prevIsStreaming = useRef(isStreaming);

  // Handles UI changes when AI response streaming ends, like switching to the suggestions tab.
  useEffect(() => {
    if (prevIsStreaming.current && !isStreaming) {
      if (suggestedVideos && suggestedVideos.length > 0) {
        setActiveOutputTab('suggestions');
      }
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming, suggestedVideos, setActiveOutputTab]);

  // Fetches user playlists when authenticated and YouTube is linked, or resets state if not.
  useEffect(() => {
    if (isLoggedIn && isAuthorizedUser && isYouTubeLinked && userPlaylists.length === 0 && !isLoadingYouTube && !youtubeSpecificError && !appAuthorizationError) {
      fetchUserPlaylists();
    } else if (!isLoggedIn || !isAuthorizedUser) {
      setYouTubeUserPlaylists([]);
      setSelectedPlaylistId('');
      setYouTubeVideos([]);
      setCurrentScreen('login');
    }
  }, [
    isLoggedIn, isAuthorizedUser, isYouTubeLinked, userPlaylists.length,
    isLoadingYouTube, youtubeSpecificError, appAuthorizationError, fetchUserPlaylists,
    setYouTubeUserPlaylists, setSelectedPlaylistId, setYouTubeVideos,
  ]);

  // Manages navigation based on authentication and YouTube link status.
  useEffect(() => {
    if (authChecked) {
      if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked) {
        setCurrentScreen('login');
      } else if (currentScreen === 'login' && isLoggedIn && isAuthorizedUser && isYouTubeLinked) {
        setCurrentScreen('playlists');
      }
    }
  }, [authChecked, isLoggedIn, isAuthorizedUser, isYouTubeLinked, currentScreen]);


  // Auto-scrolls the thinking output container when new content is added.
  useEffect(() => {
    if (activeOutputTab === 'Thinking' && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop = thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, activeOutputTab]);

  /**
   * Handles playlist selection changes within the chat interface.
   * Fetches items for the newly selected playlist.
   * @param {React.SyntheticEvent} event - The selection event, typically from a dropdown.
   */
  const handlePlaylistSelectionInChat = useCallback(async (event) => {
    const newPlaylistId = event.target.value;
    setIsPlaylistDataReadyForChat(false);
    setSelectedPlaylistId(newPlaylistId);
    setError(null); // Clear previous general errors
    setYouTubeErrorAppLevel(null); // Clear previous YouTube specific errors
    if (newPlaylistId) {
      const fetchSuccess = await fetchPlaylistItems(newPlaylistId);
      if (fetchSuccess) {
        setIsPlaylistDataReadyForChat(true);
      }
    } else {
      // If no playlist is selected (e.g., "Select a playlist" option)
      setYouTubeVideos([]); // Clear videos
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, setYouTubeVideos, setYouTubeErrorAppLevel, setError, setIsPlaylistDataReadyForChat]);

  /**
   * Handles playlist selection from the main playlists screen.
   * Fetches items for the selected playlist and navigates to the chat screen.
   * @param {string} playlistId - The ID of the selected playlist.
   */
  const handleSelectPlaylistFromList = useCallback(async (playlistId) => {
    if (!playlistId) {
      // Should not happen if playlists are always present, but good for robustness
      return;
    }
    setIsPlaylistDataReadyForChat(false);
    setSelectedPlaylistId(playlistId);
    setError(null); // Clear previous general errors
    setYouTubeErrorAppLevel(null); // Clear previous YouTube specific errors
    const fetchSuccess = await fetchPlaylistItems(playlistId);
    if (fetchSuccess) {
      setIsPlaylistDataReadyForChat(true);
      navigateTo('chat');
    } else {
      // Error handled by useYouTube hook via setPopup
      setPopup({visible: true, message: 'Failed to load playlist items.', type: 'error'});
      setTimeout(() => {
        setPopup((p) => ({...p, visible: false}));
      }, 3000);
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, navigateTo, setIsPlaylistDataReadyForChat, setError, setYouTubeErrorAppLevel, setPopup]);

  /**
   * Refreshes the items for the currently selected playlist.
   * Shows a status popup on success or if no playlist is selected.
   */
  const refreshSelectedPlaylistItems = async () => {
    if (selectedPlaylistId) {
      setError(null); // Clear previous general errors
      setYouTubeErrorAppLevel(null); // Clear previous YouTube specific errors
      const fetchSuccess = await fetchPlaylistItems(selectedPlaylistId);
      if (fetchSuccess) {
        setIsPlaylistDataReadyForChat(true);
        if (setPopup) {
          setPopup({visible: true, message: 'Playlist refreshed.', type: 'info'});
        }
        setTimeout(() => {
          if (setPopup) {
            setPopup((p) => ({...p, visible: false}));
          }
        }, 2000);
      }
    } else {
      if (setPopup) {
        setPopup({visible: true, message: 'Please select a playlist first.', type: 'error'});
      }
      setTimeout(() => {
        if (setPopup) {
          setPopup((p) => ({...p, visible: false}));
        }
      }, 3000);
    }
  };

  /**
   * Renders the content for the current active screen.
   * This function determines which main view to display based on the application's
   * authentication state, YouTube link status, and the `currentScreen` state.
   * @returns {JSX.Element|null} The JSX element for the current screen, or null if
   * authentication check is not complete.
   */
  const renderScreenContent = () => {
    if (!authChecked) {
      return null;
    }

    if (!isLoggedIn) {
      return <LoginScreen onLogin={handleFirebaseLogin} />;
    }

    if (!isAuthorizedUser) {
      return <UserStatusMessages currentUser={currentUser} isLoggedIn={isLoggedIn} isAuthorizedUser={isAuthorizedUser} authChecked={authChecked} />;
    }

    if (!isYouTubeLinked) {
      return <ConnectYouTubeView onConnectYouTube={handleConnectYouTube} error={youtubeSpecificError} appAuthorizationError={appAuthorizationError} />;
    }

    switch (currentScreen) {
      case 'playlists':
        return <PlaylistsScreen userPlaylists={userPlaylists} onSelectPlaylist={handleSelectPlaylistFromList} />;
      case 'chat':
        if (!selectedPlaylistId) {
          return (
            <div style={{padding: '20px', textAlign: 'center'}}>
              <h2>Chat</h2>
              <p>Please select a playlist from the 'Playlists' screen first.</p>
              <button onClick={() => navigateTo('playlists')}>Go to Playlists</button>
            </div>
          );
        }
        return (
          <ChatScreen
            userPlaylists={userPlaylists}
            selectedPlaylistId={selectedPlaylistId}
            onPlaylistSelection={handlePlaylistSelectionInChat}
            isLoadingYouTube={isLoadingYouTube}
            onRefreshPlaylist={refreshSelectedPlaylistItems}
            onQuerySubmit={handleQuerySubmit}
            isStreaming={isStreaming}
            activeOutputTab={activeOutputTab}
            onSetOutputTab={setActiveOutputTab}
            suggestedVideos={suggestedVideos}
            lastQuery={lastQuery}
            thinkingOutput={thinkingOutput}
            thinkingOutputContainerRef={thinkingOutputContainerRef}
          />
        );
      case 'settings':
        return (
          <div style={{padding: '20px', textAlign: 'center'}}>
            <h1>Settings</h1>
            <div>
              <label htmlFor="model-select">Select AI Model: </label>
              <select id="model-select" value={selectedModelId} onChange={(e) => handleModelSelection(e.target.value)} disabled={availableModels.length === 0}>
                {availableModels.length === 0 && <option value="">Loading models...</option>}
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model.split('/').pop()}
                  </option>
                ))}
              </select>
            </div>
            <br />
            <button onClick={handleFirebaseLogout}>Logout</button>
          </div>
        );
      default:
        return <PlaylistsScreen userPlaylists={userPlaylists} onSelectPlaylist={handleSelectPlaylistFromList} />;
    }
  };

  /**
   * Renders the header for the current active screen.
   * The header title changes based on the current screen.
   * Navigation icons are currently not implemented in this header version.
   * @returns {JSX.Element|null} The JSX element for the screen header, or null if
   * no header should be displayed (e.g., on login or status screens).
   */
  const renderCurrentScreenHeader = () => {
    if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked) {
      return null;
    }

    if (currentScreen === 'login' ||
        (isLoggedIn && !isAuthorizedUser) ||
        (isLoggedIn && isAuthorizedUser && !isYouTubeLinked)) {
      return null;
    }

    let title = '';
    const onLeftIconClick = null;
    const onRightIconClick = null;

    if (currentScreen === 'playlists') {
      title = 'Playlists';
    } else if (currentScreen === 'chat') {
      const selected = userPlaylists.find((p) => p.id === selectedPlaylistId);
      title = selected ? `Playlist: ${selected.title}` : 'Chat';
    } else if (currentScreen === 'settings') {
      title = 'Settings';
    } else {
      return null;
    }

    return (
      <ScreenHeader
        title={title}
        onLeftIconClick={onLeftIconClick}
        onRightIconClick={onRightIconClick}
      />
    );
  };

  return (
    <div className="App">
      {showOverlay && <LoadingOverlay />}
      {popup.visible && <StatusPopup message={popup.message} type={popup.type} />}

      {renderCurrentScreenHeader()}

      <div className="screen-content-wrapper">
        {error && <p style={{color: 'red', fontWeight: 'bold', padding: '10px'}}>{error}</p>}
        {renderScreenContent()}
      </div>

      {isLoggedIn && isAuthorizedUser && isYouTubeLinked &&
        <BottomNavigationBar currentScreen={currentScreen} onNavigate={navigateTo} />}
    </div>
  );
}

export default App;
