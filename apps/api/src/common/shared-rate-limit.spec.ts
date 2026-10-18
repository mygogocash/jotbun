import { networkSubject } from './shared-rate-limit';

describe('network rate-limit subject', () => {
  it('groups an IPv6 client by its /64, so rotating addresses within it does not help', () => {
    expect(networkSubject('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(networkSubject('2001:0db8:0001:0002:bbbb:cccc:dddd:eeee')).toBe('2001:db8:1:2::/64');
    expect(networkSubject('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
    expect(networkSubject('::1')).toBe('0:0:0:0::/64');
  });

  it('treats an IPv4-mapped address as the IPv4 address', () => {
    expect(networkSubject('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(networkSubject('203.0.113.9')).toBe('203.0.113.9');
  });

  it.each([undefined, '', 'not-an-ip', '2001:db8::1::2'])('uses one shared "unknown" bucket for %p', (ip) => {
    expect(networkSubject(ip)).toBe('unknown');
  });
});
