# ReelWorthy User Manual

Welcome to ReelWorthy! This guide will help you understand how to use ReelWorthy to manage, explore, and get intelligent insights from your YouTube playlists, especially your "Watch Later" list.

<img src="frontend/public/ReelWorthyLogo.png" alt="ReelWorthy Logo" width="200px">

## Table of Contents

1.  [Introduction](#introduction)
    *   [What is ReelWorthy?](#what-is-reelworthy)
    *   [Key Features](#key-features)
2.  [Getting Started](#getting-started)
    *   [Accessing ReelWorthy](#accessing-reelworthy)
    *   [Logging In](#logging-in)
3.  [Connecting Your YouTube Account](#connecting-your-youtube-account)
4.  [Navigating ReelWorthy](#navigating-reelworthy)
    *   [Main Screens](#main-screens)
    *   [Bottom Navigation Bar](#bottom-navigation-bar)
5.  [Using Your Playlists](#using-your-playlists)
    *   [Viewing Playlists](#viewing-playlists)
    *   [Selecting a Playlist for AI Chat](#selecting-a-playlist-for-ai-chat)
6.  [Chatting with the AI](#chatting-with-the-ai)
    *   [The Chat Interface](#the-chat-interface)
    *   [How the AI Works](#how-the-ai-works)
    *   [Example Queries](#example-queries)
    *   [Understanding AI Responses & The "Thinking" Tab](#understanding-ai-responses--the-thinking-tab)
7.  [Settings](#settings)
    *   [AI Model Selection](#ai-model-selection)
    *   [Default Playlist](#default-playlist)
    *   [Include Subscription Feed](#include-subscription-feed)
    *   [Logout](#logout)
8.  [Data Synchronization](#data-synchronization)
9.  [Troubleshooting & FAQ](#troubleshooting--faq)

---

## 1. Introduction

### What is ReelWorthy?

ReelWorthy is a smart web application designed to help you make the most of your YouTube playlists. If you have a long "Watch Later" list or many saved playlists, ReelWorthy provides an interactive way to rediscover and engage with your saved video content using a powerful AI chat interface. Furthermore, you can optionally expand the AI's knowledge base to include recent videos from your YouTube channel subscriptions, offering an even broader range of suggestions.

### Key Features

*   **Connect Your YouTube Account:** Securely link your YouTube account to access your playlists.
*   **View & Manage Playlists:** See all your YouTube playlists in one place.
*   **AI-Powered Chat:** Get video suggestions and discuss the content of your playlists with an intelligent AI.
*   **Live "Thinking" Process:** See the AI's internal thought process in real-time as it works on your query.
*   **Subscription Feed Integration:** Optionally include recent videos from your YouTube subscriptions in AI suggestions.
*   **Personalized Experience:** The AI tailors suggestions based on the content of your selected playlist and preferences.

---

## 2. Getting Started

### Accessing ReelWorthy

To use ReelWorthy, you'll typically access it through a web browser by navigating to its specific URL (e.g., `https://your-reelworthy-app-url.web.app`).

### Logging In

1.  **Login Prompt:** When you first visit ReelWorthy, you'll be prompted to log in.
2.  **Google Sign-In:** ReelWorthy uses your Google Account for a secure and easy login experience. Click the "Sign in with Google" (or similar) button.
3.  **Authorization:**
    *   For new users, your email address might need to be on an approved list to use the application. If you encounter issues, please contact the application administrator.
    *   Once logged in, the app will check if your YouTube account is connected.

---

## 3. Connecting Your YouTube Account

To get the most out of ReelWorthy, you need to connect your YouTube account. This allows the application to access your playlists and provide relevant AI-powered insights.

1.  **Connection Prompt:** If your YouTube account isn't linked after logging in, you'll see a prompt like "Connect YouTube Account."
2.  **Initiate OAuth Flow:** Click the "Connect YouTube Account" button.
3.  **Google Consent Screen:** You'll be redirected to Google's standard account permission screen.
    *   ReelWorthy will request `youtube.readonly` permission. This means the app can **only view** your YouTube playlists and related data. It **cannot** make any changes, delete videos, or modify your YouTube account in any way.
    *   Grant permission to proceed.
4.  **Redirection & Confirmation:** After granting permission, Google will redirect you back to ReelWorthy. The application will confirm the connection.

---

## 4. Navigating ReelWorthy

ReelWorthy has a simple and intuitive interface.

### Main Screens

*   **Playlists Screen:** Displays all your YouTube playlists. This is often the first screen you see after logging in and connecting your YouTube account.
*   **Chat Screen:** Where you interact with the AI to get video suggestions based on a selected playlist. This screen includes a "Results" tab and a "Thinking" tab.
*   **Settings Screen:** Manage application preferences, such as AI model selection and subscription feed integration.

### Bottom Navigation Bar

At the bottom of the screen, you'll find a navigation bar to easily switch between the main sections:
*   <img src="docs/img/playlists_icon.png?raw=true" alt="Playlists Icon" width="24" height="24"> **Playlists:** Takes you to the Playlists Screen.
*   <img src="docs/img/chat_icon.png?raw=true" alt="Chat Icon" width="24" height="24"> **Chat:** Takes you to the Chat Screen (usually active after selecting a playlist).
*   <img src="docs/img/settings_icon.png?raw=true" alt="Settings Icon" width="24" height="24"> **Settings:** Takes you to the Settings Screen.

---

## 5. Using Your Playlists

### Viewing Playlists

*   Once your YouTube account is connected, the Playlists Screen will show a list of your playlists.
*   Each playlist entry typically displays:
    *   Playlist Title
    *   Thumbnail Image
    *   Number of videos in the playlist
*   Your "Watch Later" playlist will be listed here as well.

<img src="docs/img/playlists_screenshot.png" alt="Playlists Screen" width="400px">

### Selecting a Playlist for AI Chat

1.  **Choose a Playlist:** Tap on any playlist from the list.
2.  **Data Synchronization:** When you select a playlist, ReelWorthy fetches the latest video information for that playlist from YouTube and updates its own records. This ensures the AI has the most current context. This might take a few moments.
3.  **Navigate to Chat:** After the sync is complete, you'll usually be taken to the Chat Screen, ready to discuss the selected playlist with the AI.

---

## 6. Chatting with the AI

This is where ReelWorthy shines! You can have a conversation with an AI to get video suggestions from your selected playlist.

### The Chat Interface

*   **Input Field:** At the bottom of the Chat Screen, there's a text box where you can type your questions or requests for the AI.
*   **Send Button:** After typing your query, tap the send button.
*   **Output Tabs:** The chat response area has two tabs:
    *   **Results:** Displays the final video suggestions from the AI.
    *   **Thinking:** Shows the AI's internal thought process and data reception status while it's working on your query.

### How the AI Works

*   **Playlist Context:** The AI's primary knowledge comes from the videos within the playlist you currently have selected.
*   **Subscription Feed (Optional):** If you enable "Include Subscription Feed" in Settings, the AI will also consider recent (non-Shorts) videos from your YouTube channel subscriptions. This can broaden the range of suggestions.
*   **JSON Output:** The AI is designed to provide suggestions in a structured JSON format, which the app then displays clearly in the "Results" tab.

### Example Queries

You can ask things like:

*   "Show me short comedy videos I haven't finished."
*   "What videos are about learning to code?"
*   "Suggest some relaxing music videos from this playlist."
*   "Find videos longer than 20 minutes on topic X."

### Understanding AI Responses & The "Thinking" Tab

1.  **Submitting a Query:** When you send a query, the app automatically switches to the "Thinking" tab.
2.  **"Thinking" Tab Display:**
    *   **Internal Thoughts:** You will see the AI's internal monologue or step-by-step reasoning as it processes your query and analyzes the video data. This streams in real-time. (See example: <img src="docs/img/chat_thinking_screenshot.png" alt="AI Thinking Indicator" width="400px">)
    *   **Receiving Final Data:** After the "Internal Thoughts" (or sometimes concurrently), if the AI is preparing its final list of suggestions, you'll see a "Receiving Final Data:" indicator followed by a series of "#" characters. Each "#" represents a chunk of the final response data being received from the server. This provides feedback that the AI is still working on compiling the results. This section disappears once the final results are ready.
3.  **"Results" Tab:**
    *   Once the AI has finished processing and the stream of data is complete, the app will automatically switch to the "Results" tab.
    *   Here, you'll find the list of suggested videos. Each suggestion usually includes:
        *   Video Title (and possibly thumbnail)
        *   A brief reason why the AI suggested that video based on your query.
    *   You can typically click on a suggested video to open it on YouTube.

<img src="docs/img/chat_results_screenshot.png" alt="Chat Results" width="400px">

---

## 7. Settings

Access the Settings screen to customize your ReelWorthy experience. You can find the Settings option via the <img src="docs/img/settings_icon.png?raw=true" alt="Settings Icon" width="24" height="24"> **Settings Icon** in the bottom navigation bar.

<img src="docs/img/settings_screenshot.png" alt="Settings Screen Overview" width="400px">

### AI Model Selection
*   **Dropdown Menu:** You can choose your preferred AI model for chat interactions from a dropdown menu labeled "Select AI Chat Model:".
*   If models are loading or unavailable, this might be indicated in the dropdown.

### Default Playlist
*   **Checkbox:** You can opt to "Automatically load a default playlist on startup" by checking the corresponding box.
*   **Playlist Selection:** If you enable this, a dropdown menu will allow you to select one of your existing playlists as the default. This playlist will be automatically selected when you start the application.
*   This preference is saved in your browser.

### Include Subscription Feed
*   **Checkbox:** You'll find a checkbox labeled "Include recent videos from my subscriptions in AI suggestions".
*   **Functionality:**
    *   **Off:** The AI will only use videos from your currently selected playlist for suggestions.
    *   **On:** The AI will use videos from your selected playlist AND the 100 most recent non-Short videos from your YouTube channel subscriptions.
*   **Impact:** Turning this on can give you a wider variety of suggestions, especially if your selected playlist is small or very specific. This preference is saved in your browser.
*   **Note:** Changing this setting will reset your current chat session so the AI can use the new context.

### Logout
*   **Button:** A "Logout" button is available on the Settings screen to sign you out of ReelWorthy.

---

## 8. Data Synchronization

ReelWorthy keeps its information about your playlists and videos up-to-date through synchronization processes.

*   **Playlist Sync (On-Demand):**
    *   **When:** Occurs when you select a playlist for the first time or manually trigger a refresh (if this option is available).
    *   **What:** Fetches the current list of videos and their details from the selected YouTube playlist and stores/updates them in ReelWorthy's database.
*   **User Subscription Feed Sync (Background & On-Demand):**
    *   **Scheduled:** Runs automatically twice a day (e.g., 3 AM and 3 PM UTC) to update the cached list of recent videos from your subscriptions for all users.
    *   **On-Demand/Initial:**
        *   When you first successfully link your YouTube account.
        *   If the app detects your subscription feed cache isn't ready when you log in.
    *   **What:** Fetches up to 10 recent videos from each of your subscribed channels, selects the top 100 newest overall, filters out Shorts (videos ~60 seconds or less), and stores their details.
*   **Why it's important:** This ensures the AI has fresh and relevant video information to provide you with the best possible suggestions.

---

## 9. Troubleshooting & FAQ

*   **Q: I can't log in or access the app.**
    *   A: Ensure you are using the correct Google Account. For some versions of ReelWorthy, your email address may need to be on an pre-approved allow-list. Contact the application administrator if you believe this is the issue.

*   **Q: My YouTube account connection failed.**
    *   A: Double-check your internet connection. Ensure pop-up blockers are not interfering with the Google OAuth window. Try the connection process again.

*   **Q: The AI's video suggestions seem irrelevant.**
    *   A:
        *   Try rephrasing your query to be more specific or clearer.
        *   Ensure you have the correct playlist selected for the context you want.
        *   Check your "Include Subscription Feed" setting. If it's on, suggestions might come from your broader subscriptions. If it's off, they'll only be from the playlist.
        *   Allow some time for data synchronization if you've recently made many changes to your YouTube playlists.

*   **Q: How does ReelWorthy protect my YouTube data?**
    *   A: ReelWorthy requests `youtube.readonly` permission, meaning it can only view your playlist and video information. It cannot make any changes to your YouTube account. Your YouTube credentials (like passwords) are never accessed or stored by ReelWorthy; authentication is handled securely by Google.

---

We hope this manual helps you enjoy using ReelWorthy!
