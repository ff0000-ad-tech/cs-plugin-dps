const argv = require('minimist')(process.argv.slice(2))

const compiler = require('./lib/compiler.js')
const assets = require('./lib/assets.js')
const utils = require('./lib/utils.js')

const debug = require('@ff0000-ad-tech/debug')
const log = debug('cs-plugin-dps-renderer')

global.api = argv.api

log({ argv })
const FOLDERS = JSON.parse(argv.folders)

switch (argv.cmd) {
	case 'render':
		const targets = JSON.parse(argv.targets)
		;(async () => {
			const context = `${argv.context}/${FOLDERS.build}`
			// ensure that 3-traffic versions have been compiled
			await compiler.execute(targets, { inlined: false })
			// run ads in puppeteer to discover dynamic dps assets
			const targetsData = await assets.preflight(argv.origin, FOLDERS.traffic, targets)
			// mutate targetsData with assets-folder, per target
			assets.prepareAssetsFolder(context, targetsData)
			log({ targetsData })
			// retrieve dps assets
			await assets.retrieveImages(targetsData)
			// stack targets by version (because only one variation-per-size can be compiled at a time)
			const { vtargets, versions } = utils.stackTargets(targets, targetsData)
			for (let i = 0; i < versions.length; i++) {
				// generate js imports script
				assets.generateImports(versions[i])
				// recompile 3-traffic versions with inlined assets
				await compiler.execute(vtargets[i], { inlined: true })
				// remove build.js imports, so debug/traffic/dps-local compiles still work
				assets.cleanupImports(versions[i])
				// remove assets
				assets.cleanupAssetsFolder(context, versions[i])
			}
		})().catch((err) => {
			log(err.message)
			process.stderr.write(err.message)
			process.exit(1)
		})
		break
}
