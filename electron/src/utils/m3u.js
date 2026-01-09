export const SERVER_URLS = [
  "http://vpn.tsclean.cc",
  "http://line.tsclean.cc",
  "http://line.protv.cc:8000",
  "http://line.beetx.cc"
];

export const getRewrittenUrl = (originalUrl, selectedServerBase) => {
  if (!originalUrl || !selectedServerBase) return originalUrl;
  
  try {
    const originalObj = new URL(originalUrl);
    const serverObj = new URL(selectedServerBase);
    
    originalObj.protocol = serverObj.protocol;
    originalObj.host = serverObj.host; // Includes port if present
    
    return originalObj.toString();
  } catch (e) {
    console.error("URL rewrite error:", e);
    return originalUrl;
  }
};
