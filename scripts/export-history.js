const fs = require('fs');
const path = require('path');

const transcriptFile = 'C:/Users/H/.gemini/antigravity-ide/brain/36ab76c9-05d4-4351-a575-7fd898847985/.system_generated/logs/transcript.jsonl';
if (!fs.existsSync(transcriptFile)) {
  console.error('Transcript file does not exist at:', transcriptFile);
  process.exit(1);
}

const lines = fs.readFileSync(transcriptFile, 'utf8').split('\n').filter(Boolean);

let md = '# Complete Antigravity Session Chat History\n\n';
md += '> **Project:** Internet Download Manager (IDM) Reverse Engineering & Replica\n';
md += '> **Session Date:** October 14–15, 2026\n';
md += '> **Status:** 100% Fully Functional Desktop App + Chrome Extension Integration\n\n';
md += '---\n\n';

let userTurn = 1;

for (const line of lines) {
  try {
    const entry = JSON.parse(line);
    if (entry.type === 'USER_INPUT') {
      const match = entry.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
      const req = match ? match[1].trim() : entry.content.trim();
      if (req) {
        md += `## 💬 User Request #${userTurn}\n\n`;
        md += `> ${req}\n\n`;
        userTurn++;
      }
    } else if (entry.type === 'PLANNER_RESPONSE' && entry.content) {
      const content = entry.content.trim();
      if (content.length > 80 && !content.startsWith('{"tool_calls"')) {
        md += `### 🤖 Assistant Solution & Walkthrough\n\n`;
        md += content + '\n\n';
        md += '---\n\n';
      }
    }
  } catch (err) {
    // Ignore malformed lines
  }
}

const targetPath = path.join(__dirname, '..', 'CHAT_HISTORY.md');
fs.writeFileSync(targetPath, md, 'utf8');
console.log(`Successfully generated ${targetPath} (${md.length} bytes)`);
