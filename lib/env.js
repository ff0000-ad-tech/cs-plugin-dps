const debug = require('@ff0000-ad-tech/debug')
const log = debug('cs-plugin-dps-renderer:env')

/**
 * Set wp-cmd deploy-profile id to 'inlined'.
 *
 * flags ad to use inline assets, for more info, see: @ff0000-ad-tech/ad-dps
 *
 */
const setInlined = wpCmd => {
	const wpEnv = getWpEnv(wpCmd)
	wpEnv.deploy.profile.env.id = 'dps-inlined'
	return setWpEnv(wpCmd, wpEnv)
}
const setLocal = wpCmd => {
	const wpEnv = getWpEnv(wpCmd)
	wpEnv.deploy.profile.env.id = 'dps-local'
	return setWpEnv(wpCmd, wpEnv)
}

// process creative-server's Webpack Command argument
const getWpEnv = wpCmd => {
	const envIndex = wpCmd.args.findIndex(arg => arg === '--env')
	return JSON.parse(wpCmd.args[envIndex + 1])
}

const setWpEnv = (wpCmd, wpEnv) => {
	for (let i = 0; i < wpCmd.args.length; i++) {
		if (wpCmd.args[i] === '--env') {
			wpCmd.args[i + 1] = JSON.stringify(wpEnv)
			break
		}
	}
	return wpCmd
}

module.exports = {
	setInlined,
	setLocal
}
