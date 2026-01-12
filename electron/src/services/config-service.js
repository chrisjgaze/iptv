const fs = require('fs');
const path = require('path');
const { TRENDY_ID, DEFAULT_VLC_PATHS, DEFAULT_PROFILE } = require('../config/constants');
const { fileExists } = require('../utils/file-utils');

// ============================================================================
// CONFIG SERVICE (INI Format)
// ============================================================================

let CONFIG_FILE = null;

function initialize(userDataPath) {
    CONFIG_FILE = path.join(userDataPath, 'config.ini');
}

function stringifyINI(config) {
    let output = "[Settings]\n";
    output += "activeProfileId=" + (config.activeProfileId || "") + "\n";
    output += "vlcPath=" + (config.vlcPath || "") + "\n\n";

    (config.profiles || []).forEach(profile => {
        output += `[Profile_${profile.id}]\n`;
        output += `id=${profile.id}\n`;
        output += `name=${profile.name}\n`;
        output += `username=${profile.username}\n`;
        output += `password=${profile.password}\n`;
        output += `servers=${(profile.servers || []).join(',')}\n`;
        output += `favorites=${(profile.favorites || []).join(',')}\n\n`;
    });

    return output;
}

function parseINI(data) {
    const lines = data.split(/\r?\n/);
    const config = { profiles: [], activeProfileId: null, vlcPath: null };
    let currentProfile = null;
    let currentSection = null;

    lines.forEach(line => {
        line = line.trim();

        const isEmptyOrComment = !line || line.startsWith(';');
        if (isEmptyOrComment) {
            return;
        }

        const sectionMatch = line.match(/^\s*\[(.+?)\]\s*$/);

        if (sectionMatch) {
            currentSection = sectionMatch[1];

            if (currentSection.startsWith('Profile_')) {
                currentProfile = {};
                config.profiles.push(currentProfile);
            } else {
                currentProfile = null;
            }
            return;
        }

        const [key, ...valParts] = line.split('=');
        const value = valParts.join('=').trim();

        if (currentSection === 'Settings') {
            parseSettingsLine(config, key, value);
        } else if (currentProfile) {
            parseProfileLine(currentProfile, key, value);
        }
    });

    return config;
}

function parseSettingsLine(config, key, value) {
    if (key === 'activeProfileId') {
        config.activeProfileId = value || null;
    }
    if (key === 'vlcPath') {
        config.vlcPath = value || null;
    }
}

function parseProfileLine(profile, key, value) {
    const isArrayField = key === 'servers' || key === 'favorites';

    if (isArrayField) {
        profile[key] = value ? value.split(',') : [];
    } else {
        profile[key] = value;
    }
}

function getDefaultConfig() {
    const defaultVlcPath = process.platform === 'win32'
        ? DEFAULT_VLC_PATHS.win32.replace(/\\/g, '\\\\')
        : DEFAULT_VLC_PATHS[process.platform] || '';

    return {
        activeProfileId: TRENDY_ID,
        vlcPath: defaultVlcPath,
        profiles: [DEFAULT_PROFILE]
    };
}

function loadConfig() {
    if (!CONFIG_FILE) {
        throw new Error('Config service not initialized');
    }

    if (fileExists(CONFIG_FILE)) {
        return parseINI(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }

    const initial = getDefaultConfig();
    fs.writeFileSync(CONFIG_FILE, stringifyINI(initial));
    return initial;
}

function saveConfig(config) {
    if (!CONFIG_FILE) {
        throw new Error('Config service not initialized');
    }

    try {
        fs.writeFileSync(CONFIG_FILE, stringifyINI(config));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = {
    initialize,
    loadConfig,
    saveConfig,
    getDefaultConfig
};
