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
  const thinkingOutputContainerRef = useRef(null);

  const [popup, setPopup] = useState({visible: false, message: '', type: ''});
  const [error, setError] = useState(null);
  const [isPlaylistDataReadyForChat, setIsPlaylistDataReadyForChat] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('playlists');

  const navigateTo = (screen) => {
    setCurrentScreen(screen);
  };

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
    handleQuerySubmit: originalHandleQuerySubmit,
  } = useWebSocketChat(selectedPlaylistId, isPlaylistDataReadyForChat, setPopup, setError);

  const handleQuerySubmit = (query) => {
    setActiveOutputTab('Thinking');
    originalHandleQuerySubmit(query);
  };

  const showOverlay = isLoadingAuth || isLoadingYouTube;

  const prevIsStreaming = useRef(isStreaming);
  useEffect(() => {
    if (prevIsStreaming.current && !isStreaming) {
      if (suggestedVideos && suggestedVideos.length > 0) {
        setActiveOutputTab('suggestions');
      }
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming, suggestedVideos, setActiveOutputTab]);

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

  useEffect(() => {
    if (authChecked) {
      if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked) {
        setCurrentScreen('login');
      } else if (currentScreen === 'login' && isLoggedIn && isAuthorizedUser && isYouTubeLinked) {
        setCurrentScreen('playlists');
      }
    }
  }, [authChecked, isLoggedIn, isAuthorizedUser, isYouTubeLinked, currentScreen]);


  useEffect(() => {
    if (activeOutputTab === 'Thinking' && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop = thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, activeOutputTab]);

  const handlePlaylistSelectionInChat = useCallback(async (event) => {
    const newPlaylistId = event.target.value;
    setIsPlaylistDataReadyForChat(false);
    setSelectedPlaylistId(newPlaylistId);
    setError(null);
    setYouTubeErrorAppLevel(null);
    if (newPlaylistId) {
      const fetchSuccess = await fetchPlaylistItems(newPlaylistId);
      if (fetchSuccess) {
        setIsPlaylistDataReadyForChat(true);
      }
    } else {
      setYouTubeVideos([]);
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, setYouTubeVideos, setYouTubeErrorAppLevel, setError, setIsPlaylistDataReadyForChat]);

  const handleSelectPlaylistFromList = useCallback(async (playlistId) => {
    if (!playlistId) {
      return;
    }
    setIsPlaylistDataReadyForChat(false);
    setSelectedPlaylistId(playlistId);
    setError(null);
    setYouTubeErrorAppLevel(null);
    const fetchSuccess = await fetchPlaylistItems(playlistId);
    if (fetchSuccess) {
      setIsPlaylistDataReadyForChat(true);
      navigateTo('chat');
    } else {
      setPopup({visible: true, message: 'Failed to load playlist items.', type: 'error'});
      setTimeout(() => {
        setPopup((p) => ({...p, visible: false}));
      }, 3000);
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, navigateTo, setIsPlaylistDataReadyForChat, setError, setYouTubeErrorAppLevel, setPopup]);

  const refreshSelectedPlaylistItems = async () => {
    if (selectedPlaylistId) {
      setError(null);
      setYouTubeErrorAppLevel(null);
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
        return <div style={{padding: '20px', textAlign: 'center'}}><h1>Settings</h1><p>Settings content will go here.</p><button onClick={handleFirebaseLogout}>Logout</button></div>;
      default:
        return <PlaylistsScreen userPlaylists={userPlaylists} onSelectPlaylist={handleSelectPlaylistFromList} />;
    }
  };

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
    const onLeftIconClick = null; // Changed to const, always null for these screens
    const onRightIconClick = null; // Settings icon removed

    if (currentScreen === 'playlists') {
      title = 'Playlists';
    } else if (currentScreen === 'chat') {
      const selected = userPlaylists.find((p) => p.id === selectedPlaylistId);
      title = selected ? selected.title : 'Chat';
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
