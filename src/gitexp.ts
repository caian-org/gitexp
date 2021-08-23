/* standard lib */
import fs from 'fs'
import path from 'path'
import util from 'util'

/* core features */
import _ from 'lodash'
import Git from 'simple-git'
import archiver from 'archiver'
import fastFolderSize from 'fast-folder-size'
import { Octokit } from '@octokit/rest'
import { Command, Option, OptionValues } from 'commander'
import { differenceInSeconds, secondsToMinutes, secondsToHours } from 'date-fns'

/* aesthetic stuff */
import chalk from 'chalk'
import clear from 'clear'
import plural from 'pluralize'
import Spinnies from 'spinnies-ts'
import cliSpinner, { Spinner as SpinnerType } from 'cli-spinners'

/* -------------------------------------------------------------------------
                               TYPES & INTERFACES
   ------------------------------------------------------------------------- */

/* ... */
interface IHash {
  [key: string]: any
}

/* ... */
interface IRepository {
  name: string
  fullName: string
  url: string
  lang: string
  isPrivate: boolean
  owner: {
    name: string
    isOrg: boolean
  }
}

/* ... */
interface ISpinny {
  ref: Spinny
  succeed: (t: string) => void
  fail: (t: string) => void
}

interface IOccurence {
  name: string
  count: number
}

/* ... */
interface IGitHubStats {
  repos: {
    pub: string[]
    priv: string[]
  }
  users: IOccurence[]
  orgs: IOccurence[]
  langs: IOccurence[]
}

/* ... */
interface IUserData {
  repositories: IRepository[]
  stats: IGitHubStats
}

/* ... */
interface IGitCloneSpinner {
  repoClonedCounter: number
  repoFailedCounter: number
  counterPad: number
  repoNamePad: number
  repoTotal: string
  spinner: ISpinny
}

/* ... */
interface IWorkingTimer {
  spinner: ISpinny
  elapsed: number
}

/* ... */
interface ICloneFilters {
  visibility: RepoVisibility
  ownerType: RepoOwnerType
  onlyFrom: string[] | null
  languages: string[] | null
}

enum RepoVisibility {
  ALL = 'all',
  PUBLIC = 'public',
  PRIVATE = 'private'
}

enum RepoOwnerType {
  ALL = 'all',
  USER = 'user',
  ORG = 'org'
}

/* ... */
type CloneStatus = PromiseSettledResult<IRepository>
type Spinny = Spinnies.SpinnerOptions
type SpinnyBuilder = (n: string, t: string) => ISpinny

/* -------------------------------------------------------------------------
                              HELPERS & UTILITIES
   ------------------------------------------------------------------------- */

/* ... */
const fmt = util.format
const ffs = util.promisify(fastFolderSize)

const str = (n: Buffer | number): string => n.toString()
const len = (a: any[] | string): number => a.length
const uniq = (i: string[]): string[] => [...new Set(i)]

const largestWord = (i: string[]): string => i.reduce((a, b) => (len(a) > len(b) ? a : b))

const isDef = (k: string): boolean => typeof process.env[k] !== 'undefined'

const panic = (m: any): void => {
  console.error(m)
  process.exit(1)
}

/* ... */
const DEST_DIR = path.join(__dirname, 'gitexp-out')
const IS_TESTING = isDef('IS_TESTING')

/* adapted from <https://github.com/watson/ci-info> */
const isCI = (): boolean =>
  !!(
    // Travis CI, CircleCI, Cirrus CI, Gitlab CI, Appveyor, CodeShip, dsari
    (
      isDef('CI') ||
      // Travis CI, Cirrus CI
      isDef('CONTINUOUS_INTEGRATION') ||
      // Jenkins, TeamCity
      isDef('BUILD_NUMBER') ||
      // TaskCluster, dsari
      isDef('RUN_ID') ||
      isDef(exports.name) ||
      false
    )
  )

/* ... */
const fmtBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) {
    return '0 Bytes'
  }

  const k = 1024
  const dm = Number(decimals < 0 ? 0 : decimals)
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return fmt('%s %s', str(parseFloat((bytes / Math.pow(k, i)).toFixed(dm))), sizes[i])
}

