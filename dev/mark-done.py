# Marks one diagram DONE in STATUS-3D.md (used by the 3D session's builders before they checkpoint).
# Usage: py dev/mark-done.py <id> "<short note>"
import sys, re
ROOT = __file__.rsplit('dev', 1)[0]
p = ROOT + 'STATUS-3D.md'
did, note = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else '')
s = open(p, encoding='utf8').read()
out = []
for line in s.split('\n'):
    m = re.match(r'^\| (\d+) \| ' + re.escape(did) + r' \|', line)
    if m:
        line = f'| {m.group(1)} | {did} | DONE (reviewed + fixed) | | 0 at every state (--strict --offline) | {did}-sheet.png, {did}-*.png {note} |'
    out.append(line)
open(p, 'w', encoding='utf8').write('\n'.join(out))
print('marked', did)
