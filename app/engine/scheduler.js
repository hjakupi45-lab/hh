const EventEmitter = require('events');
const storage = require('./storage');

// Default scheduler configuration merged into settings on first use.
const DEFAULT_SCHEDULER = {
  enabled: false,
  startTime: '01:00',
  stopTime: '06:00',
  onStart: 'resume-queue',      // resume-queue | none
  onStop: 'stop-queue',         // none | stop-queue | exit-app | shutdown | hibernate | sleep
  shutdownOnComplete: false,
  lastStartKey: null,
  lastStopKey: null
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function hhmm(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Convert "HH:MM" to minutes since midnight, or null when invalid.
function toMinutes(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Returns true when `now` (minutes) is inside the [start, stop) window.
// Handles windows that cross midnight (e.g. 23:00 -> 02:00).
function withinWindow(startMin, stopMin, nowMin) {
  if (startMin === null || stopMin === null) return false;
  if (startMin === stopMin) return false;
  if (startMin < stopMin) return nowMin >= startMin && nowMin < stopMin;
  return nowMin >= startMin || nowMin < stopMin;
}

class Scheduler extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.tickMs = 20000;
  }

  getConfig() {
    if (!storage.settings.scheduler) {
      storage.settings.scheduler = { ...DEFAULT_SCHEDULER };
    }
    // Ensure new keys exist for users upgrading from older settings files.
    storage.settings.scheduler = { ...DEFAULT_SCHEDULER, ...storage.settings.scheduler };
    return storage.settings.scheduler;
  }

  saveConfig(patch) {
    const updated = { ...this.getConfig(), ...patch };
    storage.saveSettings({ scheduler: updated });
    return updated;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
    // Evaluate immediately: resume an active window on cold start.
    this.tick(true);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Emits 'schedule-start' / 'schedule-stop' at the configured times.
  tick(isStartup = false) {
    const cfg = this.getConfig();
    if (!cfg.enabled) return;

    const now = new Date();
    const key = dateKey(now);
    const cur = hhmm(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startMin = toMinutes(cfg.startTime);
    const stopMin = toMinutes(cfg.stopTime);

    let changed = false;

    if (isStartup) {
      // On app launch, if we are already inside the scheduled window, begin.
      if (withinWindow(startMin, stopMin, nowMin) && cfg.lastStartKey !== key) {
        cfg.lastStartKey = key;
        changed = true;
        this.emit('schedule-start', { reason: 'startup-window', onStart: cfg.onStart });
      }
    } else {
      if (cur === cfg.startTime && cfg.lastStartKey !== key) {
        cfg.lastStartKey = key;
        changed = true;
        this.emit('schedule-start', { reason: 'time', onStart: cfg.onStart });
      }
      if (cur === cfg.stopTime && cfg.lastStopKey !== key) {
        cfg.lastStopKey = key;
        changed = true;
        this.emit('schedule-stop', { reason: 'time', onStop: cfg.onStop });
      }
    }

    if (changed) {
      storage.saveSettings({ scheduler: cfg });
      this.emit('config-changed', cfg);
    }
  }

  // Aggregate status for the UI: which phase are we in right now?
  getStatus() {
    const cfg = this.getConfig();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const inWindow = cfg.enabled && withinWindow(toMinutes(cfg.startTime), toMinutes(cfg.stopTime), nowMin);
    return {
      config: cfg,
      currentTime: hhmm(now),
      inWindow,
      nextStart: cfg.startTime,
      nextStop: cfg.stopTime
    };
  }
}

module.exports = new Scheduler();
