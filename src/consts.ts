import { isDef } from './primitive'

/* adapted from <https://github.com/watson/ci-info> */
export const IS_RUNNING_ON_CI_ENV =
  // Travis CI, CircleCI, Cirrus CI, Gitlab CI, Appveyor, CodeShip, dsari
  isDef('CI') ||
  // Travis CI, Cirrus CI
  isDef('CONTINUOUS_INTEGRATION') ||
  // Jenkins, TeamCity
  isDef('BUILD_NUMBER') ||
  // TaskCluster, dsari
  isDef('RUN_ID') ||
  // Else...
  false
