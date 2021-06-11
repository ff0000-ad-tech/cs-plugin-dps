const argv = require('minimist')(process.argv.slice(2))

const assets = require('./lib/assets.js')
// const packager = require('./lib/packager.js')

const debug = require('@ff0000-ad-tech/debug')
const log = debug('cs-plugin-dps-renderer')

global.api = `http://${argv.api}`

switch (argv.cmd) {
	case 'render':
		const targets = JSON.parse(argv.targets)
		assets.precompile(argv.profile, targets)
		break
}
