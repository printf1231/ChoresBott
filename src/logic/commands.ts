import { ChoresBotUser, User } from '../models/chat'
import { Action } from '../models/actions'
import { Chore } from '../models/chores'
import { Command } from '../models/commands'
import { ReadOnlyDB } from '../models/db'
import { tagUser, inlineCode, bold } from '../external/chat'
import log from '../utility/log'
import { bestMatch } from '../utility/strings'
import { frequencyToString, parseFrequency } from './time'
import {
    assignChoreActions,
    completeChoreActions,
    didYouMeanMessage
} from './actions'
import {
    skipChore,
    completeChore,
    findChoreForUser,
    findUserForChore,
    describeChore,
    unassignChore,
    assignChore
} from './chores'

// NOTE: If you add a new command, be sure to add it to the `AllCommands` array

// Parse a Discord user mention like <@123456> or <@!123456> and return the user ID
function parseMention(text: string): string | undefined {
    const match = text.match(/^<@!?(\d+)>/)
    return match ? match[1] : undefined
}

export const PingCommand: Command = {
    callsigns: ['ping', '!ping'],
    summary:
        '🏓 Bot responds with "pong", useful diagnostic to check if ChoresBot is running.',
    handler: async () => {
        return [
            {
                kind: 'SendMessage',
                message: {
                    text: '🏓 pong!',
                    author: ChoresBotUser
                }
            }
        ]
    }
}

export const AssignCommand: Command = {
    callsigns: ['!assign'],
    minArgumentCount: 2,
    summary:
        '📌 Assign a chore directly to a member — !assign @member chore-name',
    helpText: `!assign @member chore-name

@member:
    The Discord mention of the member you want to assign the chore to (e.g. @John).
    They must have opted in with !opt-in first.

chore-name:
    The name of the chore to assign.

e.g.
!assign @John vacuum the living room
!assign @Jane take out trash`,
    handler: async (message, config, db, commandArgs) => {
        // Extract the mention at the start of args
        const mentionMatch = commandArgs.match(/^(<@!?\d+>)\s+(.+)$/)
        if (!mentionMatch) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text:
                            AssignCommand.helpText ||
                            'Invalid format. Usage: !assign @member chore-name',
                        author: ChoresBotUser
                    }
                }
            ]
        }

        const mentionStr = mentionMatch[1]
        const choreName = mentionMatch[2].trim()
        const targetUserId = parseMention(mentionStr)

        if (!targetUserId) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `❌ ${tagUser(
                            message.author
                        )} Could not parse that user mention. Try @mentioning them directly.`,
                        author: ChoresBotUser
                    }
                }
            ]
        }

        const targetUser = await db.getUserByID(targetUserId)
        if (!targetUser) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `❌ ${tagUser(
                            message.author
                        )} That member hasn't opted in yet. They need to use ${inlineCode(
                            '!opt-in'
                        )} first.`,
                        author: ChoresBotUser
                    }
                }
            ]
        }

        let chore: Chore | void
        try {
            chore = await db.getChoreByName(choreName)
        } catch (e) {
            log(`error retrieving chore "${choreName}": ${e}`, config)
        }

        if (!chore) {
            return [
                didYouMeanMessage(
                    choreName,
                    await getClosestChoreName(choreName, db),
                    AssignCommand,
                    message.author
                )
            ]
        }

        const updatedChore = assignChore(chore, targetUser)

        return [
            {
                kind: 'ModifyChore',
                chore: updatedChore
            },
            {
                kind: 'SendMessage',
                message: {
                    text: `📌 ${tagUser(message.author)} has assigned "${
                        chore.name
                    }" to ${tagUser(targetUser)}! Good luck! 💪`,
                    author: ChoresBotUser
                }
            }
        ]
    }
}

