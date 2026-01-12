// ============================================================================
// APPLICATION CONSTANTS
// ============================================================================

module.exports = {
    // Server Configuration
    PROXY_PORT: 5181,
    
    // Profile Configuration
    TRENDY_ID: "1704700000000",
    
    // Cache Configuration
    CACHE_TTL: 86400000, // 24 hours in milliseconds
    
    // Image Download Configuration
    MAX_CONCURRENT_IMAGE_DOWNLOADS: 5,
    
    // M3U Parsing Configuration
    M3U_BATCH_SIZE: 5000,
    
    // Default VLC Paths
    DEFAULT_VLC_PATHS: {
        win32: 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
        darwin: '/Applications/VLC.app/Contents/MacOS/VLC',
        linux: 'vlc'
    },
    
    // Default Profile Configuration
    DEFAULT_PROFILE: {
        id: "1704700000000",
        name: "Trendystream",
        username: "c91392c3e194",
        password: "7657840f7676",
        servers: [
            "http://vpn.tsclean.cc",
            "http://line.tsclean.cc",
            "http://line.protv.cc:8000",
            "http://line.beetx.cc"
        ]
    },
    
    // HTTP Headers
    DEFAULT_USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    IPTV_USER_AGENT: 'IPTVApp/1.0 ElectronFetcher',
    
    // Content Types
    CONTENT_TYPES: {
        'ts': 'video/mp2t',
        'm3u8': 'application/x-mpegURL',
        'mp4': 'video/mp4',
        'mkv': 'video/x-matroska'
    },
    
    // Timeouts
    API_TIMEOUT: 20000,
    DOWNLOAD_TIMEOUT: 30000,
    IMAGE_DOWNLOAD_TIMEOUT: 10000,
    VLC_CLOSE_DELAY: 500,
    DOWNLOAD_FORCE_CANCEL_DELAY: 1000,
    ELECTRON_DOWNLOAD_TIMEOUT: 30000
};
