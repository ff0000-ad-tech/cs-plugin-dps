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
 * Prepare assets folder to hold
 * size/index specific dps-assets and dps-feeds.
 *
 */
const prepareAssetsFolder = (context, targetsData) => {
	Object.keys(targetsData).forEach(target => {
		const [profile, size, index] = target.split('/')
		const assetsFolder = `dps-assets-${path.basename(index, path.extname(index))}`
		const buildSizePath = `${context}/${size}`
		const assetsPath = `${buildSizePath}/${assetsFolder}`
		if (fs.existsSync(assetsPath)) {
			// may already exist, so empty it,
			// except for index.js, which is needed to not break the es6 import in build.js
			rimraf.sync(`${assetsPath}/!(index.js)`)
		} else {
			// otherwise make the folder
			ensurePath(assetsPath)
		}
		// mutate targets-data
		targetsData[target] = {
			profile,
			size,
			index,
			buildSizePath,
			assetsFolder,
			imports: [],
			...targetsData[target]
		}
	})
}
const ensurePath = path => {
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
const retrieveImages = async targetsData => {
	return await Object.entries(targetsData).reduce(async (acc, [target, data]) => {
		acc = await acc
		const imageImports = await Promise.all(
			data.imageRequests.map(async imageRequest => {
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
	res.data.pipe(fs.createWriteStream(destPath))
	return new Promise((resolve, reject) => {
		res.data.on('end', () => {
			resolve()
		})
		res.data.on('error', () => {
			reject()
		})
	})
}

/**
 * Output an index.js with imports for each compile target.
 *
 */
const generateImports = async targetsData => {
	Object.values(targetsData).forEach(data => {
		let index = `import { DpsManager } from '@ff0000-ad-tech/ad-dps'\n\n`
		// add image imports
		data.imports.forEach(filename => {
			index += `import './${filename}'\n`
		})
		// add feed data
		index += `\n`
		index += `const feeds = JSON.parse('${JSON.stringify(data.feeds)}')\n`
		index += `DpsManager.setInlineFeeds(feeds)\n`
		// save imports file
		fs.writeFileSync(`${data.buildSizePath}/${data.assetsFolder}/index.js`, index.toString())
		// update build.js
		setBuildJsImport(data.buildSizePath, data.assetsFolder)
	})
}
const setBuildJsImport = (buildSizePath, assetsFolder) => {
	const buildJsPath = `${buildSizePath}/build.js`
	// load build.js
	let buildJs = fs.readFileSync(buildJsPath, 'utf-8')
	const hook = { scope: 'DPS', type: 'Assets', param: 'import' }
	const hookRegex = commentHooks.getRegexForHook(hook)
	// build new hook + content
	const hookPlusContent = `/*-- DPS.Assets.import.start --*/\n` + `import './${assetsFolder}'\n` + `/*-- DPS.Assets.import.end --*/`
	buildJs = buildJs.replace(hookRegex, hookPlusContent)
	// save build.js
	fs.writeFileSync(buildJsPath, buildJs)
}

module.exports = {
	preflight,
	prepareAssetsFolder,
	retrieveImages,
	generateImports
}
