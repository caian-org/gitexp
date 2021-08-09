import 'module-alias/register'
import fs from 'fs'
import path from 'path'
import util from 'util'

import chalk from 'chalk'
import clear from 'clear'
import Spinner, { Ora as CLISpinner } from 'ora'
import { SpinnerName } from 'cli-spinners'

import _ from 'lodash'
import Git from 'nodegit'
import { Octokit } from 'octokit'

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

interface IReposStat {
  pub: string[]
  priv: string[]
  users: string[]
  orgs: string[]
}

interface IUserData {
  repositories: IRepository[]
  stats: IReposStat
}

interface IGitCloneSpinner {
  repoCounter: number
  counterPad: number
  repoNamePad: number
  repoTotal: string
  spinner: CLISpinner
}

interface IGitCloneStatus {
  repository: IRepository
  status: Git.Repository
}

type SpinnerBuilder = (text: string) => CLISpinner

const fmt = util.format
const clone = Git.Clone.clone

const getFiglets = async (): Promise<string[]> => {
  const fig: string[] = []

  try {
    let foundStart = false
    const itself = await fs.promises.readFile(__filename)
    const lines = itself.toString().split('\n')

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
        fig.push(line)
      }
    }

    return fig.join('\n').split('(%%%DIV')
  } catch (e) {
    return []
  }
}

const spinner =
  (sn: SpinnerName): SpinnerBuilder =>
    (text: string): CLISpinner => {
      const s = Spinner({ text, spinner: sn, discardStdin: true })
      s.start()
      return s
    }

const cloneLocally = async (g: IGitCloneSpinner, r: IRepository): Promise<IGitCloneStatus> => {
  const s = await clone(r.url, path.join(__dirname, r.name))

  g.repoCounter += 1
  const c = fmt('cloned %s', _.padEnd(r.fullName, g.repoNamePad))
  const p = fmt('%s/%s completed', _.padStart(g.repoCounter.toString(), g.counterPad), g.repoTotal)

  if (!r.isPrivate) {
    g.spinner.text = `${c} | ${p}`
  }

  return { repository: r, status: s }
}

const categorizeRepositories = (repos: IRepository[]): IReposStat => {
  const s: IReposStat = { pub: [], priv: [], users: [], orgs: [] }

  for (const r of repos) {
    s[r.isPrivate ? 'priv' : 'pub'].push(r.fullName)
    s[r.owner.isOrg ? 'orgs' : 'users'].push(r.owner.name)
  }

  return _.mapValues(s, _.uniq)
}

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
  const m = '(%d public; %d private; %d orgs; %d users)'
  lb.text =
    `got ${r.length} repositories ` +
    (r.length > 0 ? fmt(m, s.pub.length, s.priv.length, s.orgs.length, s.users.length) : '')

  lb.succeed()
  return { repositories: r, stats: s }
}

const authenticate = async (sp: SpinnerBuilder): Promise<Octokit> => {
  const lb = sp('authenticating')

  const { GITHUB_AUTH_TOKEN: auth } = process.env
  const octo = new Octokit({ auth })

  const { data: authUser } = await octo.rest.users.getAuthenticated()
  lb.text = `authenticated as @${authUser.login} (${authUser.name ?? ''})`

  lb.succeed()
  return octo
}

const displayBanner = async (): Promise<void> => {
  clear()

  const figlets = await getFiglets()
  const banner = figlets.length > 0 ? _.sample(figlets) : ''

  console.log('\n' + chalk.gray(banner) + '\n')
}

const main = async (): Promise<void> => {
  await displayBanner()
  const sp = spinner('point')

  const octo = await authenticate(sp)
  const { repositories: rps } = await fetchAllRepositories(sp, octo)

  const gcs: IGitCloneSpinner = {
    repoCounter: 0,
    repoTotal: rps.length.toString(),
    counterPad: rps.length.toString().length,
    repoNamePad: rps.map((r) => r.fullName).reduce((a, b) => (a.length > b.length ? a : b)).length,
    spinner: sp('cloning repositories')
  }

  const repoCloneStatus: Array<PromiseSettledResult<IGitCloneStatus>> = []
  for (const chunk of _.chunk(rps, 5)) {
    // eslint-disable-next-line
    const calls = chunk.map((repo) => cloneLocally(gcs, repo))

    const res = await Promise.allSettled(calls)
    res.forEach((i) => repoCloneStatus.push(i))
  }

  const successfullyCloned = repoCloneStatus.filter((r) => r.status === 'fulfilled')
  const erroredCloned = _.xor(repoCloneStatus, successfullyCloned)

  const clonedCount = successfullyCloned.length.toString()
  gcs.spinner.text = fmt('cloned %s/%s', _.padStart(clonedCount, gcs.counterPad), gcs.repoTotal)
  gcs.spinner.succeed()

  console.log(`failed: ${erroredCloned.length}`)
}

main().catch((err) => console.error(err))
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
