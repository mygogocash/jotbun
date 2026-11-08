"""Resolve conflicts in the receipts ledger by keeping both sides: the integration head's lines first, then the branch's."""
import re, sys
path = sys.argv[1]
text = open(path).read()
pattern = re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
count = 0
def keep_both(m):
    global count
    count += 1
    ours, theirs = m.group(1), m.group(2)
    return theirs.rstrip('\n') + '\n\n' + ours
text = pattern.sub(keep_both, text)
if '<<<<<<<' in text or '>>>>>>>' in text:
    sys.exit('conflict markers remain')
open(path, 'w').write(text)
print(f'resolved {count} block(s)')