/* ... */
const getElapsedTimeFormatted = (start: Date): string => {
  const elapsedTime = differenceInSeconds(new Date(), start)

  const q = (x: number, v: string): IHash => ({ value: x, ext: plural(v, x, true) })
  const t = [
    q(elapsedTime, 'second'),
    q(secondsToMinutes(elapsedTime), 'minute'),
    q(secondsToHours(elapsedTime), 'hour')
  ]

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

/* ... */
const getFiglets = async (): Promise<string[]> => {
  const fig: string[] = []

  const t = (n: string): string => '(%%%' + n.toUpperCase()
  const tag = Object.fromEntries(['start', 'end', 'div'].map((i) => [i, t(i)]))

  try {
    let foundStart = false
    const itself = await fs.promises.readFile(__filename)
    const lines = str(itself).split('\n')

    for (const line of lines) {
      const l = line.trim()
      if (l === '') {
        continue
      }

      if (l.startsWith(tag.start)) {
        foundStart = true
        continue
      }

      if (l.startsWith(tag.end)) {
        break
      }

      if (foundStart) {
        if (l.startsWith(tag.div)) {
          fig.push(tag.div)
          continue
        }

        fig.push(' '.repeat(2).concat(line))
      }
    }

    return fig.join('\n').split(tag.div)
  } catch (e) {
    return []
  }
}

/* ... */
const displayBanner = async (): Promise<void> => {
  clear()

  const figlets = await getFiglets()
  const banner = len(figlets) > 0 ? _.sample(figlets) : ''

  console.log(fmt('\n%s\n', chalk.gray(banner)))
}

/* ... */
const censor = (o: string, n: string): string => {
  const c = '*'
  const r = (t: string): string =>
    len(t) < 4 ? c.repeat(len(t)) : t.slice(0, 3 - len(t)).concat(c.repeat((3 - len(t)) * -1))

  return fmt('%s/%s', r(o), r(n))
}

/* got from <https://github.com/chalk/ansi-regex> */
const stripColor = (t: string): string =>
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

/* -------------------------------------------------------------------------
                                  CLI SPINNERS
   ------------------------------------------------------------------------- */

/* ... */
const spinnyBuilder = (spinner: SpinnerType, suppress: boolean = false): SpinnyBuilder => {
  const spinnies = new Spinnies({
    spinner,
    succeedPrefix: '✔',
    succeedColor: 'white',
    failColor: 'white',
    color: 'white',
    spinnerColor: 'blueBright'
  })

  if (suppress) {
    return (..._: string[]) => {
      const fn = (_: string): void => {}
      return { ref: { text: '' }, succeed: fn, fail: fn }
    }
  }

  return (name, text) => {
    const ref = spinnies.add(name, { text })
    return {
      ref,
      succeed: (t: string) => spinnies.succeed(name, { text: t }),
      fail: (t: string) => spinnies.fail(name, { text: t })
    }
  }
}

/* ... */
const updateCloneSpinner = (g: IGitCloneSpinner, r: IRepository, hasFailed: boolean): void => {
  if (hasFailed) {
    g.repoFailedCounter += 1
  } else {
    g.repoClonedCounter += 1
  }

  const n = r.isPrivate ? censor(r.owner.name, r.name) : r.fullName
  const c = fmt('cloned %s', _.padEnd(n, g.repoNamePad))
  const p = fmt('%s/%s completed', _.padStart(str(g.repoClonedCounter), g.counterPad), g.repoTotal)
  const f = g.repoFailedCounter > 0 ? fmt(', %s failed', g.repoFailedCounter.toString()) : ''

  g.spinner.ref.text = fmt('%s | %s', c, p.concat(f))
}

/* ... */
const concludeCloneSpinner = async (
  g: IGitCloneSpinner,
  s: CloneStatus[],
  e: CloneStatus[]
): Promise<void> => {
  const destDirSize = (await ffs(DEST_DIR)) ?? 0
  const labelDownloaded = fmt('%s downloaded locally', fmtBytes(destDirSize))

  const cloned = fmt('%s/%s', _.padStart(str(len(s)), g.counterPad), g.repoTotal)
  const labelClonedColored = len(e) > 0 ? chalk.bold.red(cloned) : chalk.greenBright(cloned)

  if (len(e) === 0) {
    g.spinner.succeed(fmt('cloned %s (%s)', labelClonedColored, labelDownloaded))
  } else {
    g.spinner.fail(fmt('cloned %s (%s failed; %s)', labelClonedColored, len(e), labelDownloaded))
  }
}

/* ... */
const tickTimer = (wt: IWorkingTimer): void => {
  wt.elapsed += 50
  wt.spinner.ref.text = fmt('working... %s seconds elapsed', (wt.elapsed / 1000).toFixed(2))
}

/* -------------------------------------------------------------------------
                           GIT / GITHUB INTERACTIONS
   ------------------------------------------------------------------------- */

/* ... */
const cloneLocally = async (g: IGitCloneSpinner, r: IRepository): Promise<IRepository> => {
  const d = path.join(DEST_DIR, r.owner.name)

  try {
    const git = Git()
    await git.clone(r.url, path.join(d, r.name))
    updateCloneSpinner(g, r, false)

    return r
  } catch (e) {
    console.log(e)
    updateCloneSpinner(g, r, true)
    throw e
  }
}

/* ... */
const zipCloned = async (): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const dest = path.join(__dirname, 'gitexp-archive.zip')

    const archive = archiver('zip', { comment: 'generated by gitexp', zlib: { level: 8 } })
    const output = fs.createWriteStream(dest)

    archive.pipe(output)
    archive.directory(DEST_DIR, false)
    output.on('close', () => resolve(dest))
    archive.on('error', (err) => reject(err))

    archive
      .finalize()
      .then(() => resolve(dest))
      .catch((err) => reject(err))
  })
}

