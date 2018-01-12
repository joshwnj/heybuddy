#!/usr/bin/env node

const { exec } = require('child_process')
const chalk = require('chalk')
const chokidar = require('chokidar')
const depcheck = require('dependency-check')
const readline = require('readline')
const inquirer = require('inquirer')

const log = console.log.bind(console)
const monkey = '🐒'

const queue = []
const state = {
  isBusy: false,
  missing: [],
  extras: [],
  ignore: []
}

start(process.cwd())

async function start (dir) {

  const watcher = chokidar.watch(`${dir}/**/*.js`)
  watcher.on('change', handleChange)

  // TODO: first run, check entries. Runs from watcher, check the changed file.
  await doDepCheck()
  if (!queue.length) {
    log('\n' + chalk.magenta(`${monkey}  hey buddy... ready when you are`))
  }

  await checkQueue()

  // ----

  async function handleChange (f) {
    if (state.isBusy) { return }

    await doDepCheck()
    await checkQueue()
  }

  function doDepCheck () {
    return new Promise((resolve, reject) => {
      depcheck({ path: dir }, (err, data) => {
        if (err) { return reject(err) }

        const pkg = data.package
        const deps = data.used

        const extras = filterIgnored(depcheck.extra(pkg, deps))
        const missing = filterIgnored(depcheck.missing(pkg, deps, {}))

        if (missing.length) {
          queue.push(() => handleMissingDeps())
          state.missing = state.missing.concat(missing)
        }

        if (extras.length) {
          queue.push(() => handleExtraDeps())
          state.extras = state.extras.concat(extras)
        }

        resolve()
      })
    })
  }
}

async function checkQueue () {
  if (state.isBusy) { return  }

  const f = queue.shift()
  if (!f) { return }

  log('\n' + chalk.magenta(`${monkey}  hey buddy... `))
  state.isBusy = true
  await f()
  state.isBusy = false
  process.nextTick(checkQueue)
}

function filterIgnored (deps) {
  const { ignore } = state
  return deps.filter(d => !ignore.includes(d))
}

function handleMissingDeps () {
  const deps = filterIgnored(state.missing)
  if (!deps.length) { return }
  state.missing = []

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
      if (answers.addMissingDeps !== 'yes') {
        // TODO: handle permanent ignore
        state.ignore = state.ignore.concat(deps)
        log(chalk.green('ok'))
        return resolve()
      }

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

function handleExtraDeps () {
  const deps = filterIgnored(state.extras)
  if (!deps.length) { return }
  state.extras = []

  log('\n' + chalk.cyan(`i found some deps in your package.json that aren't used anywhere:`))
  log(chalk.cyan(deps.map(name => `- ${name}`).join('\n')) + '\n')

  return new Promise((resolve, reject) => {
    inquirer.prompt([
      {
        type: 'list',
        name: 'removeExtras',
        message: 'want me to remove them from your package.json?',
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
      if (answers.removeExtras !== 'yes') {
        // TODO: handle permanent ignore
        state.ignore = state.ignore.concat(deps)
        log(chalk.green('ok'))
        return resolve()
      }

      log(chalk.green('uninstalling...'))
      uninstallDeps(deps, (err) => {
        if (err) {
          log(chalk.red('Failed uninstalling deps...'))
          return reject()
        }

        log(chalk.green('ok'))
        resolve()
      })
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

function uninstallDeps (deps, cb) {
  exec(`npm uninstall --loglevel silent ${deps.join(' ')}`, (err, stdout, stderr) => {
    if (err || stderr) {
      return cb(err || stderr)
    }

    return cb()
  })
}
