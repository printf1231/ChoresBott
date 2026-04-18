import { ChoresBotUser, User } from '../models/chat'
import { assignChore } from './chores'
import { Action } from '../models/actions'
import { Chore } from '../models/chores'
import { tagUser, inlineCode, bold } from '../external/chat'
import { Command } from '../models/commands'
import { defaultCallsign } from './commands'

export function completeChoreActions(
    completedChore: Chore,
    user: User
): Action[] {
    return [
        {
            kind: 'CompleteChore',
            chore: completedChore,
            user
        },
        {
            kind: 'SendMessage',
            message: {
                text: `✅ Great work ${tagUser(user)}! The chore "${
                    completedChore.name
                }" has been completed! 🌟`,
                author: ChoresBotUser
            }
        }
    ]
}

export function assignChoreActions(chore: Chore, user: User): Action[] {
    return [
        {
            kind: 'ModifyChore',
            chore: assignChore(chore, user)
        },
        {
            kind: 'SendMessage',
            message: {
                text: `📋 Hey ${tagUser(user)}! You've been assigned: "${
                    chore.name
                }" 💪 You've got this!`,
                author: ChoresBotUser
            }
        }
    ]
}

export function didYouMeanMessage(
    choreName: string,
    closestMatch: string | undefined,
    command: Command,
    taggedUser: User
): Action {
    if (closestMatch === undefined) {
        return {
            kind: 'SendMessage',
            message: {
                text: `❓ ${tagUser(
                    taggedUser
                )} Unable to find a chore named "${choreName}".`,
                author: ChoresBotUser
            }
        }
    }

    return {
        kind: 'SendMessage',
        message: {
            text: `❓ ${tagUser(
                taggedUser
            )} Unable to find chore "${choreName}". Did you mean ${inlineCode(
                `${defaultCallsign(command)} ${closestMatch}`
            )}?`,
            author: ChoresBotUser
        }
    }
}

export function reminderAction(assignedChores: Chore[]): Action[] {
    if (assignedChores.length === 0) {
        return []
    }

    const reminderList = assignedChores.map((chore) => {
        if (chore.assigned === false) {
            throw new Error(
                `unassigned chore provided to reminderAction: ${chore.name}`
            )
        }
        return `❗ "${chore.name}" — ${tagUser(chore.assigned)}`
    })

    return [
        {
            kind: 'SendMessage',
            message: {
                text: `⏰ ${bold(
                    'END OF DAY REMINDER'
                )} ⏰\nThe following chores are still uncompleted:\n${reminderList.join(
                    '\n'
                )}\n\nPlease complete them or use ${inlineCode(
                    '!skip'
                )} if needed! 🙏`,
                author: ChoresBotUser
            }
        }
    ]
}
