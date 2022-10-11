const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')
const axios = require('axios')
const rimraf = require('rimraf')

const commentHooks = require('@ff0000-ad-tech/comment-hooks')

const debug = require('@ff0000-ad-tech/debug')
const log = debug('cs-plugin-dps-renderer:assets')

/**
 * Runs the 3-traffic ad
 * In order to receive runtime DPS data/assets
 *
 */
const preflight = async (origin, folder, targets) => {
	// create a headless browser for running targets
	const browser = await puppeteer.launch({
		headless: true // false // to visually test/debug
	})
	// run each target and aggregate event data
	const targetsData = await Object.entries(targets).reduce(async (acc, [target, tpath]) => {
		acc = await acc
		const dest = tpath.replace(new RegExp(`/${folder}/`), '')
		const index = `${dest}index.html`
		// figure key
		acc[dest] = await runTargetForDpsEvents(browser, origin, folder, index, target)
		return acc
	}, Promise.resolve({}))
	// close headless browser
	await browser.close()
	// return dps-data per target
	return targetsData
}

const TIMEOUT = 10
const runTargetForDpsEvents = async (browser, origin, folder, index, target) => {
	return new Promise(async (resolve, reject) => {
		const fi = `${folder}/${index}`
		const testUrl = `${origin}/${fi}`

		// prepare timeout
		let timeout
		const resetTout = () => {
			timeout = TIMEOUT
		}
		const clearTout = () => {
			clearInterval(interval)
		}
		resetTout()
		const interval = setInterval(() => {
			log({ timeout })
			timeout -= 1
			if (timeout < 0) {
				clearTout()
				reject(new Error(`Failed to process DPS events in ${testUrl}`))
			}
		}, 1000)

		// run target
		const page = await browser.newPage()
		// Define a window.onMessageReceivedEvent function on the page.
		const feeds = []
		page.exposeFunction('handleDpsFeed', (feed) => {
			log(`${fi}: DPS Feed received`)
			resetTout()
			feeds.push(feed)
		})
		const imageRequests = []
		page.exposeFunction('handleDpsImageRequest', (imageRequest) => {
			log(`${fi}: DPS Image requested`)
			resetTout()
			imageRequests.push(imageRequest)
		})
		page.exposeFunction('handleDpsPreflightComplete', () => {
			log(`${fi}: DPS Preflight COMPLETE`)
			clearTout()
			resolve({
				target,
				feeds,
				imageRequests
			})
		})
		// add window functions to respond to document events
		page.evaluateOnNewDocument(() => {
			document.addEventListener('dps-feed-loaded', (e) => {
				window.handleDpsFeed(e.detail)
			})
			document.addEventListener('dps-image-requested', (e) => {
				window.handleDpsImageRequest(e.detail)
			})
			document.addEventListener('dps-preflight-complete', (e) => {
				window.handleDpsPreflightComplete(e.detail)
			})
		})
		// listen for page errors
		page.on('error', (err) => {
			clearTout()
			reject(err)
		})
		page.on('pageerror', (err) => {
			clearTout()
			reject(err)
		})
		// load the ad
		await page.goto(testUrl)
	})
}

/**
 * Prepare assets folder to hold
 * size/index specific dps-assets and dps-feeds.
 *
 */
const prepareAssetsFolder = (context, targetsData) => {
	Object.keys(targetsData).forEach((td) => {
		const [profile, size, index] = targetsData[td].target.split('/')
		const assetsFolder = `dps-assets-${path.basename(index, path.extname(index))}`
		const buildSizePath = `${context}/${size}`
		const assetsPath = `${buildSizePath}/${assetsFolder}`
		if (fs.existsSync(assetsPath)) {
			rimraf.sync(assetsPath)
		}
		// make the folder
		ensurePath(assetsPath)
		// mutate targets-data
		targetsData[td] = {
			profile,
			size,
			index,
			buildSizePath,
			assetsFolder,
			imports: [],
			...targetsData[td]
		}
	})
}
const cleanupAssetsFolder = (context, targetsData) => {
	Object.keys(targetsData).forEach((target) => {
		const [profile, size, index] = target.split('/')
		const assetsFolder = `dps-assets-${path.parse(index).name}`
		const buildSizePath = `${context}/${size}`
		const assetsPath = `${buildSizePath}/${assetsFolder}`
		if (fs.existsSync(assetsPath)) {
			rimraf.sync(assetsPath)
		}
	})
}

const ensurePath = (path) => {
	path.split('/').reduce((acc, folder) => {
		const nextPath = `${acc}/${folder}`
		if (!fs.existsSync(nextPath)) {
			fs.mkdirSync(nextPath)
		}
		return nextPath
	}, '/')
}

/**
 * Retrieves the runtime assets from DPS Server
 *
 *
 */
const retrieveImages = async (targetsData) => {
	return Object.entries(targetsData).reduce(async (acc, [target, data]) => {
		acc = await acc
		const imageImports = await Promise.all(
			data.imageRequests.map(async (imageRequest) => {
				const ext = path.extname(imageRequest.src)
				const filename = `${imageRequest.imageId}${ext}`
				const filepath = `${data.buildSizePath}/${data.assetsFolder}/${filename}`
				await downloadFile(imageRequest.src, filepath)
				return filename
			})
		)
		targetsData[target].imports = [...targetsData[target].imports, ...imageImports]
		return acc
	}, Promise.resolve({}))
}
const downloadFile = async (url, destPath) => {
	const res = await axios({
		method: 'get',
		url,
		responseType: 'stream'
	})
	const ws = fs.createWriteStream(destPath)
	res.data.pipe(ws)
	return new Promise((resolve, reject) => {
		ws.on('close', () => {
			resolve()
		})
		ws.on('error', (err) => {
			reject(err)
		})
	})
}

/**
 * Output an index.js with imports for each compile target.
 *
 */
const generateImports = async (targetsData) => {
	Object.values(targetsData).forEach((data) => {
		let index = `import { DpsManager } from '@ff0000-ad-tech/ad-dps'\n\n`
		// add image imports
		data.imports.forEach((filename) => {
			index += `import './${filename}'\n`
		})
		// add feed data
		index += `\n`
		index += `const feeds = JSON.parse('${JSON.stringify(data.feeds)}')\n`
		index += `DpsManager.setInlineFeeds(feeds)\n`
		// save imports file
		const imppath = `${data.buildSizePath}/${data.assetsFolder}/index.js`
		fs.writeFileSync(imppath, index.toString())
		// update build.js
		const hookContent = `import './${data.assetsFolder}'\n`
		writeBuildJsImport(data.buildSizePath, hookContent)
	})
}
const cleanupImports = async (targetsData) => {
	Object.values(targetsData).forEach((data) => {
		writeBuildJsImport(data.buildSizePath, ``)
	})
}

const writeBuildJsImport = (buildSizePath, hookContent) => {
	const buildJsPath = `${buildSizePath}/build.js`
	// load build.js
	let buildJs = fs.readFileSync(buildJsPath, 'utf-8')
	const hook = { scope: 'DPS', type: 'Assets', param: 'import' }
	const hookRegex = commentHooks.getRegexForHook(hook)
	// build new hook + content
	const hookPlusContent = `/*-- DPS.Assets.import.start --*/\n` + `${hookContent}` + `/*-- DPS.Assets.import.end --*/`
	buildJs = buildJs.replace(hookRegex, hookPlusContent)
	// save build.js
	fs.writeFileSync(buildJsPath, buildJs)
}

module.exports = {
	preflight,
	prepareAssetsFolder,
	cleanupAssetsFolder,
	retrieveImages,
	generateImports,
	cleanupImports
}