/* ... */
const createClonedZIPArchive = async (sb: SpinnyBuilder): Promise<void> => {
  const sp = sb('archive', 'creating ZIP archive')

  try {
    const archiveDest = await zipCloned()
    const destDirSize = (await ffs(DEST_DIR)) ?? 1
    const archive = await fs.promises.stat(archiveDest)
    const reduced = (100 - (archive.size * 100) / destDirSize).toFixed(2).concat('%')

    sp.succeed(fmt('ZIP archive created (%s, %s size reduction)', fmtBytes(archive.size), reduced))
  } catch (e) {
    const errorMessage = chalk.bold.red(e.toString())
    sp.fail(errorMessage)

    throw e
  }
}

/* ... */
const categorizeRepositories = (repos: IRepository[]): IGitHubStats => {
  const rank = (i: string[]): IOccurence[] => {
    const r = Object.fromEntries(uniq(i).map((l) => [l, 0]))
    i.forEach((l) => r[l]++)

    return Object.keys(r)
      .map((name) => ({ name, count: r[name] }))
      .sort((a, b) => b.count - a.count)
  }

  const langs: string[] = []
  const users: string[] = []
  const orgs: string[] = []

  const s: IGitHubStats = {
    repos: { pub: [], priv: [] },
    langs: [],
    users: [],
    orgs: []
  }

  for (const r of repos) {
    if (r.isPrivate) {
      s.repos.priv.push(r.fullName)
    } else {
      s.repos.pub.push(r.fullName)
    }

    if (r.owner.isOrg) {
      orgs.push(r.owner.name)
    } else {
      users.push(r.owner.name)
    }

    langs.push(r.lang)
  }

  s.users = rank(users)
  s.orgs = rank(orgs)
  s.langs = rank(langs)

  return s
}

/* ... */
const fetchAllRepositories = async (sb: SpinnyBuilder, octo: Octokit): Promise<IUserData> => {
  const sp = sb('fetchAllRepositories', 'fetching repositories')

  const r: IRepository[] = []
  const list = octo.rest.repos.listForAuthenticatedUser

  for (let page = 1; ; page++) {
    const { status, data: repos } = await list({ page, visibility: 'all', per_page: 100 })

    if (status !== 200) {
      // @TODO
      throw new Error('fuck')
    }

    if (len(repos) === 0) {
      break
    }

    r.push(
      ...repos.map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        url: repo.clone_url,
        isPrivate: repo.private,
        lang: (repo.language ?? 'n/a').toLowerCase(),
        owner: {
          name: _.first(repo.full_name.split('/'))!,
          isOrg: repo.owner?.type.toLowerCase() === 'organization'
        }
      }))
    )
  }

  const s = categorizeRepositories(r)
  const m = fmt(
    '(%s; %s; %s; %s)',
    plural('public', len(s.repos.pub), true),
    plural('private', len(s.repos.priv), true),
    plural('organization', len(s.orgs), true),
    plural('user', len(s.users), true)
  )

  sp.succeed(fmt('found %s %s', plural('repository', len(r), true), (len(r), len(r) > 0 ? m : '')))
  return { repositories: r, stats: s }
}