export const RequestCommand: Command = {
    callsigns: ['!request'],
    summary: '🙋 Request a new chore for yourself',
    handler: async (message, config, db) => {
        const userAssignedChores = await db.getChoresAssignedToUser(
            message.author
        )

        if (userAssignedChores.length > 0) {
            const mostUrgentChore = userAssignedChores[0]

            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text:
                            `⚠️ ${tagUser(
                                message.author
                            )} you are already assigned the chore "${
                                mostUrgentChore.name
                            }". ` +
                            `If you would like to skip you can use the ${inlineCode(
                                defaultCallsign(SkipCommand)
                            )} command`,
                        author: ChoresBotUser
                    }
                }
            ]
        }

        const assignableChores = await db.getUpcomingUnassignedChores()

        if (assignableChores.length == 0) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `✨ ${tagUser(
                            message.author
                        )} there are no upcoming chores — you're all caught up! 🎉`,
                        author: ChoresBotUser
                    }
                }
            ]
        }

        const mostUrgentChore = findChoreForUser(
            assignableChores,
            message.author
        )

        if (mostUrgentChore === undefined) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text:
                            `${tagUser(
                                message.author
                            )} unable to find you a suitable new chore. ` +
                            `This might happen if all available chores have been skipped`,
                        author: ChoresBotUser
                    }
                }
            ]
        }

        return assignChoreActions(mostUrgentChore, message.author)
    }
}

export const SkipCommand: Command = {
    callsigns: ['!skip'],
    summary: '⏭️ Skip your currently assigned chore',
    helpText: `!skip

Skips your currently assigned chore. You will not be re-assigned this chore again until it has been completed by someone else.`,
    handler: async (message, config, db) => {
        const userAssignedChores = await db.getChoresAssignedToUser(
            message.author
        )

        if (userAssignedChores.length === 0) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text:
                            `${tagUser(
                                message.author
                            )} you have no chores currently assigned. ` +
                            `If you would like to request a new chore you can use the ${inlineCode(
                                defaultCallsign(RequestCommand)
                            )} command`,
                        author: ChoresBotUser
                    }
                }
            ]
        }

        const choreToSkip: Chore = userAssignedChores[0]

        return [
            {
                kind: 'ModifyChore',
                chore: skipChore(choreToSkip, message.author)
            },
            {
                kind: 'SendMessage',
                message: {
                    text: `⏭️ ${tagUser(message.author)} skipped the chore "${
                        choreToSkip.name
                    }"`,
                    author: ChoresBotUser
                }
            }
        ]
    }
}

export const CompleteCommand: Command = {
    callsigns: ['!complete', '!completed', '!done'],
    summary: '✅ Mark a chore as completed',
    helpText: `!complete [chore-name]

chore-name:
    Optional.
    The name of the chore you wish to complete. If no name is provided then your currently assigned chore is used.

Note: you do not need to be assigned to a chore to complete it`,
    handler: async (message, config, db, commandArgs) => {
        if (commandArgs.length === 0) {
            return completeAssignedChore(message.author, db)
        }

        return completeChoreByName(commandArgs, message.author, db)
    }
}

export const StatusCommand: Command = {
    callsigns: ['!status', '!uncompleted', '!overdue'],
    summary: '📋 Show all currently assigned (uncompleted) chores',
    handler: async (message, config, db) => {
        const assignedChores = await db.getAllAssignedChores()

        if (assignedChores.length === 0) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `🎉 ${tagUser(
                            message.author
                        )} No chores are currently assigned — everything is done! 🌟`,
                        author: ChoresBotUser
                    }
                }
            ]
        }

        const lines = assignedChores
            .map((chore) => {
                if (chore.assigned === false) return ''
                return `❗ "${chore.name}" → ${tagUser(chore.assigned)}`
            })
            .filter(Boolean)

        return [
            {
                kind: 'SendMessage',
                message: {
                    text: `📋 ${bold('UNCOMPLETED CHORES')}:\n${lines.join(
                        '\n'
                    )}`,
                    author: ChoresBotUser
                }
            }
        ]
    }
}

