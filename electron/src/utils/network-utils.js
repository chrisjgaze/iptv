const os = require('os');

// ============================================================================
// NETWORK UTILITIES
// ============================================================================

function getLocalIP() {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            const isIPv4 = iface.family === 'IPv4';
            const isExternal = !iface.internal;

            if (isIPv4 && isExternal) {
                return iface.address;
            }
        }
    }

    return '127.0.0.1';
}

module.exports = {
    getLocalIP
};
