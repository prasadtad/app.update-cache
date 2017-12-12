const shell = require('shelljs')
const fs = require('fs')
const archiver = require('archiver')

shell.rm('-rf', 'dist')
shell.mkdir('dist')
shell.cp('-R', [ 'cache/', 'proxies/', 'index.js', 'package.json'], 'dist')
shell.cd('dist')
shell.exec('npm install --production --no-optional')
shell.rm('package-lock.json')
shell.rm('package.json')
shell.cd('..')

const output = fs.createWriteStream('index.zip') 
const archive = archiver('zip')

output.on('close', () => {    
    shell.rm('-rf', 'dist')
    console.log('done')
})

archive.pipe(output)

archive.directory('dist/', false)
    .finalize()

