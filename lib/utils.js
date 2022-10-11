const debug = require('@ff0000-ad-tech/debug')
const log = debug('cs-plugin-dps-renderer:utils')

const stackTargets = (targets, targetsData) => {
  const versions = Object.entries(targetsData).reduce((acc, [target, data]) => {
    let handled = false
    for (let v = 0; v < acc.length; v++) {
      const hasSize = Object.values(acc[v]).find(vdata => vdata.size === data.size)
      if (!hasSize) {
        acc[v][target] = data
        handled = true
        break
      }
    }
    if (!handled) {
      acc.push({ [target]: data })
    }
    return acc
  }, [])
  const vtargets = versions.map(version => {
    return Object.values(version).reduce((acc, val) => {
      acc[val.target] = targets[val.target]
      return acc
    }, {})
  })
  return { vtargets, versions }
}

module.exports = {
  stackTargets
}