/* ... */
const authenticate = async (sb: SpinnyBuilder): Promise<Octokit> => {
  const sp = sb('authenticate', 'authenticating')

  try {
    const octo = new Octokit({ auth: process.env.GITHUB_AUTH_TOKEN })
    const { data: authUser } = await octo.rest.users.getAuthenticated()

    const login = chalk.cyan(fmt('@%s', authUser.login))
    const name = authUser.name !== undefined ? fmt('(%s)', chalk.italic(authUser.name)) : ''
    sp.succeed(fmt('authenticated as %s %s', login, name))

    return octo
  } catch (e) {
    const errorMessage = chalk.bold.red(e.toString())
    sp.fail(errorMessage.concat(' -- is your token valid?'))

    throw e
  }
}

/* -------------------------------------------------------------------------
                             CLI & USER INTERACTION
   ------------------------------------------------------------------------- */

/* ... */
const parseCommandLineArgs = (args: string[]): OptionValues => {
  const commaList = (value: string, _: any): string[] =>
    value
      .split(',')
      .map((i) => i.trim())
      .filter((i) => len(i) > 1)

  const owner = new Option('-t, --owner-type <type>', 'filter by owner type')
  const visibility = new Option('-b, --visibility <level>', 'filter by repository visibility')
  const items = (o: object): string[] => Object.values(o).filter((v) => v !== 'all')

  return new Command()
    .version('1.0.0', '-v, --version')
    .option('-s, --summary', 'display a summary of repositories, languages, orgs etc')
    .option('-i, --interactive', 'set the running options interactively')
    .option('-l, --languages <langs>', 'filter by project language (comma separated)', commaList)
    .option('-f, --only-from <name>', 'filter by owner name (comma separated)', commaList)
    .addOption(owner.choices(items(RepoOwnerType)))
    .addOption(visibility.choices(items(RepoVisibility)))
    .parse(args)
    .opts()
}

/* ... */
const setArgsFallback = (opts: OptionValues): ICloneFilters => ({
  visibility: opts.visibility ?? RepoVisibility.ALL,
  ownerType: opts.ownerType ?? RepoOwnerType.ALL,
  onlyFrom: opts.onlyFrom ?? null,
  languages: opts.languages ?? null
})

/* ... */
const showGithubSummary = (stats: IGitHubStats): void => {
  const { langs } = stats

  const langPositionPadSpace = len(str(len(langs)))
  const maxColsToDisplay = 4

  const langCols = (() => {
    /* the length of the largest possible result, e.g. "99. Some Language (100)" */
    const langOccurencesPadSpace = len(largestWord(langs.map((l) => str(l.count))))
    const langNamePadSpace = len(largestWord(langs.map((l) => l.name)))
    const t = langPositionPadSpace + langOccurencesPadSpace + langNamePadSpace + 8

    /* given the length of the largest result, how many columns fits on the terminal? */
    const m = _.round(process.stdout.columns / t)

    /* we need at least one column */
    if (m === 0) {
      return 1
    }

    /* and at maximum ... */
    return m > maxColsToDisplay ? maxColsToDisplay : m
  })()

  /* give the ranked list some pretty colors */
  const rankedLangsFormatted = langs.map((s, i) =>
    fmt(
      '%s %s %s',
      chalk.gray(_.padStart(`${i + 1}.`, langPositionPadSpace + 1)),
      s.name,
      chalk.bold(fmt('(%d)', s.count))
    )
  )

  /* divide the lines in chunks of N (columns amount) */
  const langChunkedByCols = _.chunk(
    rankedLangsFormatted,
    _.round(len(rankedLangsFormatted) / langCols)
  )

  /* the length of the largest line of each column */
  const columnPad = langChunkedByCols.map((q) => len(largestWord(q.map((t) => stripColor(t)))))

  console.log(chalk.cyan('primary languages used by projects, ordered by most occurrences:\n'))

  Array
    /* creates an empty array just to iterate N times (max number of lines on a given column) */
    .from(Array(len(_.first(langChunkedByCols) ?? [])))

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
      langChunkedByCols
        .map((column, colNumber) =>
          (column[lineNumber] ?? '').concat(
            ' '.repeat(columnPad[colNumber] - len(stripColor(column[lineNumber] ?? '')))
          )
        )
        .join('  ')
    )
    .forEach((a) => console.log(a))

  console.log(chalk.cyan('unique '))
}

/* ... */
// @ts-expect-error
const getRunningOptionsInteractively = (): ICloneFilters => {}

