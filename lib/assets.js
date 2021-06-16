const puppeteer = require('puppeteer')

const debug = require('@ff0000-ad-tech/debug')
const log = debug('cs-plugin-dps-renderer:assets')

/**
 * Runs the 3-traffic ad
 * In order to receive runtime DPS data/assets
 *
 */
const preflight = async (origin, folder, targets) => {
	// create a headless browser for running targets
	const browser = await puppeteer.launch({ headless: false })
	// run each target and aggregate event data
	const targetsData = await Object.keys(targets).reduce(async (acc, target) => {
		acc = await acc
		acc[target] = await runTargetForDpsEvents(browser, origin, folder, target)
		return acc
	}, Promise.resolve({}))
	// close headless browser
	await browser.close()
	// return dps-data per target
	return targetsData
}

const runTargetForDpsEvents = async (browser, origin, folder, target) => {
	return new Promise(async (resolve, reject) => {
		const testUrl = `${origin}/${folder}/${target}`
		log({ testUrl })
		const page = await browser.newPage()
		// Define a window.onMessageReceivedEvent function on the page.
		const feeds = []
		await page.exposeFunction('handleDpsFeed', feed => {
			log(`DPS Feed received`)
			feeds.push(feed)
		})
		const imageRequests = []
		await page.exposeFunction('handleDpsImageRequest', imageRequest => {
			log(`DPS Image requested`)
			imageRequests.push(imageRequest)
		})
		await page.exposeFunction('handleDpsPreflightComplete', () => {
			log(`DPS Preflight COMPLETE`)
			resolve({
				feeds,
				imageRequests
			})
		})
		// add window functions to respond to document events
		page.evaluateOnNewDocument(() => {
			document.addEventListener('dps-feed-loaded', e => {
				window.handleDpsFeed(e.detail)
			})
			document.addEventListener('dps-image-requested', e => {
				window.handleDpsImageRequest(e.detail)
			})
			document.addEventListener('dps-preflight-complete', e => {
				window.handleDpsPreflightComplete(e.detail)
			})
		})
		// load the ad
		await page.goto(testUrl)
	})
}

/**
 * Retrieves the runtime assets from DPS Server
 *
 *
 */
const retrieve = async (context, targetsData) => {
	// await Promise.all(
	// 	Object.values
	// )
}

module.exports = {
	preflight
}
