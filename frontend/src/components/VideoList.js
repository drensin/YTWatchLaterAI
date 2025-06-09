/**
 * @fileoverview Defines the VideoList React component, which displays a list of
 * YouTube videos with their thumbnails, titles, durations, descriptions (expandable),
 * and a link to watch on YouTube.
 */
import React, {useState} from 'react';
// Removed memo and FixedSizeList as we are removing virtualization

/**
 * Renders a list of videos.
 * @param {object} props - The component's props.
 * @param {Array<VideoItemShape>} props.videos - Array of video objects to display.
 * @returns {JSX.Element} The rendered video list.
 *
 * @typedef {object} VideoItemShape
 * @property {string} [id] - Optional ID, fallback if videoId is not present.
 * @property {string} [videoId] - The YouTube video ID.
 * @property {string} title - The title of the video.
 * @property {string} [thumbnailUrl] - Optional URL for the video thumbnail.
 * @property {string} [duration] - Optional formatted duration string (e.g., "HH:MM:SS").
 * @property {string} [description] - Optional video description.
 * @property {string} [reason] - Optional reason why the video was suggested by AI.
 */

const DESCRIPTION_MAX_LENGTH = 150;

function VideoList({videos}) {
  /**
   * @state Manages the expanded/collapsed state of video descriptions, keyed by video ID.
   * @type {Object<string, boolean>}
   */
  const [expandedDescriptions, setExpandedDescriptions] = useState({});

  if (!videos || videos.length === 0) {
    return <p>No videos to display.</p>;
  }

  /**
   * Toggles the expanded state of a video's description.
   * @param {string} videoId - The ID of the video whose description state to toggle.
   * @returns {void}
   */
  const toggleDescription = (videoId) =>
    setExpandedDescriptions((prev) => ({
      ...prev, [videoId]: !prev[videoId],
    }));

  /**
   * Renders the description for a video, with a "More..."/"Less..." button
   * if the description exceeds a certain length.
   * @param {VideoItemShape} video - The video object.
   * @param {string} videoId - The ID of the video (used as key for expansion state).
   * @returns {JSX.Element} The rendered video description.
   */
  const renderDescription = (video, videoId) => {
    const description = video.description || 'No description';
    const isExpanded = expandedDescriptions[videoId];
    // Maximum length for the truncated description.
    // const maxLength = 150; // This can be adjusted or made responsive if needed
    if (description.length <= DESCRIPTION_MAX_LENGTH) {
      return <p className="video-description"><strong>Description:</strong> {description}</p>;
    }
    return (
      <p className="video-description">
        <strong>Description:</strong> {isExpanded ? description : `${description.substring(0, DESCRIPTION_MAX_LENGTH)}...`}
        <button onClick={() => toggleDescription(videoId)} className="more-less-button">
          {isExpanded ? 'Less...' : 'More...'}
        </button>
      </p>
    );
  };

  /**
   * Opens the specified YouTube video in a new browser tab.
   * @param {string} vidId - The YouTube video ID to open.
   */
  const handleOpenVideo = (vidId) => {
    window.open(`https://www.youtube.com/watch?v=${vidId}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <ul className="video-list">
      {videos.map((video) => {
        const videoId = video.videoId || video.id;
        return (
          <li key={videoId} className="video-list-item">
            <div
              className="video-item-header"
              onClick={() => handleOpenVideo(videoId)}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleOpenVideo(videoId);
                }
              }}
            >
              {video.thumbnailUrl && (
                <img
                  src={video.thumbnailUrl}
                  alt={`Thumbnail for ${video.title}`}
                  loading="lazy"
                  className="video-thumbnail"
                />
              )}
              <span className="watch-icon-enlarged">
                <img
                  src={process.env.PUBLIC_URL + '/icons/youtube_button.webp'}
                  alt="Watch on YouTube"
                  className="youtube-logo-icon"
                />
              </span>
              {/* "Watch" text span is removed */}
            </div>
            <div className="video-details-content">
              <h4>{video.title}</h4>
              {video.duration && <p><strong>Duration:</strong> {video.duration}</p>}
              {renderDescription(video, videoId)}
              {video.reason && <p className="video-reason"><strong>Reason:</strong> {video.reason}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export {VideoList};