export const AddCommand: Command = {
    callsigns: ['!add'],
    summary: '➕ Add a new chore',
    helpText: `!add chore-name frequency

chore-name:
    The name of the chore. Shown when being assigned, completed, etc.
    Note: don't use the @ symbol in the name

frequency:
    How frequently the chore should be completed/assigned. Must be one of the following formats:
        Daily @ <time>
        Weekly @ <day>
        Monthly @ <day/time>
        Yearly @ <date>
        Once @ <date/time>

e.g.
!add walk the cat Daily @ 9:00 AM
!add flip the pool Weekly @ monday
!add make a pile Yearly @ Feb 12
!add floop the pig Once @ Nov 9 2:00 PM
!add clean kitchen fans Monthly @ 10th 10:00 AM`,
    minArgumentCount: 2,
    handler: async (message, config, db, commandArgs) => {
        const words = commandArgs.split(' ')
        const atSignIndex = words.indexOf('@')

        if (atSignIndex === -1 || atSignIndex < 2) {
            log(
                `invalid command format for !add command: ${commandArgs}`,
                config
            )
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text:
                            AddCommand.helpText ||
                            'invalid format for !add command',
                        author: ChoresBotUser
                    }
                }
            ]
        }

        const choreName = words.slice(0, atSignIndex - 1).join(' ')
        const frequencyString = words.slice(atSignIndex - 1).join(' ')
        const frequency = parseFrequency(frequencyString)

        if (frequency instanceof Error) {
            log(`Error parsing frequency "${frequency.message}"`, config)
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: '❌ Error: unable to parse the frequency (see logs)',
                        author: ChoresBotUser
                    }
                }
            ]
        }

        return [
            {
                kind: 'AddChore',
                chore: {
                    name: choreName,
                    assigned: false,
                    frequency
                }
            },
            {
                kind: 'SendMessage',
                message: {
                    text: `➕ ${tagUser(
                        message.author
                    )} new chore "${choreName}" added with frequency "${frequencyToString(
                        frequency
                    )}" ✅`,
                    author: ChoresBotUser
                }
            }
        ]
    }
}

export const DeleteCommand: Command = {
    callsigns: ['!delete'],
    minArgumentCount: 1,
    summary: '🗑️ Delete an existing chore',
    helpText: `!delete chore-name

chore-name:
    The name of the chore to delete.`,
    handler: async (message, config, db, choreName) => {
        let chore: Chore | void
        try {
            chore = await db.getChoreByName(choreName)
        } catch (e) {
            log(`error retrieving chore "${choreName}": ${e}`, config)
        }

        if (chore === undefined) {
            return [
                didYouMeanMessage(
                    choreName,
                    await getClosestChoreName(choreName, db),
                    DeleteCommand,
                    message.author
                )
            ]
        }

        return [
            {
                kind: 'DeleteChore',
                chore
            },
            {
                kind: 'SendMessage',
                message: {
                    text: `🗑️ ${tagUser(
                        message.author
                    )} chore "${choreName}" has been deleted`,
                    author: ChoresBotUser
                }
            }
        ]
    }
}

export const ListCommand: Command = {
    callsigns: ['!list', '!chores', '!all'],
    summary: '📝 Get a list of all chores and their current assignment status',
    handler: async (message, config, db) => {
        const choreNames = await db.getAllChoreNames()

        if (choreNames.length === 0) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `📝 ${tagUser(
                            message.author
                        )} No chores have been added yet. Use ${inlineCode(
                            '!add'
                        )} to create one!`,
                        author: ChoresBotUser
                    }
                }
            ]
        }

        const lines: string[] = []
        for (const name of choreNames) {
            const chore = await db.getChoreByName(name)
            if (!chore) continue
            if (chore.assigned !== false) {
                lines.push(`• ${name} — 👤 ${tagUser(chore.assigned)}`)
            } else {
                lines.push(`• ${name} — ✅ unassigned`)
            }
        }

        return [
            {
                kind: 'SendMessage',
                message: {
                    text: `📝 ${bold('All Chores')}:\n${lines.join('\n')}`,
                    author: ChoresBotUser
                }
            }
        ]
    }
}

