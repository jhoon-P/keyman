import { app, net } from 'electron'
import { logger } from '../log/logger'

const POLICY_URL = 'https://raw.githubusercontent.com/jhoon-P/keyman/main/collection-policy.json'

function parseVersion(version: unknown): number[] | null {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){2}$/.test(version)) {
    return null
  }
  const parts = version.split('.').map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}

export async function getPublicCollectionStatus(): Promise<'allowed' | 'unavailable' | 'update-required'> {
  try {
    const url = new URL(POLICY_URL)
    url.searchParams.set('t', String(Date.now()))
    const response = await net.fetch(url.href, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5_000)
    })
    if (!response.ok) {
      logger.info(`Collection policy request failed (HTTP ${response.status})`)
      return 'unavailable'
    }
    const policy = await response.json()
    if (policy?.enabled !== true) return 'unavailable'

    const minimum = parseVersion(policy.minimumSupportedVersion)
    const installed = parseVersion(app.getVersion())
    if (!minimum || !installed) {
      logger.info('Collection policy has a missing or invalid version')
      return 'unavailable'
    }
    const firstDifference = installed.findIndex((part, index) => part !== minimum[index])
    if (firstDifference !== -1 && installed[firstDifference] < minimum[firstDifference]) {
      return 'update-required'
    }
    return 'allowed'
  } catch (err) {
    logger.info(`Collection policy unavailable: ${String(err)}`)
    return 'unavailable'
  }
}
