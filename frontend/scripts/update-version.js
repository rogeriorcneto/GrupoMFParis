#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const versionFile = path.join(__dirname, '../public/version.json')
const packageJson = require('../package.json')

const versionData = {
  version: packageJson.version,
  buildTime: new Date().toISOString()
}

fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2))
console.log('✅ Version file updated:', versionData)
