// Dynamic Theme Controller - Electron by Haris
(function() {
  function applyTheme(theme) {
    let active = theme || 'light';
    if (active === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      active = prefersDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', active);
    if (document.body) {
      document.body.setAttribute('data-theme', active);
    }
  }

  // Initial theme application from storage
  if (window.idmApi && window.idmApi.getSettings) {
    window.idmApi.getSettings().then(settings => {
      if (settings && settings.theme) {
        applyTheme(settings.theme);
      }
    }).catch(() => {});

    // Listen for live theme changes saved from Options Dialog
    window.idmApi.on('settings-updated', (newSettings) => {
      if (newSettings && newSettings.theme) {
        applyTheme(newSettings.theme);
      }
    });
  }

  // System OS theme change listener
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (window.idmApi && window.idmApi.getSettings) {
        window.idmApi.getSettings().then(s => {
          if (s && s.theme === 'system') {
            applyTheme('system');
          }
        }).catch(() => {});
      }
    });
  }

  // Expose to window for immediate previewing if needed
  window.applyTheme = applyTheme;
})();
