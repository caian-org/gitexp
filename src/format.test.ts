import { fmtBytes, censor } from './format'

describe('Function "fmtBytes" (byte amount to formatted value)', () => {
  const _1kb = 1024
  const _1mb = Math.pow(_1kb, 2)
  const _1gb = Math.pow(_1kb, 3)
  const _1tb = Math.pow(_1kb, 4)

  it('Should fallbacks to 0 (zero) decimal places when "decimals" are below zero', () => expect(fmtBytes(1300, -1)).toBe('1 KB'))

  it('Should format 0 (zero) bytes', () => expect(fmtBytes(0)).toBe('0 Bytes'))
  it('Should format bytes', () => expect(fmtBytes(1000)).toBe('1000 Bytes'))

  it('Should format KB', () => expect(fmtBytes(_1kb)).toBe('1 KB'))
  it('Should format KB with decimal places', () => expect(fmtBytes(1300)).toBe('1.27 KB'))
  it('Should format KB with custom decimal places', () => expect(fmtBytes(1500, 3)).toBe('1.465 KB'))

  it('Should format MB', () => expect(fmtBytes(_1mb)).toBe('1 MB'))
  it('Should format MB with decimal places', () => expect(fmtBytes(_1mb + 150 * _1kb)).toBe('1.15 MB'))
  it('Should format MB with custom decimal places', () => expect(fmtBytes(_1mb + 234 * _1kb, 3)).toBe('1.229 MB'))

  it('Should format GB', () => expect(fmtBytes(_1gb)).toBe('1 GB'))
  it('Should format GB with decimal places', () => expect(fmtBytes(_1gb + 870 * _1mb)).toBe('1.85 GB'))
  it('Should format GB with custom decimal places', () => expect(fmtBytes(_1gb + 234 * _1kb, 4)).toBe('1.0002 GB'))

  it('Should format TB', () => expect(fmtBytes(_1tb)).toBe('1 TB'))
  it('Should format TB with decimal places', () => expect(fmtBytes(_1tb + 512 * _1gb)).toBe('1.5 TB'))
  it('Should format TB with custom decimal places', () => expect(fmtBytes(_1tb + 700 * _1gb, 4)).toBe('1.6836 TB'))

  it('Should throw when the bytes are below 0 (zero)', () => {
    try {
      fmtBytes(-1)
      fail('"fmtBytes" with negative value did not throw')
    } catch (e) {
      const { message } = e as Error
      expect(message).toBe('Bytes must be above 0; got "-1"')
    }
  })
})

describe('Function "censor" (hide part of a git user@repo)', () => {
  it('Should censor all but the first 3 chars', () => expect(censor('my_user', 'my_repo')).toBe('my_****/my_****'))

  it('Should censor all when the user or repo have less than 4 chars', () => expect(censor('hey', 'you')).toBe('***/***'))
})
