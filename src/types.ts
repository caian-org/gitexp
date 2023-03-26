import { Octokit } from '@octokit/rest'

export interface ISpinny {
  ref: Spinny
  succeed: (t: string) => void
  fail: (t: string) => void
}

export interface IOccurence {
  name: string
  count: number
}

export interface IGitHubStats {
  repos: {
    pub: string[]
    priv: string[]
  }
  users: IOccurence[]
  orgs: IOccurence[]
  langs: IOccurence[]
}

export enum RepoVisibility {
  ALL = 'all',
  PUBLIC = 'public',
  PRIVATE = 'private'
}

export enum RepoOwnerType {
  ALL = 'all',
  USER = 'user',
  ORG = 'org'
}

export interface IHash<T = any> {
  [key: string]: T
}

export interface IRepository {
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

export interface IGitHubAuthData {
  client: Octokit
  authToken: string
  authUserData: {
    login: string
    name: string
  }
}

export interface IUserRepositories {
  repositories: IRepository[]
  stats: IGitHubStats
}

export interface IGitCloneSpinner {
  repoClonedCounter: number
  repoFailedCounter: number
  counterPad: number
  repoNamePad: number
  repoTotal: string
  spinner: ISpinny
}

export interface IWorkingTimer {
  spinner: ISpinny
  elapsed: number
}

export interface ICloneFilters {
  visibility: RepoVisibility
  ownerType: RepoOwnerType
  onlyFrom: string[] | null
  languages: string[] | null
}

export interface ITabulateOptions {
  maxColsToDisplay: number
  hideRank: boolean
  hideOccurences: boolean
}

export type Spinny = Spinnies.SpinnerOptions

export type CloneStatus = PromiseSettledResult<IRepository>

export type SpinnyOptions = Spinnies.Options

export type SpinnyBuilder = (n: string, t: string) => ISpinny
