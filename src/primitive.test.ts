import { str, len, uniq } from './primitive'

describe('Function "str" (convert to string):', () => {
  const t = 'text text text'

  it('Should convert a number (int)', () => expect(str(1)).toBe('1'))
  it('Should convert a number (float)', () => expect(str(2.2)).toBe('2.2'))
  it('Should convert a buffer', () => expect(str(Buffer.from(t, 'utf-8'))).toBe(t))
})

describe('Function "len" (length of something)', () => {
  it('Should get the length of a string', () => expect(len('abc')).toBe(3))
  it('Should get the length of an array', () => expect(len([1, 2, 3, 4])).toBe(4))
})

describe('Function "uniq" (unique items)', () => {
  const a = ['a', 'b', 'a', 'c', 'b', 'd', 'a']
  const b = ['a', 'b', 'A', 'c', 'B', 'd', 'a']

  it('Should get the unique items of a string array', () => expect(uniq(a).length).toBe(4))
  it('Should differentiate upper and lower case characters', () => expect(uniq(b).length).toBe(6))
})
