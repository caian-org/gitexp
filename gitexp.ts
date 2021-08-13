/* standard lib */
import fs from 'fs'
import path from 'path'
import util from 'util'

/* core features */
import _ from 'lodash'
import Git from 'nodegit'
import archiver from 'archiver'
import fastFolderSize from 'fast-folder-size'
import { Octokit } from 'octokit'
import { differenceInSeconds, secondsToMinutes, secondsToHours } from 'date-fns'

/* aesthetic stuff */
import chalk from 'chalk'
import clear from 'clear'
import plural from 'pluralize'
import Spinnies from 'spinnies'
import cliSpinner, { Spinner as SpinnerType } from 'cli-spinners'

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

/* ... */
interface IReposStat {
  pub: string[]
  priv: string[]
  users: string[]
  orgs: string[]
}

/* ... */
interface IUserData {
  repositories: IRepository[]
  stats: IReposStat
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
interface IGitCloneStatus {
  repository: IRepository
  status: Git.Repository
}

/* ... */
interface IWorkingTimer {
  spinner: ISpinny
  elapsed: number
}

/* ... */
type CloneStatus = PromiseSettledResult<IGitCloneStatus>
type Spinny = Spinnies.SpinnerOptions
type SpinnyBuilder = (n: string, t: string) => ISpinny

/* ... */
const DEST_DIR = path.join(__dirname, 'gitexp-out')

const fmt = util.format
const clone = Git.Clone.clone
const ffs = util.promisify(fastFolderSize)

const str = (n: Buffer | number): string => n.toString()
const len = (a: any[] | string): number => a.length

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
const getFiglets = async (): Promise<string[]> => {
  const fig: string[] = []

  const t = (n: string): string => '(%%%' + n.toUpperCase()
  const tag = {
    start: t('start'),
    end: t('end'),
    div: t('div')
  }

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
const censor = (o: string, n: string): string => {
  const c = '*'
  const r = (t: string): string =>
    len(t) < 4 ? c.repeat(len(t)) : t.slice(0, 3 - len(t)).concat(c.repeat((3 - len(t)) * -1))

  return fmt('%s/%s', r(o), r(n))
}

/* ... */
const spinnyBuilder = (spinner: SpinnerType): SpinnyBuilder => {
  const spinnies = new Spinnies({
    spinner,
    succeedPrefix: '✔',
    succeedColor: 'white',
    failColor: 'white',
    color: 'white',
    spinnerColor: 'blueBright'
  })

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
const cloneLocally = async (g: IGitCloneSpinner, r: IRepository): Promise<IGitCloneStatus> => {
  const d = path.join(DEST_DIR, r.owner.name)

  try {
    const s = await clone(r.url, path.join(d, r.name))
    updateCloneSpinner(g, r, false)

    return { repository: r, status: s }
  } catch (e) {
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
const categorizeRepositories = (repos: IRepository[]): IReposStat => {
  const s: IReposStat = { pub: [], priv: [], users: [], orgs: [] }

  for (const r of repos) {
    s[r.isPrivate ? 'priv' : 'pub'].push(r.fullName)
    s[r.owner.isOrg ? 'orgs' : 'users'].push(r.owner.name)
  }

  return _.mapValues(s, _.uniq)
}

/* ... */
const fetchAllRepositories = async (sb: SpinnyBuilder, octo: Octokit): Promise<IUserData> => {
  const sp = sb('fetchAllRepositories', 'fetching repositories')

  const r: IRepository[] = []
  const list = octo.rest.repos.listForAuthenticatedUser

  for (let page = 1; ; page++) {
    const { status, data: repos } = await list({ page, visibility: 'all', per_page: 100 })

    if (status !== 200) {
      throw new Error('fuck')
    }

    if (len(repos) === 0) {
      break
    }

    for (const repo of repos) {
      r.push({
        name: repo.name,
        fullName: repo.full_name,
        url: repo.clone_url,
        isPrivate: repo.private,
        lang: repo.language ?? 'NONE',
        owner: {
          name: _.first(repo.full_name.split('/'))!,
          isOrg: repo.owner?.type.toLowerCase() === 'organization'
        }
      })
    }
  }

  const s = categorizeRepositories(r)
  const m = fmt(
    '(%s; %s; %s; %s)',
    plural('public', len(s.pub), true),
    plural('private', len(s.priv), true),
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
    sp.fail(errorMessage.concat(' -- is your token valid? did you export it?'))

    throw e
  }
}

/* ... */
const tickTimer = (wt: IWorkingTimer): void => {
  wt.elapsed += 50
  wt.spinner.ref.text = fmt('working... %s seconds elapsed', (wt.elapsed / 1000).toFixed(2))
}

/* ... */
const getElapsedTimeFormatted = (start: Date): string => {
  const end = new Date()
  const elapsedTime = differenceInSeconds(end, start)

  const q = (x: number, v: string): { value: number, ext: string } => ({
    value: x,
    ext: plural(v, x, true)
  })

  const t = [
    q(elapsedTime, 'second'),
    q(secondsToMinutes(elapsedTime), 'minute'),
    q(secondsToHours(elapsedTime), 'hour')
  ]

  const segs = t.map((i) => Number(i.value > 0)).reduce((a, b) => a + b)
  const template = (() => {
    switch (segs) {
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
const displayBanner = async (): Promise<void> => {
  clear()

  const figlets = await getFiglets()
  const banner = len(figlets) > 0 ? _.sample(figlets) : ''

  console.log(fmt('\n%s\n', chalk.gray(banner)))
}

/* ... */
const main = async (): Promise<void> => {
  await displayBanner()

  const startTS = new Date()
  const sb = spinnyBuilder(cliSpinner.point)

  const wt: IWorkingTimer = { spinner: sb('main', 'working...'), elapsed: 0 }
  const gewt = setInterval(tickTimer, 50, wt)

  const octo = await authenticate(sb)
  const { repositories: rps } = await fetchAllRepositories(sb, octo)

  const gcs: IGitCloneSpinner = {
    repoClonedCounter: 0,
    repoFailedCounter: 0,
    repoTotal: str(len(rps)),
    counterPad: len(str(len(rps))),
    repoNamePad: len(rps.map((r) => r.fullName).reduce((a, b) => (len(a) > len(b) ? a : b))),
    spinner: sb('cloning', 'cloning repositories')
  }

  const repoCloneStatus: CloneStatus[] = []
  for (const chunk of _.chunk(rps, 10)) {
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

main().catch(() => process.exit(1))

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
