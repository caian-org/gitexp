export const str = (n: Buffer | number): string => n.toString()

export const len = (a: any[] | string): number => a.length

export const uniq = (i: string[]): string[] => [...new Set(i)]

export const largestWord = (i: string[]): string => i.reduce((a, b) => (len(a) > len(b) ? a : b))

export const isDef = (k: string): boolean => typeof process.env[k] !== 'undefined'
