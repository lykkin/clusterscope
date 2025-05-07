const express = require('express')
const fs = require('fs/promises')

const {enforced, rulePatterns} = require('./rules.json')

const rulePatternList = Object.keys(rulePatterns).map(message => {
  return [new RegExp(escapeRegExp(message)), rulePatterns[message]]
})

const app = express()
app.use (function(req, res, next) {
  var data='';
  req.setEncoding('utf8');
  req.on('data', function(chunk) { 
     data += chunk;
  });

  req.on('end', function() {
      req.body = data;
      next();
  });
});

function traverse(t, cb) {
  for (const k of Object.keys(t)) {
    const v = t[k]
    if (typeof v === 'object' && !Array.isArray(v) && v.constructor !== Set) {
      t[k] = traverse(v, cb)
    } else {
      t[k] = cb(v)
    }
  }
  return t
}

sleep = n => new Promise((res, rej) => setTimeout(res, n))

function merge(src, dst) {
  for (const key of Object.keys(src)) {
    const v = src[key]
    if (typeof v === 'object') {
      if (dst[key] == null) {
        dst[key] = {}
      }
      merge(v, dst[key])
    } else {
      if (dst[key] == null) {
        dst[key] = new Set()
      }
      dst[key].add(v)
    }
  }
}

class DB {
  _dataProm = null
  _running = true
  constructor(filepath) {
    this.filepath = filepath
    this._dataProm = fs.readFile(filepath)
      .then(v => {
        const data = JSON.parse(v)
        traverse(
          data,
          (v) => {
            if (Array.isArray(v)) {
              return new Set(
                v.map(ruleObj => ruleObj.message)
              )
            }
            return v
          }
        )
        return data
      })
      .catch(e => {
        console.error(`encountered error ${e}, defaulting to empty object`)
        return {}
      })
    this.start()
  }

  async initialize() {
    await this._dataProm
    return this
  }

  async addData(event) {
    //console.log(JSON.stringify(event, null, 2))
    merge(event, await this._dataProm)
  }

  async start() {
    while (this._running) {
      const toWrite = traverse(
        structuredClone(await this._dataProm),
        (v) => {
          if (v.constructor === Set) {
            return Array.from(v.values()).map(message => {
              try {
              const [, rulePattern] = rulePatternList.find(
                ([regex, pattern]) => {
                    const match = regex.exec(message)
                    return !!match
                  }
                )
                return {
                  message,
                  pattern: rulePattern
                }
              } catch (e) {
                //console.error("encountered error in matching violation message", e)
                return {
                  message,
                  pattern: null
                }
              }
            })
          }
          return v
        }
      )
      await fs.writeFile(this.filepath, JSON.stringify(toWrite, null, 2))
      await sleep(1000)
    }
  }
}

const db = new DB('kyverno-violations.json')
function escapeRegExp(string) {return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');}
const jsonPattern = /(?<data>{.*})/
const ruleMap = Object.keys(enforced).reduce((m, enforcement) => {
  const pattern = enforced[enforcement].map(escapeRegExp).join('|')
  m.set(new RegExp(pattern), enforcement)
  return m
}, new Map())
app.post('/consumeEvents', async (req, res) => {
  const events = req.body.split('\n').filter(x => x.length > 0).map(s => {
    const json = jsonPattern.exec(s).groups.data
    return JSON.parse(json)
  })
  await db.initialize()
  for (const {event} of events) {
    if (event.reason === "PolicyViolation") {
      const invObj = event.related ?? event.involvedObject
      let severity = 'Unknown'
      for (const [pattern, sev] of ruleMap.entries()) { 
        if (pattern.exec(event.message)) {
          severity = sev
          break
        }
      }
      await db.addData({
        [invObj.namespace ?? "<empty namespace>"]: {
          [invObj.kind]: {
            [invObj.name]: {
              [severity]: {
                violations: event.message
              }
            }
          }
        }
      })
    }
  }
  res.send('hi')
})

app.get('/', (req, res) => {
  res.send('hi')
})

app.listen(8080)
console.log("listening on 8080")
