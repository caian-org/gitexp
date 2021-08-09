import 'module-alias/register'
import path from 'path'
import util from 'util'

import _ from 'lodash'
import Spinner, { Ora as CLISpinner } from 'ora'
import { SpinnerName } from 'cli-spinners'

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
  const c = fmt('cloned %s', _.padEnd(`"${r.fullName}"`, g.repoNamePad))
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

const main = async (): Promise<void> => {
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
