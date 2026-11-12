# Prints a board's visible text lines in document order, skipping aria-hidden
# subtrees, <script>, <style>, <title> and <helmet>: the "visible lines" the
# plan's copy lists take verbatim (P3-T14). Usage: python3 -I board_lines.py <board.dc.html>
import sys
from html.parser import HTMLParser

VOID = {'meta', 'link', 'input', 'br', 'img', 'hr', 'path', 'circle', 'rect', 'ellipse'}

class Lines(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []  # (tag, hidden)
        self.lines = []
        self.buf = []
    def hidden(self):
        return any(h for _, h in self.stack)
    def flush(self):
        text = ' '.join(''.join(self.buf).split())
        if text:
            self.lines.append(text)
        self.buf = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        skip = tag in ('script', 'style', 'title', 'helmet', 'svg') or a.get('aria-hidden') == 'true'
        if tag in ('div', 'p', 'h1', 'h2', 'button', 'label', 'legend', 'section', 'a', 'fieldset'):
            self.flush()
        if tag in VOID:
            return
        self.stack.append((tag, skip))
    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if tag in ('div', 'p', 'h1', 'h2', 'button', 'label', 'legend', 'section', 'a', 'fieldset', 'span'):
            if tag != 'span':
                self.flush()
        while self.stack:
            t, _ = self.stack.pop()
            if t == tag:
                break
    def handle_data(self, data):
        if not self.hidden():
            self.buf.append(data)

p = Lines()
p.feed(open(sys.argv[1], encoding='utf-8').read())
p.flush()
for line in p.lines:
    print(line)
