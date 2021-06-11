const puppeteer = require('puppeteer')

const debug = require('@ff0000-ad-tech/debug')
const log = debug('cs-plugin-dps-renderer:assets')

const precompile = async (profile, targets) => {
	log({ profile })
	await Promise.all(
		Object.keys(targets).map(async target => {
			log({ target })
			const apiCmd = `${global.api}/get-wp-cmd/${target}`
			log(apiCmd)
			// axios.get(apiCmd)
		})
	)
}

module.exports = {
	precompile
}
