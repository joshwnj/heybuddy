#!/usr/bin/env node

const { exec } = require('child_process')
const chalk = require('chalk')
const chokidar = require('chokidar')
const depcheck = require('dependency-check')
const readline = require('readline')
const inquirer = require('inquirer')

const log = console.log.bind(console)
const queue = []

start(process.cwd())

async function start (dir) {

  const watcher = chokidar.watch(`${dir}/**/*.js`)
  watcher.on('change', handleChange)

  await doDepCheck()
  await checkQueue()
  
  // ----

  async function handleChange (f) {
    await doDepCheck()
    await checkQueue()
  }

  function doDepCheck () {
    return new Promise((resolve, reject) => {
      depcheck({ path: dir }, (err, data) => {
        if (err) { return reject(err) }

        const pkg = data.package
        const deps = data.used
        
        const extras = depcheck.extra(pkg, deps)
        const missing = depcheck.missing(pkg, deps, {})
        
        if (missing.length) {
          queue.push(() => handleMissingDeps(missing))
        }
        
        if (extras.length) {
          queue.push(() => handleExtraDeps(extras))
        }
        
        resolve()
      })
    })
  }
}

function welcomeMessage () {
  return 'keep up the great work'
}

async function checkQueue () {
  const f = queue.shift()
  if (f) {
    log('\n' + chalk.magenta('🐒  hey buddy...    '))
    await f()
    process.nextTick(checkQueue)
  }
}

function handleMissingDeps (deps) {
  log('\n' + chalk.cyan('i found some deps missing from your package.json:'))
  log(chalk.cyan(deps.map(name => `- ${name}`).join('\n')) + '\n')

  return new Promise((resolve, reject) => {
    inquirer.prompt([
      {
        type: 'list',
        name: 'addMissingDeps',
        message: 'want me to add them 4 u?',
        choices: [
          {
            key: 'y',
            name: 'yes please',
            value: 'yes'
          },
          {
            key: 'l',
            name: 'not this time, ask me again later',
            value: 'later'
          },
          {
            key: 'n',
            name: 'no',
            value: 'no'
          }
        ]
      }
    ]).then(answers => {
      if (answers.addMissingDeps !== 'yes') { return resolve() }
      
      log(chalk.green('installing...'))
      installDeps(deps, '-S', (err) => {
        if (err) { 
          log(chalk.red('Failed installing deps...')) 
          return reject()
        }
        
        log(chalk.green('ok'))
        resolve()
      })
    })
  })
}

function handleExtraDeps (deps) {
  log('\n' + chalk.cyan(`i found some deps in your package.json that aren't used anywhere:`))
  log(chalk.cyan(deps.map(name => `- ${name}`).join('\n')) + '\n')

  return new Promise((resolve, reject) => {
    inquirer.prompt([
      {
        type: 'list',
        name: 'removeExtras',
        message: 'want me to update your package.json?',
        choices: [
          {
            key: 'y',
            name: 'yes please',
            value: 'yes'
          },
          {
            key: 'l',
            name: 'not this time, ask me again later',
            value: 'later'
          },
          {
            key: 'n',
            name: 'no',
            value: 'no'
          }
        ]
      }
    ]).then(answers => {
      
      if (answers.removeExtras === 'yes') {
        log(chalk.green('TBI...'))
      }

      resolve()
    })
  })
}

function installDeps (deps, saveFlag, cb) {
  exec(`npm install ${saveFlag} --loglevel silent ${deps.join(' ')}`, (err, stdout, stderr) => {
    if (err || stderr) {
      return cb(err || stderr)
    }

    return cb()
  })
}
