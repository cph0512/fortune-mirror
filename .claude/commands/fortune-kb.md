# Fortune KB Management

Manage the fortune-mirror knowledge base (101 entries, 4 categories).

## KB File
`~/fortune-mirror/public/default-kb.json`

## Entry Structure
```json
{
  "id": "ziwei_001",
  "category": "ziwei",       // ziwei | bazi | astro | general
  "title": "Entry title",
  "content": "Knowledge content...",
  "tags": ["core", "love"]   // core | love | wealth | career | health | general | ziwei | bazi | astro
}
```

## Tag Rules
- `core` = Always sent regardless of user's goal (SOP, rules, quality checks)
- `love/wealth/career/health` = Topic tags, sent when user selects matching goal
- `ziwei/bazi/astro` = System tags, for system-specific filtering
- `general` = No specific topic, sent when goal=general (full analysis)

## Common Tasks

### Add new entry
Read the KB file, add entry with proper id/category/tags, save.

### Update KB version
After editing KB, bump `KB_VERSION` in both:
- `~/fortune-mirror/src/WizardApp.jsx` (line ~29)
- `~/fortune-mirror/src/App.jsx` (line ~122)

### Check tag distribution
```bash
cd ~/fortune-mirror && python3 -c "
import json; from collections import Counter
kb=json.load(open('public/default-kb.json'))
tags=[t for e in kb for t in e.get('tags',[])]
for t,c in Counter(tags).most_common(): print(f'  {t}: {c}')
"
```

### Validate all entries have tags
```bash
cd ~/fortune-mirror && python3 -c "
import json
kb=json.load(open('public/default-kb.json'))
missing=[e['id'] for e in kb if not e.get('tags')]
print(f'Missing tags: {missing}' if missing else 'All entries tagged')
"
```

## Current Stats (2026-04-07)
- Total: 101 entries, ~17,782 tokens
- ziwei: 64, bazi: 34, astro: 1, general: 2
- core: 17, love: 44, wealth: 55, career: 44, health: 21