/* ... */
const filterReposByUserInput = (repositories: IRepository[], f: ICloneFilters): IRepository[] =>
  repositories
    /* repository visibility filter; should only gets public? or private? or both? */
    .filter(
      (r) =>
        f.visibility === RepoVisibility.ALL ||
        (r.isPrivate && f.visibility === RepoVisibility.PRIVATE) ||
        (!r.isPrivate && f.visibility === RepoVisibility.PUBLIC)
    )

    /* repository main language filter; gets only if the main lang is X (python, js etc) */
    .filter((r) => f.languages === null || f.languages.includes(r.lang))

    /* repository owner filter; gets only if the owner is X */
    .filter((r) => f.onlyFrom === null || f.onlyFrom.includes(r.owner.name))

    /* repository owner type filter; should only gets repos from orgs? or users? or both? */
    .filter(
      (r) =>
        f.ownerType === RepoOwnerType.ALL ||
        (r.owner.isOrg && f.ownerType === RepoOwnerType.ORG) ||
        (!r.owner.isOrg && f.ownerType === RepoOwnerType.USER)
    )

/* -------------------------------------------------------------------------
                                   ENTRYPOINT
   ------------------------------------------------------------------------- */

/* ... */
const main = async (): Promise<void> => {
  const cliOptions = parseCommandLineArgs(process.argv)

  await displayBanner()
  const startTS = new Date()

  /* --- */
  const showSummary = cliOptions.summary !== undefined
  const runInteractive = cliOptions.interactive !== undefined

  const suppressLoadingSpinners = showSummary || isCI()
  const sb = spinnyBuilder(cliSpinner.point, suppressLoadingSpinners)

  const wt: IWorkingTimer = { spinner: sb('main', 'working...'), elapsed: 0 }
  const gewt = setInterval(tickTimer, 50, wt)

  /* --- */
  const octo = await authenticate(sb)
  const { repositories, stats } = await fetchAllRepositories(sb, octo)

  if (showSummary) {
    showGithubSummary(stats)
    process.exit(0)
  }

  const reposF = filterReposByUserInput(
    repositories,
    runInteractive ? getRunningOptionsInteractively() : setArgsFallback(cliOptions)
  )

  const gcs: IGitCloneSpinner = {
    repoClonedCounter: 0,
    repoFailedCounter: 0,
    repoTotal: str(len(reposF)),
    counterPad: len(str(len(reposF))),
    repoNamePad: len(largestWord(reposF.map((r) => r.fullName))),
    spinner: sb('cloning', 'cloning repositories')
  }

  const repoCloneStatus: CloneStatus[] = []
  for (const chunk of _.chunk(reposF, 10)) {
    // eslint-disable-next-line
    const calls = chunk.map((repo) => cloneLocally(gcs, repo))

    const res = await Promise.allSettled(calls)
    res.forEach((i) => repoCloneStatus.push(i))
  }

  const clonedSuccessfully = repoCloneStatus.filter((r) => r.status === 'fulfilled')
  const clonedWithErrors = _.xor(repoCloneStatus, clonedSuccessfully)

  await concludeCloneSpinner(gcs, clonedSuccessfully, clonedWithErrors)
  await createClonedZIPArchive(sb)

  clearInterval(gewt)
  wt.spinner.succeed(fmt('job finished in %s', getElapsedTimeFormatted(startTS)))
}

if (!IS_TESTING) {
  main().catch((e) => panic(e))
}

export default IS_TESTING
  ? {
      str,
      len,
      uniq,
      isDef,
      isCI,
      censor,
      fmtBytes,
      getElapsedTimeFormatted,
      filterReposByUserInput,
      parseCommandLineArgs,
      categorizeRepositories
    }
  : null

