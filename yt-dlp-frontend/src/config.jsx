// -----------------------------------------------------------------
// Configuration settings and variables for web frontend
// -----------------------------------------------------------------

export const VERSION = '0.1.1-dev'; // remove -dev for release
export const TITLE = 'YouTube Extractor';

// -----------------------------------------------------------------

export const Protocol = 'http://' // if TOR, most likely need http://, not https://
export const BaseDomainAndPort = 'localhost:5173' // need port for testing, can exclude if 80 or 443
export const BaseURL = Protocol + BaseDomainAndPort
export const PollWaitTime = 10 * 1000; // in ms, so 10 * 1000 is 10 seconds

// -----------------------------------------------------------------