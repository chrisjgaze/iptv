# Gemini Code Assistant Workspace

This workspace contains an Electron-based IPTV player application with a graphical user interface built using React.

## Project Structure

The project is organized as follows:

- `electron/`: The core Electron application folder.
  - `main.js`: Main process for Electron.
  - `src/App.jsx`: Main React application component.
  - `src/components/`: React components like `VideoPlayer` and `CachedImage`.
- `output_data/`: A directory for storing local cache files, including the M3U playlist and cached images.
- `node_modules/`: Project dependencies.

## Key Features

- **Hierarchical Grouping**: 
  - Sidebar categories grouped by prefix.
  - Stream list organized by section markers (`#####`).
  - Sub-grouping within sections using pipe (`|`) delimiters.
- **Dynamic Server Selection**: Switch between different IPTV server mirrors.
- **Internal & External Playback**: Play streams via internal player or launch VLC.
- **Chromecast Support**: Cast streams to compatible devices.
- **Image Caching**: Local caching of channel logos for faster loading.

## How to Run

To run the application, navigate to the `electron` directory and use npm:

```bash
cd electron
npm install
npm run dev
```

## Configuration

- **Cache Paths**: The application caches data in the user's AppData directory (typically `%APPDATA%\iptv-player-electron\`).
- **VLC Path**: Configurable for external playback.