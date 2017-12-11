const shell = require('shelljs')
const zipFolder = require('zip-folder')

shell.rm('-rf', 'dist')
shell.mkdir('dist')
shell.cp('-R', [ 'cache/', 'proxies/', 'index.js', 'package.json'], 'dist')
shell.cd('dist')
shell.exec('npm install --production --no-optional')
shell.rm('package-lock.json')
shell.rm('package.json')

zipFolder('.', '../lambda.zip', function(err) {
    if(err) 
        console.log(err);
    else {
        shell.cd('..')
        shell.rm('-rf', 'dist')
        console.log('done');
    }
})

