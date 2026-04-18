import express from 'express'

import { Chat } from './models/chat'
import { initChat } from './external/chat'

import { DB } from './models/db'
import { fileDB } from './external/filedb'

import log from './utility/log'

import { isEnvFlagSet } from './utility/env'
import { asyncLoop } from './utility/async'

import { Action } from './models/actions'
import { Config } from './models/config'

import { loop, messageHandler } from './logic/main'
import { parseTime } from './logic/time'

import * as routes from './routes'
import serveChoresList from './api/chores-list'
import serveChoreInfo from './api/chore-info'
import path from 'path'
;(async () => {
    // --- Config ---
    const serverPort: string = process.env.PORT || '80'
    const clientUrlRoot: string = process.env.URL || `localhost:${serverPort}`
    const dataFilePath: string =
        process.env.DATA_FILE || './data/choresbot.json'
    const frequencyString = process.env.FREQUENCY || '120'
    let frequency = parseInt(frequencyString, 10)
    if (isNaN(frequency)) {
        frequency = 120
    }
    const channel = process.env.DISCORD_CHANNEL || 'chores'
    const token = process.env.DISCORD_TOKEN || ''
    const verboseFlag = isEnvFlagSet('VERBOSE')

    let morningTime: Date | undefined
    if (process.env.MORNING_TIME !== undefined) {
        morningTime = parseTime(process.env.MORNING_TIME)
    }
    if (morningTime === undefined) {
        morningTime = parseTime('7:00 AM')
    }

    let nightTime: Date | undefined
    if (process.env.NIGHT_TIME !== undefined) {
        nightTime = parseTime(process.env.NIGHT_TIME)
    }
    if (nightTime === undefined) {
        nightTime = parseTime('11:00 PM')
    }

    const config: Config = {
        morningTime,
        nightTime,
        debug: false,
        verbose: verboseFlag,
        clientUrlRoot,
        discordChannel: channel
    }

    // --- External Services ---
    const db: DB = fileDB(dataFilePath)

    const chat: Chat = await initChat(config, async (msg) => {
        const actions = await messageHandler(msg, db, config).catch((e) => {
            log(`Error in message handler!: ${e}`, config)
            return []
        })

        log(`message actions: ${JSON.stringify(actions)}`, config)
        await performActions(actions, chat, db).catch((e) => {
            log(`Error performing actions!: ${e}`, config)
        })
    })

    await chat.login(token)

    // --- Chat Bot ---
    asyncLoop(
        async () => {
            const actions = await loop(db, config).catch((e) => {
                log(`Error in main loop!: ${e}`, config)
                return []
            })

            log(`loop actions: ${JSON.stringify(actions)}`, config)
            await performActions(actions, chat, db).catch((e) => {
                log(`Error performing actions!: ${e}`, config)
            })

            return true // keep looping
        },
        frequency * 1000,
        false,
        true
    )

    // --- Server ---
    const app = express()

    app.use(express.static('client/dist'))

    app.get(routes.choresListAPI, serveChoresList.bind(null, db))
    app.get(routes.choreInfoAPI, serveChoreInfo.bind(null, db))

    app.get('*', function (req, res, next) {
        const options = {
            root: path.join(__dirname, '..', 'client/dist')
        }

        res.sendFile('index.html', options, (err) => {
            if (err) {
                next(err)
            }
        })
    })

    app.listen(serverPort, () => {
        log(`Listening at http://localhost:${serverPort}`, config)
    })
})()

async function performActions(
    actions: Action[],
    chat: Chat,
    db: DB
): Promise<void> {
    for (const action of actions) {
        switch (action.kind) {
            case 'SendMessage': {
                await chat.sendChatMessage(action.message)
                break
            }
            case 'CompleteChore': {
                await db.addChoreCompletion(action.chore.name, action.user)
                await db.modifyChore(action.chore)
                break
            }
            case 'AddChore': {
                await db.addChore(action.chore)
                break
            }
            case 'ModifyChore': {
                await db.modifyChore(action.chore)
                break
            }
            case 'DeleteChore': {
                await db.deleteChore(action.chore.name)
                break
            }
            case 'AddUser': {
                await db.addUser(action.user)
                break
            }
            case 'DeleteUser': {
                await db.deleteUser(action.user)
                break
            }
        }
    }
}
