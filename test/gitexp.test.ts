/* globals describe it expect */

import gitexp from '../src/gitexp'

describe('GITEXP:', () => {
  if (gitexp === null) {
    throw new Error('Did you forgot to export "IS_TESTING"?')
  }

  const g = gitexp

  /* ... */
  describe('Function "str" (convert to string):', () => {
    const t = 'text text text'

    it('Should convert a number (int)', () => expect(g.str(1)).toBe('1'))
    it('Should convert a number (float)', () => expect(g.str(2.2)).toBe('2.2'))
    it('Should convert a buffer', () => expect(g.str(Buffer.from(t, 'utf-8'))).toBe(t))
  })

  /* ... */
  describe('Function "len" (length of something)', () => {
    it('Should get the length of a string', () => expect(g.len('abc')).toBe(3))
    it('Should get the length of an array', () => expect(g.len([1, 2, 3, 4])).toBe(4))
  })

  /* ... */
  describe('Function "uniq" (unique items)', () => {
    const a = ['a', 'b', 'a', 'c', 'b', 'd', 'a']
    const b = ['a', 'b', 'A', 'c', 'B', 'd', 'a']

    it('Should get the unique items of a string array', () => expect(g.uniq(a).length).toBe(4))
    it('Should differentiate upper and lower case characters', () =>
      expect(g.uniq(b).length).toBe(6))
  })

  /* ... */
  describe('Function "censor" (hide part of a git user@repo)', () => {
    it('Should censor all but the first 3 chars', () =>
      expect(g.censor('my_user', 'my_repo')).toBe('my_****/my_****'))

    it('Should censor all when the user or repo have less than 4 chars', () =>
      expect(g.censor('hey', 'you')).toBe('***/***'))
  })

  /* ... */
  describe('Function "fmtBytes" (byte amount to formatted value)', () => {
    const f = g.fmtBytes

    const _1kb = 1024
    const _1mb = Math.pow(_1kb, 2)
    const _1gb = Math.pow(_1kb, 3)
    const _1tb = Math.pow(_1kb, 4)

    it('Should format 0 (zero) bytes', () => expect(f(0)).toBe('0 Bytes'))
    it('Should format bytes', () => expect(f(1000)).toBe('1000 Bytes'))

    it('Should format KB', () => expect(f(_1kb)).toBe('1 KB'))
    it('Should format KB with decimal places', () => expect(f(1300)).toBe('1.27 KB'))
    it('Should format KB with custom decimal places', () => expect(f(1500, 3)).toBe('1.465 KB'))

    it('Should format MB', () => expect(g.fmtBytes(_1mb)).toBe('1 MB'))
    it('Should format MB with decimal places', () => expect(f(_1mb + 150 * _1kb)).toBe('1.15 MB'))
    it('Should format MB with custom decimal places', () =>
      expect(f(_1mb + 234 * _1kb, 3)).toBe('1.229 MB'))

    it('Should format GB', () => expect(g.fmtBytes(_1gb)).toBe('1 GB'))
    it('Should format GB with decimal places', () => expect(f(_1gb + 870 * _1mb)).toBe('1.85 GB'))
    it('Should format GB with custom decimal places', () =>
      expect(f(_1gb + 234 * _1kb, 4)).toBe('1.0002 GB'))

    it('Should format TB', () => expect(g.fmtBytes(_1tb)).toBe('1 TB'))
    it('Should format TB with decimal places', () => expect(f(_1tb + 512 * _1gb)).toBe('1.5 TB'))
    it('Should format TB with custom decimal places', () =>
      expect(f(_1tb + 700 * _1gb, 4)).toBe('1.6836 TB'))

    it('Should throw when the bytes are below 0 (zero)', () => {
      try {
        f(-1)
        fail('"fmtBytes" with negative value did not throw')
      } catch (e) {
        const { message } = e as Error
        expect(message).toBe('Bytes must be above 0; got "-1"')
      }
    })

    it('Should fallbacks to 0 (zero) decimal places when "decimals" are below zero', () =>
      expect(f(1300, -1)).toBe('1 KB'))
  })
})
