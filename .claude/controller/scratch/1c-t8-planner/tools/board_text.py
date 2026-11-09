# Print the visible text nodes of a design board (.dc.html), one per line, in order.
import sys
from html.parser import HTMLParser

class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.out = []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.skip:
            self.skip -= 1
    def handle_data(self, data):
        if self.skip:
            return
        text = ' '.join(data.split())
        if text:
            self.out.append(text)

for path in sys.argv[1:]:
    parser = Text()
    with open(path, encoding='utf-8') as handle:
        parser.feed(handle.read())
    print('=== ' + path.rsplit('/', 1)[-1])
    for line in parser.out:
        print(line)
