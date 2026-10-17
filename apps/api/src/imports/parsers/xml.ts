// A minimal, strict XML tokenizer for the OOXML parts of an XLSX (runs in
// the parser child). It never fetches or expands anything: a DOCTYPE or any
// entity other than the five predefined ones and numeric character references
// is refused (no external entities, no "billion laughs"), as are mismatched
// tags, nesting deeper than 64 and text outside the root. Element and
// attribute names keep their prefixes; `local` drops the prefix.
import { ParseRejection } from './protocol.ts';

export type XmlEvent =
  | { kind: 'open'; name: string; local: string; attrs: Record<string, string>; selfClosing: boolean }
  | { kind: 'close'; name: string; local: string }
  | { kind: 'text'; text: string };

const MAX_DEPTH = 64;
const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const ATTRIBUTE = /\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("([^"<]*)"|'([^'<]*)')/y;
const ENTITIES: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

const malformed = () => new ParseRejection('workbook_malformed');
const localName = (name: string) => name.slice(name.indexOf(':') + 1);

/** UTF-8 XML text (a byte-order mark is dropped); anything else is refused. */
export function decodeXml(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw malformed();
  }
}

const XML_CHAR = (code: number) =>
  code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);

function decodeText(raw: string): string {
  if (!raw.includes('&')) return raw;
  // Every "&" must start one of the predefined entities or a character reference.
  return raw.replace(/&(?:([^;&\s]{1,10});)?/g, (_match, entity: string | undefined) => {
    if (entity === undefined) throw malformed();
    if (entity.startsWith('#')) {
      if (!/^#(x[0-9A-Fa-f]{1,6}|[0-9]{1,7})$/.test(entity)) throw malformed();
      const code = entity[1] === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      if (!XML_CHAR(code)) throw malformed();
      return String.fromCodePoint(code);
    }
    const value = Object.prototype.hasOwnProperty.call(ENTITIES, entity) ? ENTITIES[entity] : undefined;
    if (value === undefined) throw malformed();
    return value;
  });
}

export function* xmlEvents(text: string): Generator<XmlEvent> {
  const stack: string[] = [];
  let at = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let seenRoot = false;
  while (at < text.length) {
    const lt = text.indexOf('<', at);
    const textEnd = lt === -1 ? text.length : lt;
    if (textEnd > at) {
      const raw = text.slice(at, textEnd);
      if (stack.length === 0) {
        if (raw.trim() !== '') throw malformed();
      } else {
        yield { kind: 'text', text: decodeText(raw) };
      }
    }
    if (lt === -1) break;
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      if (end === -1) throw malformed();
      at = end + 2;
    } else if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end === -1) throw malformed();
      at = end + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end === -1 || stack.length === 0) throw malformed();
      yield { kind: 'text', text: text.slice(lt + 9, end) };
      at = end + 3;
    } else if (text.startsWith('<!', lt)) {
      // DOCTYPE, ENTITY and every other declaration.
      throw malformed();
    } else if (text.startsWith('</', lt)) {
      const end = text.indexOf('>', lt + 2);
      if (end === -1) throw malformed();
      const name = text.slice(lt + 2, end).trim();
      if (stack.pop() !== name) throw malformed();
      yield { kind: 'close', name, local: localName(name) };
      at = end + 1;
    } else {
      const end = text.indexOf('>', lt + 1);
      if (end === -1) throw malformed();
      let body = text.slice(lt + 1, end);
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1);
      const nameMatch = /^[^\s/>]+/.exec(body);
      if (!nameMatch || !NAME.test(nameMatch[0])) throw malformed();
      const name = nameMatch[0];
      // No prototype: an attribute named __proto__ or constructor is just a name.
      const attrs: Record<string, string> = Object.create(null) as Record<string, string>;
      ATTRIBUTE.lastIndex = name.length;
      let position = name.length;
      for (;;) {
        const match = ATTRIBUTE.exec(body);
        if (!match) break;
        if (Object.prototype.hasOwnProperty.call(attrs, match[1])) throw malformed();
        attrs[match[1]] = decodeText(match[3] ?? match[4] ?? '');
        position = ATTRIBUTE.lastIndex;
      }
      if (body.slice(position).trim() !== '') throw malformed();
      if (stack.length === 0) {
        if (seenRoot) throw malformed();
        seenRoot = true;
      }
      yield { kind: 'open', name, local: localName(name), attrs, selfClosing };
      if (!selfClosing) {
        stack.push(name);
        if (stack.length > MAX_DEPTH) throw malformed();
      }
      at = end + 1;
    }
  }
  if (stack.length !== 0 || !seenRoot) throw malformed();
}
