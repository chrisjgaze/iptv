# Gemini Code Assistant Workspace

This workspace contains a Python-based IPTV player application with a graphical user interface built using Tkinter.

## Project Structure

The project is organized as follows:

- `venv/iptv.py`: The core application script that provides the basic functionality of the IPTV player.
- `venv/iptv_player.py`: An enhanced version of the IPTV player with additional features like channel logos, language filtering, context menu, and dynamic server selection.
- `output_data/`: A directory for storing output files, including the M3U playlist and downloaded content.
- `venv/`: A Python virtual environment containing the project's dependencies and source code.

## Key Files

### `venv/iptv_player.py`

This is the main script for running the IPTV player. It builds upon `iptv.py` by adding several enhancements:

- **Server Selection**: A dropdown menu allows users to switch between different IPTV server mirrors dynamically (e.g., `connect.proxytx.cloud`, `vpn.tsclean.cc`, etc.).
- **Dynamic URL Rewriting**: Automatically updates stream and download URLs to match the selected server, ensuring connectivity even if the playlist contains hardcoded domains.
- **Channel Logos**: Displays logos for each channel in the playlist.
- **Language Filtering**: Allows filtering the channel list to show only English-language content.
- **Context Menu**: A right-click menu for copying stream and logo URLs.
- **Dependencies**: Uses `Pillow` for image processing and `pyperclip` for clipboard operations.

### `venv/iptv.py`

This script contains the fundamental logic for the IPTV player application. Its features include:

- **M3U Playlist Parsing**: Fetches and parses an M3U playlist.
- **Stream Playback**: Plays IPTV streams using the VLC media player.
- **VOD Downloader**: Allows users to download Video on Demand (VOD) content.
- **GUI**: A graphical user interface built with Tkinter for browsing categories and streams.
- **Server Selection**: Includes the same dynamic server selection and URL rewriting logic as `iptv_player.py`.

## How to Run

To run the application, execute the `iptv_player.py` script from within the virtual environment:

```bash
venv\Scripts\python.exe venv\iptv_player.py
```

## Configuration

- **VLC Path**: The application requires VLC Media Player. You can configure the path to `vlc.exe` within the application's UI.
- **Download Directory**: You can specify the directory where downloaded content should be saved.
- **Servers**: The application comes pre-configured with a list of server mirrors. You can select your preferred server from the dropdown menu in the main interface.
