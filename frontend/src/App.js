/**
 * @fileoverview This file defines the main React application component for ReelWorthy.
 * It handles user authentication, YouTube API interactions, playlist management,
 * and the chat interface with the Gemini AI service.
 */
import React, {useState, useEffect, useCallback, useRef} from 'react';
import './App.css';
import {useAuth} from './hooks/useAuth';
import {useYouTube} from './hooks/useYouTube';
import {useWebSocketChat} from './hooks/useWebSocketChat';

import {LoadingOverlay} from './components/LoadingOverlay';
import {StatusPopup} from './components/StatusPopup';
import {ScreenHeader} from './components/ScreenHeader'; // Import ScreenHeader

// Import screen content components
import {LoginScreen} from './components/LoginScreen';
import {ConnectYouTubeView} from './components/ConnectYouTubeView';
import {UserStatusMessages} from './components/UserStatusMessages';
import {BottomNavigationBar} from './components/BottomNavigationBar';
import {PlaylistsScreen} from './components/PlaylistsScreen';
import {ChatScreen} from './components/ChatScreen';
import {SettingsScreen} from './components/SettingsScreen';


/**
 * The main application component for ReelWorthy.
 * @returns {JSX.Element} The rendered App component.
 */
function App() {
  /**
   * @type {React.RefObject<HTMLDivElement>}
   * Reference to the DOM element that displays the AI's thinking process, used for auto-scrolling.
   */
  const thinkingOutputContainerRef = useRef(null);

  /**
   * @state Manages the visibility, message, and type of status popups.
   * @type {{visible: boolean, message: string, type: string}}
   */
  const [popup, setPopup] = useState({visible: false, message: '', type: ''});
  /**
   * @state Stores any general error messages to be displayed.
   * @type {string|null}
   */
  const [error, setError] = useState(null);
  /**
   * @state Flag indicating if the selected playlist's items are loaded and ready for chat interaction.
   * @type {boolean}
   */
  const [isPlaylistDataReadyForChat, setIsPlaylistDataReadyForChat] = useState(false);
  /**
   * @state Tracks the currently active screen/view in the application.
   * @type {string} Possible values: 'login', 'playlists', 'chat', 'settings'.
   */
  const [currentScreen, setCurrentScreen] = useState('playlists');
  /**
   * @state Stores the list of available Gemini models fetched from the backend and filtered.
   * @type {string[]}
   */
  const [availableModels, setAvailableModels] = useState([]);
  /**
   * @state Stores the ID of the Gemini model currently selected by the user.
   * @type {string}
   */
  const [selectedModelId, setSelectedModelId] = useState('');
  const [initialAutoNavAttempted, setInitialAutoNavAttempted] = useState(false);
  const [includeSubscriptionFeed, setIncludeSubscriptionFeed] = useState(() => {
    return localStorage.getItem('reelworthy_settings_includeSubscriptionFeed') === 'true';
  });
  // No App.js state needed for localStorageDefaultPlaylistId for settings UI itself,
  // as SettingsScreen now handles its own localStorage interactions for setting the default.
  // App.js will read directly from localStorage for auto-navigation logic.

  /**
   * Navigates to the specified screen.
   * @param {string} screen - The name of the screen to navigate to (e.g., 'login', 'playlists', 'chat', 'settings').
   * @returns {void}
   */
  const navigateTo = useCallback((screen) => {
    setCurrentScreen(screen);
  }, [setCurrentScreen]); // setCurrentScreen is stable

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

  /**
   * Effect to process and filter the list of Gemini models fetched from the backend.
   * It filters out models containing "tts" or "vision" in their names, as they
   * are not suitable for the chat functionality.
   */
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
    } else if (fetchedModels) { // fetchedModels is an empty array, or null/undefined after initial state
      setAvailableModels([]);
    }
  }, [fetchedModels]);

  /**
   * Effect to determine and set the selected Gemini model ID.
   * It prioritizes a model stored in localStorage if it's valid and available.
   * Otherwise, it defaults to the first "flash" model, then the first available model,
   * or a hardcoded fallback. The chosen default is then saved to localStorage.
   */
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
   * Handles changes to the selected Gemini model from the UI.
   * Updates the `selectedModelId` state and persists the choice in `localStorage`.
   * Shows a confirmation popup to the user.
   * @param {string} newModelId - The ID of the newly selected Gemini model.
   * @returns {void}
   */
  const handleModelSelection = (newModelId) => {
    setSelectedModelId(newModelId);
    localStorage.setItem('preferredGeminiModel', newModelId);
    if (setPopup) {
      const modelDisplayName = newModelId.split('/').pop(); // Get 'gemini-x-y-latest' part for display
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

  /**
   * Handles playlist selection from the main playlists screen.
   * Fetches items for the selected playlist and navigates to the chat screen.
   * @param {string} playlistId - The ID of the selected playlist.
   * @returns {Promise<void>}
   */
  const handleSelectPlaylistFromList = useCallback(async (playlistId) => {
    if (!playlistId) {
      console.warn('handleSelectPlaylistFromList called with no playlistId');
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
      // A generic popup is already shown by useYouTube on fetch failure.
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, navigateTo, setIsPlaylistDataReadyForChat, setError, setYouTubeErrorAppLevel, setPopup]);

  /**
   * Handles playlist selection changes within the chat interface.
   * Fetches items for the newly selected playlist.
   * @param {React.SyntheticEvent<HTMLSelectElement>} event - The selection event from a dropdown.
   * @returns {Promise<void>}
   */
  const handlePlaylistSelectionInChat = useCallback(async (event) => {
    const newPlaylistId = event.target.value;
    setIsPlaylistDataReadyForChat(false); // Indicate data is not ready for the new playlist
    setSelectedPlaylistId(newPlaylistId);
    setError(null); // Clear previous general errors
    setYouTubeErrorAppLevel(null); // Clear previous YouTube specific errors
    if (newPlaylistId) {
      const fetchSuccess = await fetchPlaylistItems(newPlaylistId);
      if (fetchSuccess) {
        setIsPlaylistDataReadyForChat(true); // Data is ready for chat
      }
      // If fetchSuccess is false, error is handled by useYouTube hook via setPopup
    } else {
      // If no playlist is selected (e.g., "Select a playlist" option)
      setYouTubeVideos([]); // Clear videos
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, setYouTubeVideos, setYouTubeErrorAppLevel, setError, setIsPlaylistDataReadyForChat]);

  /**
   * Refreshes the items for the currently selected playlist.
   * Shows a status popup on success or if no playlist is selected.
   * @returns {Promise<void>}
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

  // WebSocket chat functionality state and handlers.
  const {
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    responseBuildUp, // Added
    // internalThinkingOutput, // Removed
    activeOutputTab,
    setActiveOutputTab,
    isStreaming,
    handleQuerySubmit: originalHandleQuerySubmit,
  } = useWebSocketChat(
      selectedPlaylistId,
      isPlaylistDataReadyForChat,
      setPopup,
      setError,
      selectedModelId,
      currentUser?.uid,
      includeSubscriptionFeed, // Pass the state here
  );

  /**
   * Handles the submission of a new query to the chat, setting the active output tab to 'Thinking'.
   * @param {string} query - The user's query.
   * @returns {void}
   */
  const handleQuerySubmit = (query) => {
    setActiveOutputTab('Thinking');
    originalHandleQuerySubmit(query);
  };

  /**
   * @type {boolean} Boolean flag to determine if the loading overlay should be shown,
   * based on authentication or YouTube API loading states.
   */
  const showOverlay = isLoadingAuth || isLoadingYouTube;

  /**
   * @type {React.RefObject<boolean>}
   * Reference to the previous streaming state, used to detect when streaming ends.
   */
  const prevIsStreaming = useRef(isStreaming);

  /**
   * Effect to handle UI changes when AI response streaming ends.
   * Switches to the 'suggestions' tab if suggestions are available.
   */
  useEffect(() => {
    if (prevIsStreaming.current && !isStreaming) {
      if (suggestedVideos && suggestedVideos.length > 0) {
        setActiveOutputTab('suggestions');
      }
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming, suggestedVideos, setActiveOutputTab]);

  /**
   * Effect to fetch user playlists when authenticated and YouTube is linked.
   * Resets playlist and video states if the user is not logged in or authorized.
   */
  useEffect(() => {
    if (isLoggedIn && isAuthorizedUser && isYouTubeLinked && userPlaylists.length === 0 && !isLoadingYouTube && !youtubeSpecificError && !appAuthorizationError) {
      fetchUserPlaylists();
    } else if (!isLoggedIn || !isAuthorizedUser) {
      setYouTubeUserPlaylists([]);
      setSelectedPlaylistId('');
      setYouTubeVideos([]);
      setCurrentScreen('login'); // Navigate to login if auth conditions are not met
    }
  }, [
    isLoggedIn, isAuthorizedUser, isYouTubeLinked, userPlaylists.length,
    isLoadingYouTube, youtubeSpecificError, appAuthorizationError, fetchUserPlaylists,
    setYouTubeUserPlaylists, setSelectedPlaylistId, setYouTubeVideos, setCurrentScreen,
  ]);

  /**
   * Effect to manage navigation based on authentication and YouTube link status.
   * Ensures the user is on the correct screen (login or playlists) based on their status.
   */
  useEffect(() => {
    if (authChecked) {
      if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked) {
        setCurrentScreen('login');
      } else if (currentScreen === 'login' && isLoggedIn && isAuthorizedUser && isYouTubeLinked) {
        // If user was on login but is now fully authenticated,
        // check for default playlist before navigating to 'playlists'.
        // The auto-navigation effect below will handle this.
        // If no default, it will effectively fall through to 'playlists' or stay if already there.
        // No direct navigation to 'playlists' here anymore if a default might take precedence.
      }
    }
  }, [authChecked, isLoggedIn, isAuthorizedUser, isYouTubeLinked, currentScreen]);

  /**
   * Effect to automatically load and navigate to a default playlist if configured.
   * This runs when auth status is confirmed, user is fully authenticated, YouTube is linked,
   * playlists are loaded, and a default playlist is enabled in localStorage.
   */
  useEffect(() => {
    const useDefaultEnabled = localStorage.getItem('reelworthy_useDefaultPlaylistEnabled') === 'true';
    const storedDefaultPlaylistId = localStorage.getItem('reelworthy_defaultPlaylistId');

    // Exit if initial checks not complete or if auto-nav already attempted
    if (!authChecked || !isLoggedIn || !isAuthorizedUser || !isYouTubeLinked || initialAutoNavAttempted) {
      return;
    }

    // If playlists are not loaded yet, and we might need them (because a default is set), wait.
    if (useDefaultEnabled && storedDefaultPlaylistId && userPlaylists.length === 0) {
      return; // Will re-run when userPlaylists updates
    }

    // At this point, all auth checks passed, and if a default is set, playlists are also loaded.
    // Now we can make a definitive decision and then mark auto-nav as attempted.

    if (useDefaultEnabled && storedDefaultPlaylistId) {
      // A default playlist is configured
      if (userPlaylists.length > 0) { // This check is now more of a safeguard
        const defaultPlaylistExists = userPlaylists.some((p) => p.id === storedDefaultPlaylistId);
        if (defaultPlaylistExists) {
          if (currentScreen !== 'chat') { // Only attempt auto-nav if not already in chat
            if (selectedPlaylistId === storedDefaultPlaylistId && isPlaylistDataReadyForChat) {
              navigateTo('chat'); // Already loaded, just navigate
            } else if (selectedPlaylistId !== storedDefaultPlaylistId || !isPlaylistDataReadyForChat) {
              console.log(`Auto-loading default playlist: ${storedDefaultPlaylistId}`);
              handleSelectPlaylistFromList(storedDefaultPlaylistId);
            }
          }
        } else {
          // Default playlist from localStorage doesn't exist in current userPlaylists
          console.warn('Default playlist from localStorage not found. Clearing default settings.');
          localStorage.removeItem('reelworthy_defaultPlaylistId');
          localStorage.removeItem('reelworthy_useDefaultPlaylistEnabled');
          // If user was on login, and default is now invalid, send to playlists
          if (currentScreen === 'login') {
            navigateTo('playlists');
          }
        }
      }
    } else if (currentScreen === 'login') {
      // No default playlist is set (or enabled), and user is on login screen after full auth.
      // Navigate to playlists screen.
      navigateTo('playlists');
    }
    // Mark auto-navigation as attempted so this logic doesn't run again unnecessarily.
    setInitialAutoNavAttempted(true);
  }, [
    authChecked, isLoggedIn, isAuthorizedUser, isYouTubeLinked,
    userPlaylists, currentScreen, handleSelectPlaylistFromList,
    selectedPlaylistId, isPlaylistDataReadyForChat, navigateTo,
    initialAutoNavAttempted,
  ]);


  /**
   * Effect to auto-scroll the 'Thinking' output container when new content is added.
   */
  useEffect(() => {
    if (activeOutputTab === 'Thinking' && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop = thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, responseBuildUp, activeOutputTab]); // Added responseBuildUp

  /**
   * Renders the content for the current active screen.
   * This function determines which main view to display based on the application's
   * authentication state, YouTube link status, and the `currentScreen` state.
   * @returns {JSX.Element|null} The JSX element for the current screen, or null if
   * authentication check is not complete or no appropriate screen can be determined.
   */
  const renderScreenContent = () => {
    if (!authChecked) {
      return null; // Or a global loading indicator, e.g., <LoadingOverlay message="Initializing..." />
    }

    if (!isLoggedIn) {
      return <LoginScreen onLogin={handleFirebaseLogin} />;
    }

    if (!isAuthorizedUser) {
      // Display messages related to authorization status (e.g., not on allow-list)
      return <UserStatusMessages currentUser={currentUser} isLoggedIn={isLoggedIn} isAuthorizedUser={isAuthorizedUser} authChecked={authChecked} appAuthorizationError={appAuthorizationError} />;
    }

    if (!isYouTubeLinked) {
      // Display view for connecting YouTube account
      return <ConnectYouTubeView onConnectYouTube={handleConnectYouTube} error={youtubeSpecificError} />;
    }

    // Main content rendering based on currentScreen
    switch (currentScreen) {
      case 'playlists':
        return <PlaylistsScreen userPlaylists={userPlaylists} onSelectPlaylist={handleSelectPlaylistFromList} />;
      case 'chat':
        if (!selectedPlaylistId) {
          // If trying to access chat screen without a selected playlist, guide user back.
          return (
            <div style={{padding: '20px', textAlign: 'center'}}>
              <h2>Chat</h2>
              <p>Please select a playlist from the 'Playlists' screen first.</p>
              <button onClick={() => navigateTo('playlists')}>Go to Playlists</button>
            </div>
          );
        }
        // Render chat screen with all necessary props
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
            responseBuildUp={responseBuildUp} // Added
            // internalThinkingOutput={internalThinkingOutput} // Removed
            thinkingOutputContainerRef={thinkingOutputContainerRef}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            selectedModelId={selectedModelId}
            availableModels={availableModels}
            onModelSelection={handleModelSelection}
            onLogout={handleFirebaseLogout}
            userPlaylists={userPlaylists}
            includeSubscriptionFeed={includeSubscriptionFeed}
            onIncludeSubscriptionFeedChange={setIncludeSubscriptionFeed}
            // SettingsScreen now manages its own localStorage for default playlist settings
          />
        );
      default:
        // If currentScreen is 'login' here, it means all auth checks passed,
        // and we are likely waiting for an effect to navigate to 'playlists' or 'chat'.
        // Avoid warning for 'login' in this specific scenario.
        if (currentScreen !== 'login') {
          console.warn(`Unknown screen: ${currentScreen}, defaulting to playlists.`);
        }
        // Default to playlists screen if currentScreen is unrecognized or user is in a valid state for it
        return <PlaylistsScreen userPlaylists={userPlaylists} onSelectPlaylist={handleSelectPlaylistFromList} />;
    }
  };

  /**
   * Renders the header for the current active screen.
   * The header title changes based on the current screen.
   * @returns {JSX.Element|null} The JSX element for the screen header, or null if
   * no header should be displayed (e.g., on login or status screens).
   */
  const renderCurrentScreenHeader = () => {
    // Do not render header if user is not fully authenticated and YouTube linked,
    // or on intermediate auth/status screens.
    if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked || currentScreen === 'login') {
      return null;
    }
    // Also, if user is logged in but not authorized, UserStatusMessages handles its own display.
    if (isLoggedIn && !isAuthorizedUser) return null;
    // Also, if user is authorized but YouTube not linked, ConnectYouTubeView handles its own display.
    if (isLoggedIn && isAuthorizedUser && !isYouTubeLinked) return null;


    let title = '';
    // Left/Right icon click handlers are null as they are not used in this header version.
    const onLeftIconClick = null;
    const onRightIconClick = null;

    // Determine title based on the current screen
    if (currentScreen === 'playlists') {
      title = 'Playlists';
    } else if (currentScreen === 'chat') {
      const selected = userPlaylists.find((p) => p.id === selectedPlaylistId);
      title = selected ? `Playlist: ${selected.title}` : 'Chat'; // Updated title format
    } else if (currentScreen === 'settings') {
      title = 'Settings';
    } else {
      // Should not happen if currentScreen is always valid and handled above
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

  // Main application layout
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
