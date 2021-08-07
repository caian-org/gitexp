import 'module-alias/register'
import Logger from '@ge/lib/Logger'

const logger = new Logger({ isDev: true, label: 'ge' })

logger.info('hello world')
