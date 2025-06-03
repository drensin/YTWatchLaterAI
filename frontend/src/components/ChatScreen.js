import React from 'react';
// ScreenHeader is now rendered by App.js
import ChatViewContent from './ChatViewContent';

/**
 * Renders the content for the Chat screen for a selected playlist.
 * The header is now handled by App.js.
 * @param {object} props - The component's props, passed down from App.js.
 * @param {Function} props.onQuerySubmit - Handler for submitting a chat query.
 * @param {boolean} props.isStreaming - Whether the chat response is streaming.
 * @param {string} props.activeOutputTab - The active tab in the output section.
 * @param {Function} props.onSetOutputTab - Handler to set the active output tab.
 * @param {Array} props.suggestedVideos - Array of suggested videos.
 * @param {string} props.lastQuery - The last submitted query.
 * @param {string} props.thinkingOutput - The AI's thinking process output.
 * @param {object} props.thinkingOutputContainerRef - Ref for the thinking output container.
 * @returns {React.ReactElement} The rendered Chat screen.
 */
function ChatScreen(props) {
  // selectedPlaylistId and userPlaylists are still passed in for ChatViewContent,
  // but onNavigate, playlistTitle, handleSettingsClick, handleBackClick are removed
  // as the header is now managed by App.js.
  // All props are effectively for ChatViewContent now.
  const {
    selectedPlaylistId,
    userPlaylists,
    /* other props for ChatViewContent */
    ...chatViewProps
  } = props;


  return (
    <div className="chat-screen"> {/* This root div might need adjustment or removal */}
      {/* <ScreenHeader title={playlistTitle} ... /> REMOVED */}
      <div className="chat-screen-content">
        <ChatViewContent
          selectedPlaylistId={selectedPlaylistId}
          userPlaylists={userPlaylists}
          {...chatViewProps}
        />
      </div>
    </div>
  );
}

export default ChatScreen;
