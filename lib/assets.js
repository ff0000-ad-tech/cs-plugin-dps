const puppeteer = require('puppeteer')

const debug = require('@ff0000-ad-tech/debug')
const log = debug('cs-plugin-dps-renderer:assets')

const preflight = async (origin, folder, targets) => {
	// create a headless browser for running targets
	const browser = await puppeteer.launch({ headless: false })
	// run each target and aggregate event data
	await Promise.all(
		Object.keys(targets).map(async target => {
			await runTargetForDpsEvents(browser, origin, folder, target)
		})
	)
	// close headless browser
	await browser.close()
}

const runTargetForDpsEvents = async (browser, origin, folder, target) => {
	return new Promise(async (resolve, reject) => {
		const testUrl = `${origin}/${folder}/${target}`
		log({ testUrl })
		const page = await browser.newPage()

		// Define a window.onMessageReceivedEvent function on the page.
		await page.exposeFunction('handleDpsFeeds', dpsFeeds => {
			log(`Received DPS_FEEDS data`)
			log(dpsFeeds)
		})
		await page.exposeFunction('handleDpsImageRequest', imageRequest => {
			log(`DPS Image requested`)
			log(imageRequest)
		})
		await page.exposeFunction('handleDpsPreflightComplete', () => {
			log(`DPS Preflight COMPLETE`)
			resolve()
		})

		page.evaluateOnNewDocument(() => {
			document.addEventListener('dps-feeds-loaded', e => {
				window.handleDpsFeeds(e.detail)
			})
			document.addEventListener('dps-image-requested', e => {
				window.handleDpsImageRequest(e.detail)
			})
			document.addEventListener('dps-preflight-complete', e => {
				window.handleDpsPreflightComplete(e.detail)
			})
		})
		await page.goto(testUrl)
	})
}

module.exports = {
	preflight
}