export const InfoCommand: Command = {
    callsigns: ['!info'],
    summary: 'ℹ️ Get information on a chore',
    helpText: `!info [chore-name]

chore-name:
    Optional.
    The name of the chore you want info on. If no name is provided then your currently assigned chore is used.`,
    handler: async (message, config, db, choreName) => {
        let chore: Chore | void

        if (choreName === '') {
            const userAssignedChores = await db.getChoresAssignedToUser(
                message.author
            )

            if (userAssignedChores.length === 0) {
                return [
                    {
                        kind: 'SendMessage',
                        message: {
                            text: `ℹ️ ${tagUser(
                                message.author
                            )} you have no chores assigned`,
                            author: ChoresBotUser
                        }
                    }
                ]
            }

            chore = userAssignedChores[0]
        } else {
            try {
                chore = await db.getChoreByName(choreName)
            } catch (e) {
                log(`error retrieving chore "${choreName}": ${e}`, config)
            }

            if (chore === undefined) {
                return [
                    didYouMeanMessage(
                        choreName,
                        await getClosestChoreName(choreName, db),
                        InfoCommand,
                        message.author
                    )
                ]
            }
        }

        const completions = await db.getAllChoreCompletions(chore.name)
        const mostRecentCompletion = completions.shift()

        return [
            {
                kind: 'SendMessage',
                message: {
                    text: describeChore(chore, mostRecentCompletion),
                    author: ChoresBotUser
                }
            }
        ]
    }
}

export const OptInCommand: Command = {
    callsigns: ['!opt-in'],
    summary: '🙋 Add yourself to ChoresBot so chores can be assigned to you.',
    handler: async (message) => {
        return [
            {
                kind: 'AddUser',
                user: message.author
            },
            {
                kind: 'SendMessage',
                message: {
                    text: `🎉 ${tagUser(
                        message.author
                    )} Welcome to ChoresBot! You'll now be included in chore assignments. ✨💚`,
                    author: ChoresBotUser
                }
            }
        ]
    }
}

export const OptOutCommand: Command = {
    callsigns: ['!opt-out'],
    summary:
        '👋 Remove yourself from ChoresBot. You will no longer be assigned chores.',
    handler: async (message, config, db) => {
        const actions: Action[] = []

        const userAssignedChores = await db.getChoresAssignedToUser(
            message.author
        )

        for (const chore of userAssignedChores) {
            actions.push({
                kind: 'ModifyChore',
                chore: unassignChore(chore)
            })
        }

        actions.push(
            {
                kind: 'DeleteUser',
                user: message.author
            },
            {
                kind: 'SendMessage',
                message: {
                    text: `👋 ${tagUser(
                        message.author
                    )} You've been removed from ChoresBot. See you around! 🌟`,
                    author: ChoresBotUser
                }
            }
        )

        return actions
    }
}

export const HelpCommand: Command = {
    callsigns: ['!help'],
    summary: '❓ Get help on how to use a command',
    helpText: `!help [command]

command:
    Optional.
    The name of the command you would like help with. If none is provided a summary of all commands will be given.`,
    handler: async (message, config, db, commandName) => {
        if (commandName.length === 0) {
            const helpSummary = AllCommands.map(
                (command) => `${defaultCallsign(command)} — ${command.summary}`
            ).join('\n')
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `${bold(
                            'ChoresBot Commands'
                        )} 🤖\n\n${helpSummary}`,
                        author: ChoresBotUser
                    }
                }
            ]
        } else {
            const commandNames = AllCommands.map(defaultCallsign)
            const closestCommand = bestMatch(commandName, commandNames)
            const command = AllCommands.find(
                (command) => defaultCallsign(command) === closestCommand
            )

            if (command === undefined) {
                const errorText = `Cannot find closest matching command "${closestCommand}"`
                log(errorText, config)
                throw new Error(errorText)
            }

            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: command.helpText || command.summary,
                        author: ChoresBotUser
                    }
                }
            ]
        }
    }
}

