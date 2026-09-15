// Curated catalog of the auth-relevant sites gallery-dl supports.
// `auth`: cookies | userpass | oauth | token | oauth-instance
// `probe`: a public URL used by the "Verify" button (dry run).

export const BROWSERS = [
  'firefox', 'librewolf', 'zen', 'floorp',
  'chrome', 'chromium', 'edge', 'brave', 'opera', 'operagx', 'vivaldi', 'thorium',
  'safari',
];

export const BROWSER_LABELS = {
  firefox: 'Firefox', librewolf: 'LibreWolf', zen: 'Zen', floorp: 'Floorp',
  chrome: 'Chrome', chromium: 'Chromium', edge: 'Edge', brave: 'Brave',
  opera: 'Opera', operagx: 'Opera GX', vivaldi: 'Vivaldi', thorium: 'Thorium',
  safari: 'Safari',
};

export const SITE_GROUPS = [
  {
    key: 'cookies',
    title: 'Cookie login',
    sites: [
      { id: 'instagram', name: 'Instagram', domain: 'instagram.com', auth: 'cookies', required: true,
        note: 'Required for everything, even public profiles. Username/password is no longer supported.',
        probe: 'https://www.instagram.com/instagram/' },
      { id: 'twitter', name: 'Twitter / X', domain: 'x.com', auth: 'cookies',
        note: 'Public tweets work without login. Needed for NSFW, protected, or rate-limited accounts.',
        probe: 'https://x.com/X',
        // Bookmarks live at a fixed URL for whoever's logged in, so this
        // needs no username - unlike Reddit saved / Instagram saved, which
        // are per-username paths Grabbr doesn't have a field for yet.
        savedUrl: 'https://x.com/i/bookmarks', savedLabelKey: 'sites.importBookmarks' },
      { id: 'tiktok', name: 'TikTok', domain: 'tiktok.com', auth: 'cookies',
        note: 'Videos download through yt-dlp. Install it in Settings, Tools. Cookies needed for profiles, likes, saved, and stories. Single public videos usually work without.',
        probe: 'https://www.tiktok.com/@tiktok' },
      { id: 'patreon', name: 'Patreon', domain: 'patreon.com', auth: 'cookies',
        probe: 'https://www.patreon.com/patreon' },
      { id: 'fanbox', name: 'Pixiv FANBOX', domain: 'fanbox.cc', auth: 'cookies',
        probe: 'https://www.fanbox.cc/' },
      { id: 'fantia', name: 'Fantia', domain: 'fantia.jp', auth: 'cookies',
        probe: 'https://fantia.jp/' },
    ],
  },
  {
    key: 'userpass',
    title: 'Username & password',
    sites: [
      { id: 'danbooru', name: 'Danbooru', domain: 'danbooru.donmai.us', auth: 'userpass',
        probe: 'https://danbooru.donmai.us/posts?tags=rating:general' },
      { id: 'e621', name: 'e621', domain: 'e621.net', auth: 'userpass',
        probe: 'https://e621.net/posts?tags=rating:safe' },
      { id: 'mangadex', name: 'MangaDex', domain: 'mangadex.org', auth: 'userpass' },
      { id: 'inkbunny', name: 'Inkbunny', domain: 'inkbunny.net', auth: 'userpass' },
      { id: 'sankaku', name: 'Sankaku', domain: 'sankakucomplex.com', auth: 'userpass' },
      { id: 'idolcomplex', name: 'Idol Complex', domain: 'idol.sankakucomplex.com', auth: 'userpass' },
      { id: 'zerochan', name: 'Zerochan', domain: 'zerochan.net', auth: 'userpass' },
      { id: 'aryion', name: "Eka's Portal", domain: 'aryion.com', auth: 'userpass' },
      { id: 'pillowfort', name: 'Pillowfort', domain: 'pillowfort.social', auth: 'userpass' },
      { id: 'subscribestar', name: 'SubscribeStar', domain: 'subscribestar.com', auth: 'userpass' },
      { id: 'tapas', name: 'Tapas', domain: 'tapas.io', auth: 'userpass' },
      { id: 'tsumino', name: 'Tsumino', domain: 'tsumino.com', auth: 'userpass' },
      { id: 'imgbb', name: 'ImgBB', domain: 'imgbb.com', auth: 'userpass' },
      { id: 'mangoxo', name: 'MangoXO', domain: 'mangoxo.com', auth: 'userpass' },
      { id: 'nijie', name: 'nijie', domain: 'nijie.info', auth: 'userpass', required: true },
    ],
  },
  {
    key: 'oauth',
    title: 'OAuth / token',
    sites: [
      { id: 'reddit', name: 'Reddit', domain: 'reddit.com', auth: 'oauth',
        note: 'Optional. Raises the API rate limit and reaches private/quarantined subs.' },
      { id: 'deviantart', name: 'DeviantArt', domain: 'deviantart.com', auth: 'oauth' },
      { id: 'flickr', name: 'Flickr', domain: 'flickr.com', auth: 'oauth' },
      { id: 'tumblr', name: 'Tumblr', domain: 'tumblr.com', auth: 'oauth' },
      { id: 'smugmug', name: 'SmugMug', domain: 'smugmug.com', auth: 'oauth' },
      { id: 'mastodon', name: 'Mastodon', domain: '(your instance)', auth: 'oauth-instance' },
      { id: 'pixiv', name: 'Pixiv', domain: 'pixiv.net', auth: 'token', required: true,
        note: 'No interactive flow. Get a refresh-token with the community script, then paste it here.',
        help: 'https://gdl-org.github.io/docs/configuration.html#extractor-pixiv-refresh-token' },
    ],
  },
];

export const ALL_SITES = SITE_GROUPS.flatMap(g => g.sites);
