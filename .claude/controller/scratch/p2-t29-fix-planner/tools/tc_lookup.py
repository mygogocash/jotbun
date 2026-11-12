# Looks up English copy lines as translateCopy does (by English value) and prints the Thai.
import json, sys
en = json.load(open(sys.argv[1], encoding='utf-8'))
th = json.load(open(sys.argv[2], encoding='utf-8'))
by_value = {}
for key, value in en.items():
    by_value.setdefault(value, key)
for line in sys.argv[3:]:
    key = by_value.get(line)
    print(f"{line!r} => {'MISSING' if key is None else repr(th.get(key, 'NO-TH'))}")