export const AllCommands: Command[] = [
    PingCommand,
    AssignCommand,
    RequestCommand,
    SkipCommand,
    CompleteCommand,
    StatusCommand,
    AddCommand,
    DeleteCommand,
    ListCommand,
    InfoCommand,
    OptInCommand,
    OptOutCommand,
    HelpCommand
]

// --- Chore Completion ---

async function completeAssignedChore(
    user: User,
    db: ReadOnlyDB
): Promise<Action[]> {
    const userAssignedChores = await db.getChoresAssignedToUser(user)

    if (userAssignedChores.length === 0) {
        return [
            {
                kind: 'SendMessage',
                message: {
                    text:
                        `${tagUser(
                            user
                        )} you have no chores currently assigned. ` +
                        `If you would like to request a new chore you can use the ${inlineCode(
                            defaultCallsign(RequestCommand)
                        )} command`,
                    author: ChoresBotUser
                }
            }
        ]
    }

    const completedChore: Chore = completeChore(userAssignedChores[0])
    const completeActions = completeChoreActions(completedChore, user)
    const reassignActions = await autoReassignAfterCompletion(
        userAssignedChores[0],
        user,
        db
    )

    return [...completeActions, ...reassignActions]
}

async function completeChoreByName(
    choreName: string,
    completedBy: User,
    db: ReadOnlyDB
): Promise<Action[]> {
    const chore = await db.getChoreByName(choreName)

    if (chore instanceof Error) {
        throw chore
    }

    if (chore === undefined) {
        return [
            didYouMeanMessage(
                choreName,
                await getClosestChoreName(choreName, db),
                CompleteCommand,
                completedBy
            )
        ]
    }

    const completedChore: Chore = completeChore(chore)
    const completeActions = completeChoreActions(completedChore, completedBy)
    const reassignActions = await autoReassignAfterCompletion(
        chore,
        completedBy,
        db
    )

    return [...completeActions, ...reassignActions]
}

// After a chore is completed, immediately assign it to the next eligible member (round-robin)
async function autoReassignAfterCompletion(
    originalChore: Chore,
    completedBy: User,
    db: ReadOnlyDB
): Promise<Action[]> {
    // Only auto-reassign recurring chores (Once chores are done forever)
    if (originalChore.frequency.kind === 'Once') {
        return []
    }

    // Get users who don't currently have a chore assigned
    // (completedBy still has this chore in DB since actions haven't run yet, so they're excluded)
    const assignableUsers =
        await db.getAssignableUsersInOrderOfRecentCompletion()
    assignableUsers.reverse() // least recently done first

    // Also exclude the member who just completed (in case they have no other chores)
    const candidates = assignableUsers.filter((u) => u.id !== completedBy.id)

    if (candidates.length === 0) {
        return []
    }

    // The cleaned chore has no assignment and no skips — everyone is eligible
    const cleanedChore = completeChore(originalChore)
    const nextUser = findUserForChore(cleanedChore, candidates)

    if (nextUser === undefined) {
        return []
    }

    return assignChoreActions(cleanedChore, nextUser)
}

// --- Utility ---

async function getClosestChoreName(
    requestedName: string,
    db: ReadOnlyDB
): Promise<string | undefined> {
    const chores = await db.getAllChoreNames()
    return bestMatch(requestedName, chores)
}

// --- Command "Methods" ---

export function defaultCallsign(command: Command): string {
    if (command.callsigns.length === 0) {
        throw new Error('All commands must have at least one callsign')
    }

    return command.callsigns[0]
}
