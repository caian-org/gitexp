import 'module-alias/register'
import fs from 'fs'
import path from 'path'
import util from 'util'

import chalk from 'chalk'
import clear from 'clear'
import pluralize from 'pluralize'
import fastFolderSize from 'fast-folder-size'
import Spinner, { Ora as CLISpinner } from 'ora'
import { SpinnerName } from 'cli-spinners'

import _ from 'lodash'
import Git from 'nodegit'
import { Octokit } from 'octokit'

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
  spinner: CLISpinner
}

/* ... */
interface IGitCloneStatus {
  repository: IRepository
  status: Git.Repository
}

/* ... */
type SpinnerBuilder = (text: string) => CLISpinner
type CloneStatus = PromiseSettledResult<IGitCloneStatus>

/* ... */
const DEST_DIR = path.join(__dirname, 'gitexp-out')

const fmt = util.format
const clone = Git.Clone.clone
const ffs = util.promisify(fastFolderSize)

const str = (n: Buffer | number): string => n.toString()

/* ... */
const formatBytes = (bytes: number, decimals: number = 2): string => {
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

  try {
    let foundStart = false
    const itself = await fs.promises.readFile(__filename)
    const lines = str(itself).split('\n')

    for (const line of lines) {
      const l = line.trim()
      if (l === '(%%%START') {
        foundStart = true
        continue
      }

      if (l === '(%%%END') {
        break
      }

      if (foundStart) {
        fig.push(' '.repeat(2).concat(line))
      }
    }

    return fig.join('\n').split('(%%%DIV')
  } catch (e) {
    return []
  }
}

/* ... */
const censor = (o: string, n: string): string => {
  const c = '*'
  const r = (t: string): string =>
    t.length < 4
      ? c.repeat(t.length)
      : t.slice(0, 3 - t.length).concat(c.repeat((3 - t.length) * -1))

  return fmt('%s/%s', r(o), r(n))
}

/* ... */
const spinner =
  (sn: SpinnerName): SpinnerBuilder =>
    (text: string): CLISpinner => {
      const s = Spinner({ text, spinner: sn, discardStdin: true })
      s.start()

      return s
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

  g.spinner.text = fmt('%s | %s', c, p.concat(f))
}

