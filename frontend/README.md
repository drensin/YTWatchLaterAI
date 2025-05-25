# YT Watch Later Manager - Frontend

This directory contains the React frontend for the YT Watch Later Manager application.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

2.  **Configure Cloud Function URLs:**
    Open `src/App.js` and replace the placeholder URLs in the `CLOUD_FUNCTIONS_BASE_URL` object with your actual deployed Cloud Function HTTP trigger URLs.

    Alternatively, you can use environment variables. For example, create a `.env.local` file in this directory:
    ```
    REACT_APP_HANDLE_YOUTUBE_AUTH_URL=YOUR_HANDLE_YOUTUBE_AUTH_FUNCTION_URL
    REACT_APP_GET_WATCH_LATER_PLAYLIST_URL=YOUR_GET_WATCH_LATER_PLAYLIST_FUNCTION_URL
    REACT_APP_CATEGORIZE_VIDEO_URL=YOUR_CATEGORIZE_VIDEO_FUNCTION_URL
    REACT_APP_CHAT_WITH_PLAYLIST_URL=YOUR_CHAT_WITH_PLAYLIST_FUNCTION_URL
    ```
    And then update `src/App.js` to use these:
    ```javascript
    const CLOUD_FUNCTIONS_BASE_URL = {
      handleYouTubeAuth: process.env.REACT_APP_HANDLE_YOUTUBE_AUTH_URL,
      getWatchLaterPlaylist: process.env.REACT_APP_GET_WATCH_LATER_PLAYLIST_URL,
      categorizeVideo: process.env.REACT_APP_CATEGORIZE_VIDEO_URL,
      chatWithPlaylist: process.env.REACT_APP_CHAT_WITH_PLAYLIST_URL
    };
    ```

3.  **Run Development Server:**
    ```bash
    npm start
    # or
    yarn start
    ```
    This will open the app in your browser, usually at `http://localhost:3000`.

## Building for Production

```bash
npm run build
# or
yarn build
```
This command creates a `build` directory with the static assets for your application.

## Deployment to GitHub Pages

1.  **Install `gh-pages`:**
    ```bash
    npm install --save-dev gh-pages
    # or
    yarn add --dev gh-pages
    ```

2.  **Update `package.json`:**
    Add the following properties (the `homepage` property should already be updated if you followed the main setup):
    *   A `homepage` property: `"homepage": "https://drensin.github.io/YTWatchLaterAI/"`
    *   `predeploy` and `deploy` scripts in the `scripts` section:
        ```json
        "scripts": {
          // ... other scripts
          "predeploy": "npm run build",
          "deploy": "gh-pages -d build"
        }
        ```

3.  **Deploy:**
    ```bash
    npm run deploy
    # or
    yarn deploy
    ```
    This will build your app and push the contents of the `build` folder to the `gh-pages` branch on your GitHub repository. GitHub Pages will then serve your site from this branch.

    Make sure your GitHub repository settings are configured to serve from the `gh-pages` branch.
