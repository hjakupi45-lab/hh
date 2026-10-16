// Cross-browser compatibility shim for Electron by Haris.
//
// Chromium browsers (Chrome/Edge/Brave/Opera) expose `chrome.*` with a
// promise/callback hybrid in MV3, and no `browser` global.
//
// Firefox exposes BOTH `browser.*` (promise-based) and `chrome.*`
// (callback-based). This shim promotes the promise-based `browser` API onto
// `chrome`, while re-adding callback support for the few APIs the shared code
// invokes with a trailing callback. When running on Chromium this file is a
// no-op.
(function () {
  if (typeof globalThis.browser === 'undefined' || !globalThis.browser || !globalThis.browser.runtime) {
    return;
  }

  const b = globalThis.browser;

  // Accept an optional trailing callback and/or return a promise, matching the
  // Chrome MV3 hybrid behaviour used throughout this codebase.
  function toHybrid(fn) {
    return function (...args) {
      let cb = null;
      if (args.length && typeof args[args.length - 1] === 'function') {
        cb = args.pop();
      }
      const result = fn.apply(this, args);
      if (cb) {
        Promise.resolve(result).then((r) => cb(r)).catch(() => cb(undefined));
        return undefined;
      }
      return result;
    };
  }

  function hybridize(ns, method) {
    if (ns && typeof ns[method] === 'function') {
      ns[method] = toHybrid(ns[method].bind(ns));
    }
  }

  if (b.storage) {
    ['local', 'sync', 'session'].forEach((area) => {
      if (b.storage[area]) {
        ['get', 'set', 'remove', 'clear'].forEach((m) => hybridize(b.storage[area], m));
      }
    });
  }

  hybridize(b.runtime, 'sendMessage');
  hybridize(b.tabs, 'query');
  hybridize(b.tabs, 'sendMessage');
  hybridize(b.cookies, 'getAll');
  hybridize(b.scripting, 'executeScript');
  hybridize(b.downloads, 'cancel');
  hybridize(b.downloads, 'erase');
  hybridize(b.permissions, 'contains');

  globalThis.chrome = b;
})();