const concludeCloneSpinner = async (
  g: IGitCloneSpinner,
  s: CloneStatus[],
  e: CloneStatus[]
): Promise<void> => {
  const destDirSize = await ffs(DEST_DIR)

  const labelBytesDownloaded = fmt('%s downloaded locally', formatBytes(destDirSize ?? 0))
  const labelCloned = fmt('cloned %s/%s', _.padStart(str(s.length), g.counterPad), g.repoTotal)

  if (e.length === 0) {
    g.spinner.succeed(fmt('%s (%s)', labelCloned, labelBytesDownloaded))
  } else {
    const labelClonedWithErrors = fmt('%s failed', e.length)
    g.spinner.fail(fmt('%s (%s; %s)', labelCloned, labelClonedWithErrors, labelBytesDownloaded))
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
const categorizeRepositories = (repos: IRepository[]): IReposStat => {
  const s: IReposStat = { pub: [], priv: [], users: [], orgs: [] }

  for (const r of repos) {
    s[r.isPrivate ? 'priv' : 'pub'].push(r.fullName)
    s[r.owner.isOrg ? 'orgs' : 'users'].push(r.owner.name)
  }

  return _.mapValues(s, _.uniq)
}

/* ... */
const fetchAllRepositories = async (sp: SpinnerBuilder, octo: Octokit): Promise<IUserData> => {
  const lb = sp('fetching repositories')

  const r: IRepository[] = []
  const list = octo.rest.repos.listForAuthenticatedUser

  for (let page = 1; ; page++) {
    const { status, data: repos } = await list({ page, visibility: 'all', per_page: 100 })

    if (status !== 200) {
      throw new Error('fuck')
    }

    if (repos.length === 0) {
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
    pluralize('public', s.pub.length, true),
    pluralize('private', s.priv.length, true),
    pluralize('organization', s.orgs.length, true),
    pluralize('user', s.users.length, true)
  )

  lb.text = fmt(
    'found %s %s',
    pluralize('repository', r.length, true),
    (r.length, r.length > 0 ? m : '')
  )

  lb.succeed()

  return { repositories: r, stats: s }
}

/* ... */
const authenticate = async (sp: SpinnerBuilder): Promise<Octokit> => {
  const lb = sp('authenticating')

  try {
    const octo = new Octokit({ auth: process.env.GITHUB_AUTH_TOKEN })
    const { data: authUser } = await octo.rest.users.getAuthenticated()

    const login = chalk.cyan(fmt('@%s', authUser.login))
    const name = authUser.name !== undefined ? fmt('(%s)', chalk.italic(authUser.name)) : ''
    lb.succeed(fmt('authenticated as %s %s', login, name))

    return octo
  } catch (e) {
    const errorMessage = chalk.bold.red(e.toString())
    lb.fail(errorMessage.concat(' -- is your token valid? did you export it?'))

    throw e
  }
}

/* ... */
const displayBanner = async (): Promise<void> => {
  clear()

  const figlets = await getFiglets()
  const banner = figlets.length > 0 ? _.sample(figlets) : ''

  console.log('\n' + chalk.gray(banner) + '\n')
}

/* ... */
const main = async (): Promise<void> => {
  await displayBanner()
  const sp = spinner('point')

  const octo = await authenticate(sp)
  const { repositories: rps } = await fetchAllRepositories(sp, octo)

  const gcs: IGitCloneSpinner = {
    repoClonedCounter: 0,
    repoFailedCounter: 0,
    repoTotal: str(rps.length),
    counterPad: str(rps.length).length,
    repoNamePad: rps.map((r) => r.fullName).reduce((a, b) => (a.length > b.length ? a : b)).length,
    spinner: sp('cloning repositories')
  }

  const repoCloneStatus: CloneStatus[] = []
  for (const chunk of _.chunk(rps, 5)) {
    // eslint-disable-next-line
    const calls = chunk.map((repo) => cloneLocally(gcs, repo))

    const res = await Promise.allSettled(calls)
    res.forEach((i) => repoCloneStatus.push(i))
  }

  const clonedSuccessfully = repoCloneStatus.filter((r) => r.status === 'fulfilled')
  const clonedWithErrors = _.xor(repoCloneStatus, clonedSuccessfully)

  await concludeCloneSpinner(gcs, clonedSuccessfully, clonedWithErrors)
}

main().catch(() => process.exit(1))

/*
(%%%START
       _ _
  __ _(_) |_ _____  ___ __
 / _` | | __/ _ \ \/ / '_ \
| (_| | | ||  __/>  <| |_) |
 \__, |_|\__\___/_/\_\ .__/
 |___/               |_|
(%%%DIV
        __________
_______ ___(_)_  /_________  _________
__  __ `/_  /_  __/  _ \_  |/_/__  __ \
_  /_/ /_  / / /_ /  __/_>  < __  /_/ /
_\__, / /_/  \__/ \___//_/|_| _  .___/
/____/                        /_/
(%%%DIV
 @@@@@@@  @@@ @@@@@@@ @@@@@@@@ @@@  @@@ @@@@@@@
!@@       @@!   @@!   @@!      @@!  !@@ @@!  @@@
!@! @!@!@ !!@   @!!   @!!!:!    !@@!@!  @!@@!@!
:!!   !!: !!:   !!:   !!:       !: :!!  !!:
 :: :: :  :      :    : :: ::: :::  :::  :
(%%%DIV
         oo   dP
              88
.d8888b. dP d8888P .d8888b. dP.  .dP 88d888b.
88'  `88 88   88   88ooood8  `8bd8'  88'  `88
88.  .88 88   88   88.  ...  .d88b.  88.  .88
`8888P88 dP   dP   `88888P' dP'  `dP 88Y888P'
     .88                             88
 d8888P                              dP
(%%%DIV
              _/    _/
     _/_/_/      _/_/_/_/    _/_/    _/    _/  _/_/_/
  _/    _/  _/    _/      _/_/_/_/    _/_/    _/    _/
 _/    _/  _/    _/      _/        _/    _/  _/    _/
  _/_/_/  _/      _/_/    _/_/_/  _/    _/  _/_/_/
     _/                                    _/
_/_/                                      _/
(%%%DIV
          __
       __/\ \__
   __ /\_\ \ ,_\    __   __  _  _____
 /'_ `\/\ \ \ \/  /'__`\/\ \/'\/\ '__`\
/\ \L\ \ \ \ \ \_/\  __/\/>  </\ \ \L\ \
\ \____ \ \_\ \__\ \____\/\_/\_\\ \ ,__/
 \/___L\ \/_/\/__/\/____/\//\/_/ \ \ \/
   /\____/                        \ \_\
   \_/__/                          \/_/
(%%%DIV
              ||
        ''    ||
.|''|,  ||  ''||''  .|''|, \\  // '||''|,
||  ||  ||    ||    ||..||   ><    ||  ||
`|..|| .||.   `|..' `|...  //  \\  ||..|'
    ||                             ||
 `..|'                            .||
(%%%DIV
        .__  __
   ____ |__|/  |_  ____ ___  _________
  / ___\|  \   __\/ __ \\  \/  /\____ \
 / /_/  >  ||  | \  ___/ >    < |  |_> >
 \___  /|__||__|  \___  >__/\_ \|   __/
/_____/               \/      \/|__|
(%%%END
 */
