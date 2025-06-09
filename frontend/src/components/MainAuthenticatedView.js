/**
 * @fileoverview Defines the MainAuthenticatedView React component.
 * This component renders the primary interface for users who are logged in
 * and have connected their YouTube account. It includes functionality for
 * playlist selection, interacting with the AI chat, and viewing video suggestions.
 */
import React from 'react';
import {ChatInterface} from './ChatInterface';
import {VideoList} from './VideoList';

// Constants for Tab Names
const TAB_RESULTS = 'Results';
const TAB_THINKING = 'Thinking';

/**
 * Renders the main view for an authenticated and YouTube-linked user.
 * Includes playlist selection, chat interface, and video results.
 * @param {object} props - The component's props.
 * @param {Array<{id: string, title: string, itemCount: number}>} props.userPlaylists - List of user's YouTube playlists.
 * @param {string} props.selectedPlaylistId - ID of the currently selected playlist.
 * @param {(event: React.ChangeEvent<HTMLSelectElement>) => void} props.onPlaylistSelection - Handler for playlist selection.
 * @param {boolean} props.isLoadingYouTube - True if YouTube operations are in progress.
 * @param {() => void} props.onRefreshPlaylist - Handler to refresh playlist items.
 * @param {(query: string) => void} props.onQuerySubmit - Handler for submitting a chat query.
 * @param {boolean} props.isStreaming - True if AI is currently streaming a response.
 * @param {string} props.activeOutputTab - The active tab (e.g., TAB_RESULTS or TAB_THINKING).
 * @param {(tabName: string) => void} props.onSetOutputTab - Handler to change the active output tab.
 * @param {Array<{videoId: string, title: string, channelTitle: string, publishedAt: string, description: string, thumbnailUrl: string, duration: string, reason: string}>} props.suggestedVideos - Suggested videos from chat.
 * @param {string} props.lastQuery - The last query submitted by the user.
 * @param {string} props.thinkingOutput - Raw AI thinking output.
 * @param {React.RefObject<HTMLDivElement>} props.thinkingOutputContainerRef - Ref for the thinking output container.
 * @returns {JSX.Element} The rendered component.
 */
function MainAuthenticatedView(props) {
  const {
    userPlaylists,
    selectedPlaylistId,
    onPlaylistSelection,
    isLoadingYouTube,
    onRefreshPlaylist,
    onQuerySubmit,
    isStreaming,
    activeOutputTab,
    onSetOutputTab,
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    thinkingOutputContainerRef,
  } = props;

  return (
    <>
      <div>
        <label htmlFor='playlist-select'>Choose a playlist: </label>
        <select
          id='playlist-select'
          value={selectedPlaylistId}
          onChange={onPlaylistSelection}
          disabled={isLoadingYouTube || !userPlaylists || userPlaylists.length === 0}
        >
          <option value=''>-- Select a playlist --</option>
          {userPlaylists.map((pl) => (
            <option key={pl.id} value={pl.id}>
              {pl.title} ({pl.itemCount} items)
            </option>
          ))}
        </select>
        <button
          onClick={onRefreshPlaylist}
          disabled={isLoadingYouTube || !selectedPlaylistId}
          className='refresh-button'
          style={{marginLeft: '10px'}}
          title='Refresh playlist items'
        >
          ↺
        </button>
      </div>

      {selectedPlaylistId && (
        <>
          <ChatInterface onQuerySubmit={onQuerySubmit} disabled={isStreaming} />
          <div className='tabs'>
            <button
              onClick={() => onSetOutputTab(TAB_RESULTS)}
              className={activeOutputTab === TAB_RESULTS ? 'active' : ''}
              disabled={isStreaming}
            >
              Results
            </button>
            <button
              onClick={() => onSetOutputTab(TAB_THINKING)}
              className={activeOutputTab === TAB_THINKING ? 'active' : ''}
              disabled={isStreaming && activeOutputTab !== TAB_THINKING}
            >
              Thinking
            </button>
          </div>
          {activeOutputTab === TAB_RESULTS && (
            <>
              <h2>
                {suggestedVideos.length > 0 ?
                  `${suggestedVideos.length} Suggested Videos` :
                  (lastQuery ? 'No Suggestions Found' : 'Suggested Videos')}
              </h2>
              {lastQuery && <p className='last-query-display'>For query: <em>"{lastQuery}"</em></p>}
              <VideoList videos={suggestedVideos} />
            </>
          )}
          {activeOutputTab === TAB_THINKING && (
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
      {!selectedPlaylistId && userPlaylists && userPlaylists.length > 0 && !isLoadingYouTube && (
        <p>Select a playlist to see videos and get suggestions.</p>
      )}
      {(!userPlaylists || userPlaylists.length === 0) && !isLoadingYouTube && (
        <p>No playlists found. Try connecting YouTube or refreshing if you recently added some.</p>
      )}
    </>
  );
}

export {MainAuthenticatedView};
