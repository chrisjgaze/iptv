const http = require('http');
const url = require('url');
const axios = require('axios');
const { PROXY_PORT, DEFAULT_USER_AGENT, CONTENT_TYPES } = require('../config/constants');
const { getLocalIP } = require('../utils/network-utils');

// ============================================================================
// PROXY SERVER FOR CHROMECAST
// ============================================================================

let proxyServer = null;

function startProxyServer() {
    if (proxyServer) {
        console.warn('Proxy server already running');
        return;
    }

    proxyServer = http.createServer(handleProxyRequest);

    proxyServer.listen(PROXY_PORT, '0.0.0.0', () => {
        console.log(`Stream proxy for Chromecast listening on http://${getLocalIP()}:${PROXY_PORT}`);
    });
}

async function handleProxyRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const isStreamRequest = parsedUrl.pathname === '/stream';
    const hasStreamUrl = parsedUrl.query.url;

    if (!isStreamRequest || !hasStreamUrl) {
        res.statusCode = 404;
        res.end();
        return;
    }

    const streamUrl = parsedUrl.query.url;
    console.log(`Proxying stream for Chromecast: ${streamUrl}`);

    const headers = {
        'User-Agent': DEFAULT_USER_AGENT
    };

    if (req.headers.range) {
        headers['Range'] = req.headers.range;
    }

    try {
        const response = await axios({
            method: 'get',
            url: streamUrl,
            responseType: 'stream',
            headers: headers,
            timeout: 30000
        });

        res.statusCode = response.status;

        const contentType = determineContentType(streamUrl, response.headers['content-type']);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Forward relevant headers
        forwardResponseHeaders(res, response.headers);

        response.data.pipe(res);

        req.on('close', () => {
            if (response.data.destroy) {
                response.data.destroy();
            }
        });
    } catch (e) {
        console.error("Proxy error:", e.message);
        res.statusCode = 500;
        res.end(`Proxy Error: ${e.message}`);
    }
}

function determineContentType(streamUrl, responseContentType) {
    const isGenericType = !responseContentType || responseContentType === 'application/octet-stream';

    if (isGenericType) {
        const ext = streamUrl.split('.').pop().split('?')[0];
        return CONTENT_TYPES[ext] || 'video/mp2t';
    }

    return responseContentType;
}

function forwardResponseHeaders(res, headers) {
    if (headers['content-length']) {
        res.setHeader('Content-Length', headers['content-length']);
    }
    if (headers['accept-ranges']) {
        res.setHeader('Accept-Ranges', headers['accept-ranges']);
    }
    if (headers['content-range']) {
        res.setHeader('Content-Range', headers['content-range']);
    }
}

function stopProxyServer() {
    if (proxyServer) {
        proxyServer.close();
        proxyServer = null;
    }
}

module.exports = {
    startProxyServer,
    stopProxyServer
};
