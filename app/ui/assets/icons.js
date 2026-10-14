// Crisp SVG icons for Internet Download Manager
const IDMIcons = {
  addUrl: `<svg viewBox="0 0 32 32" width="26" height="26">
    <circle cx="16" cy="16" r="14" fill="#3b82f6" stroke="#1d4ed8" stroke-width="1.5"/>
    <ellipse cx="16" cy="16" rx="6" ry="14" fill="none" stroke="#93c5fd" stroke-width="1.2"/>
    <line x1="2" y1="16" x2="30" y2="16" stroke="#93c5fd" stroke-width="1.2"/>
    <circle cx="23" cy="23" r="8" fill="#10b981" stroke="#047857" stroke-width="1.5"/>
    <path d="M23 18v10M18 23h10" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  resume: `<svg viewBox="0 0 32 32" width="26" height="26">
    <circle cx="16" cy="16" r="14" fill="#10b981" stroke="#059669" stroke-width="1.5"/>
    <polygon points="12,9 24,16 12,23" fill="#ffffff" stroke="#047857" stroke-width="1"/>
  </svg>`,

  stop: `<svg viewBox="0 0 32 32" width="26" height="26">
    <circle cx="16" cy="16" r="14" fill="#ef4444" stroke="#dc2626" stroke-width="1.5"/>
    <rect x="10" y="10" width="12" height="12" rx="2" fill="#ffffff"/>
  </svg>`,

  stopAll: `<svg viewBox="0 0 32 32" width="26" height="26">
    <circle cx="16" cy="16" r="14" fill="#f87171" stroke="#b91c1c" stroke-width="1.5"/>
    <rect x="8" y="10" width="7" height="12" rx="1.5" fill="#ffffff"/>
    <rect x="17" y="10" width="7" height="12" rx="1.5" fill="#ffffff"/>
  </svg>`,

  delete: `<svg viewBox="0 0 32 32" width="26" height="26">
    <circle cx="16" cy="16" r="14" fill="#ef4444" stroke="#b91c1c" stroke-width="1.5"/>
    <path d="M10 10l12 12M22 10l-12 12" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  </svg>`,

  deleteAll: `<svg viewBox="0 0 32 32" width="26" height="26">
    <circle cx="16" cy="16" r="14" fill="#64748b" stroke="#334155" stroke-width="1.5"/>
    <path d="M9 12h14M12 12v12a2 2 0 002 2h4a2 2 0 002-2V12M14 9h4" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
    <path d="M19 6l3 3-5 5" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  options: `<svg viewBox="0 0 32 32" width="26" height="26">
    <circle cx="16" cy="16" r="14" fill="#f59e0b" stroke="#d97706" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="5" fill="#ffffff"/>
    <path d="M16 4v4M16 24v4M4 16h4M24 16h4M7.5 7.5l3 3M21.5 21.5l3 3M7.5 24.5l3-3M21.5 10.5l3-3" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  scheduler: `<svg viewBox="0 0 32 32" width="26" height="26">
    <circle cx="16" cy="16" r="14" fill="#8b5cf6" stroke="#6d28d9" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="10" fill="#ffffff"/>
    <polyline points="16,10 16,16 20,18" fill="none" stroke="#6d28d9" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`,

  startQueue: `<svg viewBox="0 0 32 32" width="26" height="26">
    <rect x="4" y="6" width="24" height="20" rx="3" fill="#0284c7" stroke="#0369a1" stroke-width="1.5"/>
    <polygon points="12,11 22,16 12,21" fill="#ffffff"/>
  </svg>`,

  stopQueue: `<svg viewBox="0 0 32 32" width="26" height="26">
    <rect x="4" y="6" width="24" height="20" rx="3" fill="#475569" stroke="#334155" stroke-width="1.5"/>
    <rect x="11" y="11" width="3.5" height="10" rx="1" fill="#ffffff"/>
    <rect x="17.5" y="11" width="3.5" height="10" rx="1" fill="#ffffff"/>
  </svg>`,

  grabber: `<svg viewBox="0 0 32 32" width="26" height="26">
    <circle cx="16" cy="16" r="14" fill="#06b6d4" stroke="#0891b2" stroke-width="1.5"/>
    <path d="M10 22a8 8 0 0112 0M12 18a5 5 0 018 0M14 14a2 2 0 014 0" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="22" r="2" fill="#ffffff"/>
  </svg>`,

  // Category Icons
  catAll: `<svg viewBox="0 0 16 16" width="16" height="16">
    <path d="M1 3a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V3z" fill="#facc15" stroke="#ca8a04" stroke-width="0.8"/>
  </svg>`,

  catCompressed: `<svg viewBox="0 0 16 16" width="16" height="16">
    <rect x="2" y="1" width="12" height="14" rx="2" fill="#fed7aa" stroke="#ea580c" stroke-width="0.8"/>
    <path d="M8 2v12M6 3h4M6 6h4M6 9h4" stroke="#c2410c" stroke-width="1.2"/>
  </svg>`,

  catDocuments: `<svg viewBox="0 0 16 16" width="16" height="16">
    <path d="M3 1h7l4 4v9a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" fill="#e0f2fe" stroke="#0284c7" stroke-width="0.8"/>
    <line x1="5" y1="6" x2="11" y2="6" stroke="#0284c7" stroke-width="1"/>
    <line x1="5" y1="9" x2="11" y2="9" stroke="#0284c7" stroke-width="1"/>
    <line x1="5" y1="12" x2="9" y2="12" stroke="#0284c7" stroke-width="1"/>
  </svg>`,

  catMusic: `<svg viewBox="0 0 16 16" width="16" height="16">
    <circle cx="5" cy="12" r="3" fill="#c084fc"/>
    <circle cx="12" cy="10" r="3" fill="#c084fc"/>
    <path d="M8 12V4l7-2v8" stroke="#9333ea" stroke-width="1.5" fill="none"/>
  </svg>`,

  catPrograms: `<svg viewBox="0 0 16 16" width="16" height="16">
    <rect x="1" y="2" width="14" height="12" rx="2" fill="#e2e8f0" stroke="#475569" stroke-width="0.8"/>
    <line x1="1" y1="5" x2="15" y2="5" stroke="#94a3b8" stroke-width="0.8"/>
    <circle cx="3" cy="3.5" r="0.8" fill="#ef4444"/>
    <circle cx="5" cy="3.5" r="0.8" fill="#eab308"/>
    <circle cx="7" cy="3.5" r="0.8" fill="#22c55e"/>
    <path d="M5 8l3 3-3 3" fill="none" stroke="#2563eb" stroke-width="1.2"/>
  </svg>`,

  catVideo: `<svg viewBox="0 0 16 16" width="16" height="16">
    <rect x="1" y="3" width="14" height="10" rx="2" fill="#fecdd3" stroke="#e11d48" stroke-width="0.8"/>
    <polygon points="6,5 11,8 6,11" fill="#e11d48"/>
  </svg>`,

  catFinished: `<svg viewBox="0 0 16 16" width="16" height="16">
    <circle cx="8" cy="8" r="7" fill="#dcfce7" stroke="#16a34a" stroke-width="0.8"/>
    <path d="M5 8l2 2 4-4" fill="none" stroke="#16a34a" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  catUnfinished: `<svg viewBox="0 0 16 16" width="16" height="16">
    <circle cx="8" cy="8" r="7" fill="#fef9c3" stroke="#ca8a04" stroke-width="0.8"/>
    <polyline points="8,4 8,8 11,10" fill="none" stroke="#ca8a04" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,

  catQueues: `<svg viewBox="0 0 16 16" width="16" height="16">
    <rect x="2" y="2" width="12" height="3" rx="1" fill="#cbd5e1" stroke="#64748b" stroke-width="0.5"/>
    <rect x="2" y="6" width="12" height="3" rx="1" fill="#94a3b8" stroke="#475569" stroke-width="0.5"/>
    <rect x="2" y="10" width="12" height="3" rx="1" fill="#64748b" stroke="#334155" stroke-width="0.5"/>
  </svg>`
};

if (typeof module !== 'undefined') {
  module.exports = IDMIcons;
}
