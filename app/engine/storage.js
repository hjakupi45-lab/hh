const fs = require('fs');
const path = require('path');
const os = require('os');

class StorageManager {
  constructor() {
    this.baseDir = path.join(os.homedir(), '.idm_reverse');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }

    this.downloadsFile = path.join(this.baseDir, 'downloads.json');
    this.settingsFile = path.join(this.baseDir, 'settings.json');

    this.defaultSettings = {
      defaultDownloadDir: path.join(os.homedir(), 'Downloads'),
      categoryDirs: {
        compressed: path.join(os.homedir(), 'Downloads', 'Compressed'),
        documents: path.join(os.homedir(), 'Downloads', 'Documents'),
        music: path.join(os.homedir(), 'Downloads', 'Music'),
        programs: path.join(os.homedir(), 'Downloads', 'Programs'),
        video: path.join(os.homedir(), 'Downloads', 'Video'),
        general: path.join(os.homedir(), 'Downloads')
      },
      maxSegments: 8,
      speedLimitKBps: 0, // 0 = unlimited
      speedLimiterEnabled: false,
      soundsEnabled: true,
      autoStartDownload: true,
      showDownloadProgressDialog: true,
      showDownloadCompleteDialog: true,
      firstRunWizardShown: false,
      port: 9462,
      interceptExtensions: [
        '3GP', '7Z', 'AAC', 'ACE', 'AIF', 'APK', 'ARJ', 'ASF', 'AVI', 'BIN',
        'BZ2', 'DMG', 'DOC', 'DOCX', 'EXE', 'FLV', 'GZ', 'GZIP', 'IMG', 'ISO',
        'LZH', 'M4A', 'M4V', 'MKV', 'MOV', 'MP3', 'MP4', 'MPA', 'MPE', 'MPEG',
        'MPG', 'MSI', 'MSU', 'OGG', 'OGV', 'PDF', 'PLJ', 'PPS', 'PPT', 'PPTX',
        'QT', 'RA', 'RAR', 'RM', 'RMVB', 'SEA', 'SIT', 'SITX', 'TAR', 'TIF',
        'TIFF', 'WAV', 'WMA', 'WMV', 'XLS', 'XLSX', 'ZIP'
      ]
    };

    this.downloads = this.loadDownloads();
    this.settings = this.loadSettings();
  }

  loadDownloads() {
    try {
      if (fs.existsSync(this.downloadsFile)) {
        const raw = fs.readFileSync(this.downloadsFile, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Error loading downloads:', e);
    }
    return [];
  }

  saveDownloads() {
    try {
      fs.writeFileSync(this.downloadsFile, JSON.stringify(this.downloads, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving downloads:', e);
    }
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const raw = fs.readFileSync(this.settingsFile, 'utf8');
        return { ...this.defaultSettings, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    }
    return { ...this.defaultSettings };
  }

  saveSettings(newSettings) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2), 'utf8');
      return this.settings;
    } catch (e) {
      console.error('Error saving settings:', e);
      return this.settings;
    }
  }

  getCategory(fileName) {
    if (!fileName) return 'general';
    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    const categories = {
      compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso', 'dmg', 'bin', 'arj'],
      documents: ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'csv'],
      music: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'aif'],
      programs: ['exe', 'msi', 'apk', 'bat', 'cmd', 'ps1', 'sh', 'deb', 'rpm'],
      video: ['mp4', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'webm', '3gp', 'm4v', 'ts']
    };

    for (const [cat, exts] of Object.entries(categories)) {
      if (exts.includes(ext)) {
        return cat;
      }
    }
    return 'general';
  }

  getTargetDir(category) {
    const dir = this.settings.categoryDirs[category] || this.settings.defaultDownloadDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
}

module.exports = new StorageManager();
