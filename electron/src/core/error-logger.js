const fs = require('fs');
const path = require('path');

// ============================================================================
// ERROR LOGGING
// ============================================================================

let LOG_FILE;

function initializeErrorLogging(logDirectory) {
    LOG_FILE = path.join(logDirectory || __dirname, 'startup_error.log');
    
    // Set up global error handlers
    process.on('uncaughtException', handleUncaughtException);
    process.on('unhandledRejection', handleUnhandledRejection);
    
    logToFile("App starting...");
}

function logToFile(msg) {
    if (!LOG_FILE) {
        console.warn('Log file not initialized');
        return;
    }

    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    
    try {
        fs.appendFileSync(LOG_FILE, logMsg);
    } catch (e) {
        // Cannot log if fs fails
        console.error('Failed to write to log file:', e);
    }
}

function handleUncaughtException(error) {
    const msg = `UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}`;
    console.error(msg);
    logToFile(msg);
    process.exit(1);
}

function handleUnhandledRejection(reason, promise) {
    const msg = `UNHANDLED REJECTION: ${reason}`;
    console.error(msg);
    logToFile(msg);
}

module.exports = {
    initializeErrorLogging,
    logToFile
};