/*
(%%%START | font: rev

======================================
=============  =======================
==   ===  ==    ===   ===  =  ==    ==
=  =  =======  ===  =  ==  =  ==  =  =
==    ==  ===  ===     ===   ===  =  =
====  ==  ===  ===  ======   ===    ==
=  =  ==  ===  ===  =  ==  =  ==  ====
==   ===  ===   ===   ===  =  ==  ====
======================================

(%%%DIV | font: speed

        __________
_______ ___(_)_  /_________  _________
__  __ `/_  /_  __/  _ \_  |/_/__  __ \
_  /_/ /_  / / /_ /  __/_>  < __  /_/ /
_\__, / /_/  \__/ \___//_/|_| _  .___/
/____/                        /_/

(%%%DIV | font: poison

 @@@@@@@@  @@@  @@@@@@@  @@@@@@@@  @@@  @@@  @@@@@@@
@@@@@@@@@  @@@  @@@@@@@  @@@@@@@@  @@@  @@@  @@@@@@@@
!@@        @@!    @@!    @@!       @@!  !@@  @@!  @@@
!@!        !@!    !@!    !@!       !@!  @!!  !@!  @!@
!@! @!@!@  !!@    @!!    @!!!:!     !@@!@!   @!@@!@!
!!! !!@!!  !!!    !!!    !!!!!:      @!!!    !!@!!!
:!!   !!:  !!:    !!:    !!:        !: :!!   !!:
:!:   !::  :!:    :!:    :!:       :!:  !:!  :!:
 ::: ::::   ::     ::     :: ::::   ::  :::   ::
 :: :: :   :       :     : :: ::    :   ::    :

(%%%DIV | font: nancyj-fancy

         oo   dP
              88
.d8888b. dP d8888P .d8888b. dP.  .dP 88d888b.
88'  `88 88   88   88ooood8  `8bd8'  88'  `88
88.  .88 88   88   88.  ...  .d88b.  88.  .88
`8888P88 dP   dP   `88888P' dP'  `dP 88Y888P'
     .88                             88
 d8888P                              dP

(%%%DIV | font: lean

              _/    _/
     _/_/_/      _/_/_/_/    _/_/    _/    _/  _/_/_/
  _/    _/  _/    _/      _/_/_/_/    _/_/    _/    _/
 _/    _/  _/    _/      _/        _/    _/  _/    _/
  _/_/_/  _/      _/_/    _/_/_/  _/    _/  _/_/_/
     _/                                    _/
_/_/                                      _/

(%%%DIV | font: larry3d

          __
       __/\ \__
   __ /\_\ \ ,_\    __   __  _  _____
 /'_ `\/\ \ \ \/  /'__`\/\ \/'\/\ '__`\
/\ \L\ \ \ \ \ \_/\  __/\/>  </\ \ \L\ \
\ \____ \ \_\ \__\ \____\/\_/\_\\ \ ,__/
 \/___L\ \/_/\/__/\/____/\//\/_/ \ \ \/
   /\____/                        \ \_\
   \_/__/                          \/_/

(%%%DIV | font: fender

              ||
        ''    ||
.|''|,  ||  ''||''  .|''|, \\  // '||''|,
||  ||  ||    ||    ||..||   ><    ||  ||
`|..|| .||.   `|..' `|...  //  \\  ||..|'
    ||                             ||
 `..|'                            .||

(%%%DIV | font: graffiti

        .__  __
   ____ |__|/  |_  ____ ___  _________
  / ___\|  \   __\/ __ \\  \/  /\____ \
 / /_/  >  ||  | \  ___/ >    < |  |_> >
 \___  /|__||__|  \___  >__/\_ \|   __/
/_____/               \/      \/|__|

(%%%DIV | font: merlin1

  _______   __  ___________  _______  ___  ___    _______
 /" _   "| |" \("     _   ")/"     "||"  \/"  |  |   __ "\
(: ( \___) ||  |)__/  \\__/(: ______) \   \  /   (. |__) :)
 \/ \      |:  |   \\_ /    \/    |    \\  \/    |:  ____/
 //  \ ___ |.  |   |.  |    // ___)_   /\.  \    (|  /
(:   _(  _|/\  |\  \:  |   (:      "| /  \   \  /|__/ \
 \_______)(__\_|_)  \__|    \_______)|___/\___|(_______)

(%%%DIV | font: bloody

  ▄████  ██▓▄▄▄█████▓▓█████ ▒██   ██▒ ██▓███
 ██▒ ▀█▒▓██▒▓  ██▒ ▓▒▓█   ▀ ▒▒ █ █ ▒░▓██░  ██▒
▒██░▄▄▄░▒██▒▒ ▓██░ ▒░▒███   ░░  █   ░▓██░ ██▓▒
░▓█  ██▓░██░░ ▓██▓ ░ ▒▓█  ▄  ░ █ █ ▒ ▒██▄█▓▒ ▒
░▒▓███▀▒░██░  ▒██▒ ░ ░▒████▒▒██▒ ▒██▒▒██▒ ░  ░
 ░▒   ▒ ░▓    ▒ ░░   ░░ ▒░ ░▒▒ ░ ░▓ ░▒▓▒░ ░  ░
  ░   ░  ▒ ░    ░     ░ ░  ░░░   ░▒ ░░▒ ░
░ ░   ░  ▒ ░  ░         ░    ░    ░  ░░
      ░  ░              ░  ░ ░    ░

(%%%END <https://patorjk.com/software/taag/>
 */
