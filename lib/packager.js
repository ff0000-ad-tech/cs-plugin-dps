const fs = require('fs-extra')
const path = require('path')
const walk = require('walk')
const JSZIP = require('jszip')
const debug = require('@ff0000-ad-tech/debug')
let log = debug('cs-plugin-vendor-c20:packager')

/*
MONET:
- container_source > 
	- 1-build
		- size, package.json, package-lock.json, common/
	- package.json, 
	- package-lock.json, 
	- webpack.config.js, 
	- plugins.json, 
	- .eslintrc 
	- assembly.json (only for C2.0 Builder Containers)
- traffic_source >
	3-traffic (size) <- 300x250, 
*/

const fileWhiteList = [
	'.eslintrc',
	'package.json',
	'package-lock.json',
	'plugins.json',
	'webpack.config.js',
	'assembly.json',
	'1-build/package.json',
	'1-build/package-lock.json'
]
const dirWhiteList = ['common']
const excludedFiles = ['.gitignore', '.DS_Store', '*.txt']

function createVendorPackage(profileName, targets) {
	log('createVendorPackage()')
	return new Promise((resolve, reject) => {
		// make the top level directory
		const dir = './4-vendor/' + profileName + '/'
		fs.emptyDirSync(dir)

		// top level for each [size] folder
		let masterPromises = []

		Object.keys(targets).forEach(target => {
			// extract the [size] folder name
			const filePath = '.' + targets[target]
			const filePathSplit = filePath.split(path.sep)
			filePathSplit.pop()
			const folderName = filePathSplit.pop()
			// add the [size] folder to the white list
			dirWhiteList.push(folderName)

			log('  folderName:', folderName)
			log('      target:', target)
			log('    filePath:', filePath)

			// Folders by [size]
			const dirSize = dir + folderName + '/'
			log('     dirSize:', dirSize)

			fs.emptyDirSync(dirSize)

			// traffic_source/
			log(folderName, 'create traffic_source')
			let zipTraffic = new JSZIP()
			// add to the master promise array
			masterPromises.push(
				// copy the entire directory
				copyDirectory(zipTraffic, filePath, filterExcludedFile, 'traffic_source/').then(() => {
					// return the promise of the zip save
					return save(zipTraffic, dirSize, 'traffic_source')
				})
			)

			// container_source/
			log(folderName, 'create container_source')
			let zipContainer = new JSZIP()

			// make a collection of promises for all container_source includes
			let containerPromises = [
				// common/
				copyDirectory(zipContainer, './1-build/common/', filterExcludedFile),
				// [size]/
				copyDirectory(zipContainer, './1-build/' + folderName + '/', filterExcludedFile),
				// [uuids]/
				copyDirectory(zipContainer, './1-build/node_modules/@netflixadseng/', filterNotUuidFile)
			]
			// iterate though the white list of specific files to include
			for (let key of fileWhiteList) {
				containerPromises.push(
					new Promise((resolve, reject) =>
						fs.readFile(key, (err, data) => {
							// skip any nonexistent files and continue
							if (err && err.code === 'ENOENT') {
								return resolve(data)
							}
							// log(key, data && data.length)
							zipContainer.file(key, data)
							return err ? reject(err) : resolve(data)
						})
					)
				)
			}

			// add to the master the result of the save of container_source.zip
			masterPromises.push(
				Promise.all(containerPromises).then(() => {
					return save(zipContainer, dirSize, 'container_source')
				})
			)
		})

		Promise.all(masterPromises).then(() => {
			log('ALL SIZE ZIPS CREATED')
			resolve()
		})
	})
}

function copyDirectory(zip, dirBase, filter, copyDestination) {
	return new Promise((resolve, reject) => {
		walk
			.walk(dirBase)
			.on('file', (root, stat, next) => {
				if (filter.call(this, stat.name)) {
					// skip the excluded files
					next()
				} else {
					fs.readFile(root + '/' + stat.name, (err, data) => {
						// remove the base file path to get just the directores to copy over
						let baseFolder = '.' + String(root).substr(dirBase.length) + '/'
						//log('file:', stat.name, '| root:', root, '| baseFolder:', baseFolder)

						// write the file into the zip
						// ternary decides if including the entire pathing or just relative file paths
						// console.log('copyDestination:', copyDestination)
						zip.file((copyDestination || dirBase) + baseFolder + stat.name, data)
						next()
					})
				}
			})
			.on('errors', (entry, stat) => {
				log('walking error:', entry)
				reject()
			})
			.on('end', () => {
				// log('walk.end')
				resolve()
			})
	})
}

function filterExcludedFile(filename) {
	for (let str of excludedFiles) {
		if (str.indexOf('*') == 0) {
			// means to check all file types
			const fileExt = filename.split('.')[1]
			const exclExt = str.split('.')[1]
			if (fileExt == exclExt) return true
		} else {
			// just do straight compare
			if (str == filename) return true
		}
	}
	return false
}

function filterNotUuidFile(filename) {
	return filename.match(/[^\-]{8}\-[^\-]{4}\-[^\-]{4}\-[^\-]{4}\-[^\-]{12}/) ? false : true
}

function save(zip, path, name) {
	return new Promise((resolve, reject) => {
		zip
			.generateNodeStream({
				type: 'nodebuffer',
				streamFiles: true
			})
			.pipe(fs.createWriteStream(path + name + '.zip'))
			.on('finish', () => {
				log(path + name, 'save() successful')
				resolve()
			})
	})
}

module.exports = {
	createVendorPackage
}
