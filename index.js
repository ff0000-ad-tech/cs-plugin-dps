const argv = require('minimist')(process.argv.slice(2))

const compiler = require('./lib/compiler.js')
const assets = require('./lib/assets.js')

const debug = require('@ff0000-ad-tech/debug')
const log = debug('cs-plugin-dps-renderer')

global.api = argv.api

log({ argv })
const FOLDERS = JSON.parse(argv.folders)

switch (argv.cmd) {
	case 'render':
		const targets = JSON.parse(argv.targets)
			; (async () => {
				// ensure that 3-traffic versions have been compiled
				// await compiler.execute(argv.profile, targets)
				// run ads in puppeteer to discover dynamic dps assets
				const targetsData = await assets.preflight(argv.origin, FOLDERS.traffic, targets)
				// mutate targetsData with assets-folder, per target
				assets.prepareAssetsFolder(`${argv.context}/${FOLDERS.build}`, targetsData)
				// retrieve dps assets
				await assets.retrieveImages(targetsData)
				log({ targetsData })
				// generate js imports script
				assets.generateImports(targetsData)
			})()
		break
}
