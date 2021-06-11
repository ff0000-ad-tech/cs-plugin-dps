const axios = require('axios')
const spawn = require('child_process').spawn

const debug = require('@ff0000-ad-tech/debug')
const log = debug('cs-plugin-dps-renderer:compiler')

const execute = async (profile, targets) => {
	log({ profile })
	await Promise.all(
		Object.keys(targets).map(async target => {
			log({ target })
			const apiCmd = `${global.api}/get-wp-cmd/${target}`
			// compile 3-traffic for puppeteer to run
			const res = await axios.get(apiCmd)
			await executeCompileCmd(res.data)
		})
	)
	log('all precompiling complete')
}

const executeCompileCmd = async cmd => {
	const verbose = false
	return new Promise((resolve, reject) => {
		log(` CLI: ${cmd.shell}`)
		let output = ''
		const prc = spawn(cmd.command, cmd.args, { cwd: cmd.cwd })
		prc.stdout.on('data', data => {
			const stdout = data.toString('utf8')
			if (verbose) {
				log(stdout)
			}
			output += stdout
		})
		prc.stderr.on('data', data => {
			const stderr = data.toString('utf8')
			if (verbose) {
				log(stderr)
			}
			output += stderr
		})
		prc.on('error', err => {
			reject(err)
		})
		prc.on('close', code => {
			if (code === 0) {
				log(`   - compile complete`)
				resolve()
			} else {
				const err = new Error(`Compile error:\n${output}`)
				reject(err)
			}
		})
	})
}

module.exports = {
	execute
}
