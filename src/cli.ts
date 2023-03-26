import { Command, Option, OptionValues } from 'commander'

import { len } from './primitive'
import { IS_RUNNING_ON_CI_ENV } from './consts'
import { RepoOwnerType, RepoVisibility } from './types'

const commaList = (value: string, _: any): string[] =>
  value
    .split(',')
    .map((i) => i.trim())
    .filter((i) => len(i) > 1)

export const parseCommandLineArgs = (args: string[]): OptionValues => {
  const owner = new Option('-t, --owner-type <type>', 'filter by owner type')
  const visibility = new Option('-b, --visibility <level>', 'filter by repository visibility')
  const items = (o: object): string[] => Object.values(o).filter((v) => v !== 'all')

  let cmd = new Command().version('1.0.0', '-v, --version')

  /* interactive prompt must not be available on certain situations */
  if (!IS_RUNNING_ON_CI_ENV) {
    cmd = cmd.option('-i, --interactive', 'set the running options interactively')
  }

  return cmd
    .option('-s, --summary', 'display a summary of repositories, languages, orgs etc')
    .option('-l, --languages <langs>', 'filter by project language (comma separated)', commaList)
    .option('-f, --only-from <name>', 'filter by owner name (comma separated)', commaList)
    .addOption(owner.choices(items(RepoOwnerType)))
    .addOption(visibility.choices(items(RepoVisibility)))
    .parse(args)
    .opts()
}
