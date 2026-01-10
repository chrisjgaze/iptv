# IPTV Player Electron - Project Documentation

This project is a high-performance IPTV player application built with Electron and React, specifically optimized for the Windows environment.

## 🏗 Software Architecture

The application follows a **Hybrid Dynamic Architecture**, recently migrated from static M3U parsing to the **Xtream Codes (XC) API** standard.

### Core Components
- **Main Process (Node.js):** Handles system-level operations, security (CORS bypass), configuration persistence, and the image download queue.
- **Renderer Process (React + Vite):** A modern, reactive UI that utilizes **Lazy Loading** patterns to manage large datasets.
- **IPC Bridge (Preload):** A secure communication layer using `contextBridge` to expose specific backend functions to the UI.
- **Data Layer:** Uses the Xtream Codes API for on-demand fetching of categories and streams, significantly reducing memory footprint and startup time.

### Version Specifications
- **Operating System:** Windows (win32)
- **Node.js:** v23.10.0
- **Electron:** v33.2.1 (Stable Modern)
- **Vite:** v7.3.1 (Latest)
- **React:** v18.2.0
- **Development Tools:** `wait-on` v9.0.3, `electron-builder` v24.9.0

---

## 🚀 Key Features & Functions

### 1. Dynamic Xtream Codes Integration
Instead of loading massive local files, the app communicates directly with IPTV servers:
- **Lazy Loading Categories:** Only category names are fetched at startup.
- **On-Demand Streams:** Channel/Movie data is only requested when a specific category is selected.
- **Dynamic URL Construction:** Playback URLs are built on-the-fly using the active server mirror and user credentials.

### 2. Hierarchical Content Organization
- **Section Tabs:** Dedicated views for **LIVE TV**, **VOD (Movies)**, and **SERIES**.
- **Sidebar Accordion:** Categories are automatically grouped by prefix (e.g., `|EN|`, `|NL|`, `US:`) into collapsible headers.
- **Search & Filter:** Real-time local search across categories and a "English Only" toggle that filters content based on a forbidden-word list.

### 3. High-Performance Image Handling
- **Image Lazy Loading:** Uses the `IntersectionObserver` API to only load channel logos when they are visible on the screen.
- **Download Concurrency Queue:** Limits concurrent image downloads to **5 at a time** to prevent system lag and server throttling.
- **Persistent Caching:** Hashed image files are stored locally in AppData to ensure instant loading on subsequent views.

### 4. Advanced Playback Options
- **Multi-Mode Player:** Choose between an **Internal Player** (HLS/MPEG-TS), **VLC Media Player** (External), or **Chromecast** (Network).
- **Stream Proxy:** Includes a built-in local HTTP proxy to facilitate streaming to Chromecast devices that require specific headers.

### 5. Profile & Configuration Management
- **Multi-Profile Support:** Manage multiple IPTV providers with distinct credentials and server mirrors.
- **Unified Storage:** All data (M3U caches, images, settings) is stored in a clean, profile-based structure:  
  `%APPDATA%\iptv-player-electron\profiles\{profile_id}\`
- **Automatic Migration:** Automatically moves legacy files from older app versions into the new unified structure.

### 6. Modern UI/UX
- **Neon Blue Theme:** Consistent dark-mode aesthetic with vibrant neon blue borders and interactive glow effects.
- **Custom Context Menu:** Right-click on any tile to inspect the **Stream ID** or copy the **Constructed Playback URL** to the clipboard.
- **Responsive Grid:** Adjustable tile sizes via a header slider.

---

## 🛠 How to Run (Development)

1. Navigate to the `electron` directory:
   ```bash
   cd electron
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev environment:
   ```bash
   npm run dev
   ```
   *This launches Vite for the frontend and Electron for the container simultaneously.*

