// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

function formatSpeed(bytesPerSecond) {
    const KB = 1024;
    const MB = KB * 1024;

    if (bytesPerSecond < KB) {
        return `${bytesPerSecond.toFixed(0)} B/s`;
    }

    if (bytesPerSecond < MB) {
        return `${(bytesPerSecond / KB).toFixed(1)} KB/s`;
    }

    return `${(bytesPerSecond / MB).toFixed(1)} MB/s`;
}

function sanitizeFilename(filename) {
    return filename.replace(/[^a-z0-9\s\-_.()]/gi, '_');
}

module.exports = {
    formatSpeed,
    sanitizeFilename
};
