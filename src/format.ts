import util from 'util'

import _ from 'lodash'
import chalk from 'chalk'
import plural from 'pluralize'
import { differenceInSeconds, secondsToMinutes, secondsToHours } from 'date-fns'

import { IOccurence, IHash, ITabulateOptions } from './types'

import { str, len, largestWord } from './primitive'

export const fmt = util.format

export const indent =
  (level: number = 2) =>
    (a: string): string =>
      ' '.repeat(level).concat(a)

export const fmtBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes < 0) {
    throw new Error(`Bytes must be above 0; got "${bytes}"`)
  }

  if (bytes === 0) {
    return '0 Bytes'
  }

  const k = 1024
  const dm = Number(decimals < 0 ? 0 : decimals)
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return fmt('%s %s', str(parseFloat((bytes / Math.pow(k, i)).toFixed(dm))), sizes[i])
}

export const getElapsedTimeFormatted = (start: Date): string => {
  const elapsedTime = differenceInSeconds(new Date(), start)

  const q = (x: number, v: string): IHash => ({ value: x, ext: plural(v, x, true) })
  const t = [q(elapsedTime, 'second'), q(secondsToMinutes(elapsedTime), 'minute'), q(secondsToHours(elapsedTime), 'hour')]

  const template = (() => {
    switch (t.map((i) => Number(i.value > 0)).reduce((a, b) => a + b)) {
      case 1:
        return '%s'
      case 2:
        return '%s and %s'
      default:
        return '%s, %s and %s'
    }
  })()

  return fmt(template, ...t.filter((i) => i.value > 0).map((i) => i.ext))
}

export const censor = (o: string, n: string): string => {
  const c = '*'
  const r = (t: string): string => (len(t) < 4 ? c.repeat(len(t)) : t.slice(0, 3 - len(t)).concat(c.repeat((3 - len(t)) * -1)))

  return fmt('%s/%s', r(o), r(n))
}

export const stripColor = (t: string): string =>
  t.replace(
    new RegExp(
      [
        '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
        '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
      ].join('|'),
      'g'
    ),
    ''
  )

export const tabulateOccurrences = (occ: IOccurence[], opts: Partial<ITabulateOptions> = {}): string => {
  const { maxColsToDisplay = 4, hideRank = false, hideOccurences = false } = opts

  const occurPositionPadSpace = len(str(len(occ)))

  const colsToDisplay = (() => {
    /* the length of the largest possible result, e.g. "99. Some occurrence (100)" */
    const t =
      occurPositionPadSpace +
      len(largestWord(occ.map((w) => str(w.count)))) +
      len(largestWord(occ.map((w) => w.name))) +
      (maxColsToDisplay - 1) * 6

    /* given the length of the largest result, how many columns fits on the terminal? */
    const m = Math.ceil(process.stdout.columns / t)

    /* we need at least one column */
    if (m <= 0) {
      return 1
    }

    /* and at maximum ... */
    return m > maxColsToDisplay ? maxColsToDisplay : m
  })()

  /* divide the lines in chunks of N (columns amount) */
  const occurChunkedByCols = _.chunk(
    /* give the ranked list some pretty colors */
    occ.map((s, i) =>
      fmt(
        '%s %s %s',
        hideRank ? '' : _.padStart(chalk.gray(`${i + 1}.`), occurPositionPadSpace + 1),
        s.name,
        hideOccurences ? '' : chalk.bold(fmt('(%d)', s.count))
      )
    ),
    Math.ceil(len(occ) / colsToDisplay)
  )

  /* the length of the largest line of each column */
  const columnPad = occurChunkedByCols.map((q) => len(largestWord(q.map((t) => stripColor(t)))))

  const entries = Array
    /* creates an empty array just to iterate N times (max number of lines on a given column) */
    .from(Array(len(_.first(occurChunkedByCols) ?? [])))

    /* join items N times (columns amount); transforms this:
       [
         ['a', 'b', 'c', 'd'],
         ['e', 'f', 'g', 'h'],
         ['i', 'j', 'k', 'l'],
       ]

     into this:
       [
         'a b c d',
         'e f g h',
         'i j k l',
       ] */
    .map((_, lineNumber) =>
      occurChunkedByCols
        .map((column, colNumber) =>
          (column[lineNumber] ?? '').concat(' '.repeat(columnPad[colNumber] - len(stripColor(column[lineNumber] ?? ''))))
        )
        .join('  ')
    )
    .map(indent())

  return (entries.every((t) => t.startsWith(' ', 3)) ? entries.map((t) => t.trim()).map(indent()) : entries).join('\n')
}
