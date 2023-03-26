import _ from 'lodash'
import chalk from 'chalk'
import Spinnies from 'spinnies'
import { Spinner as SpinnerType } from 'cli-spinners'
import { format as fmtDatetime } from 'date-fns'

import { fmt } from './format'
import { Spinny, SpinnyBuilder, SpinnyOptions } from './types'

export default (spinner: SpinnerType, suppress: boolean = false): SpinnyBuilder => {
  const c = { spinnerColor: 'blueBright', succeedColor: 'white', failColor: 'white' }

  if (!suppress) {
    const spinnies = new Spinnies(_.merge(c, { spinner, succeedPrefix: '✔', color: 'white' }) as unknown as SpinnyOptions)

    return (name, text) => {
      const ref = spinnies.add(name, { text })

      return {
        ref,
        succeed: (t: string) => spinnies.succeed(name, { text: t }),
        fail: (t: string) => spinnies.fail(name, { text: t })
      }
    }
  }

  return (__: string, t: string) => {
    const ref = _.merge(c, { text: '', indent: 0, status: 'stopped' }) as unknown as Spinny

    const fn = (m: string): void =>
      console.log(
        fmt('%s %s %s %s', chalk.gray('>>>'), chalk.blueBright(fmtDatetime(new Date(), 'yyyy-MM-dd HH:mm:ss'))),
        chalk.gray('|'),
        chalk.bold(m)
      )

    fn(t)
    return { ref, succeed: fn, fail: fn }
  }
}
