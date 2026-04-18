import fs from 'fs'
import path from 'path'

import { DB } from '../models/db'
import { User } from '../models/chat'
import { Chore, ChoreCompletion } from '../models/chores'
import { Frequency } from '../models/time'
import { getChoreDueDate } from '../logic/chores'
import { dayInMilliseconds } from '../models/time'

interface StoredFrequency {
    kind: string
    date?: string
    time?: string
    weekday?: string
}

interface StoredChore {
    name: string
    assigned: string | false
    frequency: StoredFrequency
    skippedBy?: string[]
}

interface StoredCompletion {
    choreName: string
    by: string
    at: string
}

interface StoredData {
    users: User[]
    chores: StoredChore[]
    completions: StoredCompletion[]
    config: Record<string, string>
}

function loadData(filePath: string): StoredData {
    if (!fs.existsSync(filePath)) {
        return { users: [], chores: [], completions: [], config: {} }
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as StoredData
}

function saveData(filePath: string, data: StoredData): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function parseFrequency(f: StoredFrequency): Frequency {
    switch (f.kind) {
        case 'Daily':
            return { kind: 'Daily', time: new Date(f.time as string) }
        case 'Weekly':
            return { kind: 'Weekly', weekday: f.weekday as string }
        case 'Monthly':
            return { kind: 'Monthly', date: new Date(f.date as string) }
        case 'Yearly':
            return { kind: 'Yearly', date: new Date(f.date as string) }
        case 'Once':
            return { kind: 'Once', date: new Date(f.date as string) }
        default:
            throw new Error(`Unknown frequency kind: ${f.kind}`)
    }
}

function serializeFrequency(f: Frequency): StoredFrequency {
    switch (f.kind) {
        case 'Daily':
            return { kind: 'Daily', time: f.time.toISOString() }
        case 'Weekly':
            return { kind: 'Weekly', weekday: f.weekday }
        case 'Monthly':
            return { kind: 'Monthly', date: f.date.toISOString() }
        case 'Yearly':
            return { kind: 'Yearly', date: f.date.toISOString() }
        case 'Once':
            return { kind: 'Once', date: f.date.toISOString() }
    }
}

function storedChoreToChore(stored: StoredChore, users: User[]): Chore {
    const frequency = parseFrequency(stored.frequency)

    let assigned: User | false = false
    if (stored.assigned !== false) {
        assigned = users.find((u) => u.id === stored.assigned) ?? false
    }

    const chore: Chore = { name: stored.name, assigned, frequency }

    if (stored.skippedBy && stored.skippedBy.length > 0) {
        chore.skippedBy = stored.skippedBy
            .map((id) => users.find((u) => u.id === id))
            .filter((u): u is User => u !== undefined)
    }

    return chore
}

function choreToStored(chore: Chore): StoredChore {
    return {
        name: chore.name,
        assigned: chore.assigned !== false ? chore.assigned.id : false,
        frequency: serializeFrequency(chore.frequency),
        skippedBy: chore.skippedBy?.map((u) => u.id) ?? []
    }
}

export function fileDB(dataFilePath: string): DB {
    const fp = dataFilePath

    const db: DB = {
        getAllUsers: async () => {
            return loadData(fp).users
        },

        getUserByID: async (id) => {
            return loadData(fp).users.find((u) => u.id === id)
        },

        addUser: async (user) => {
            const data = loadData(fp)
            if (!data.users.find((u) => u.id === user.id)) {
                data.users.push(user)
                saveData(fp, data)
            }
        },

        deleteUser: async (user) => {
            const data = loadData(fp)
            data.users = data.users.filter((u) => u.id !== user.id)
            saveData(fp, data)
        },

        getAssignableUsersInOrderOfRecentCompletion: async () => {
            const data = loadData(fp)
            const chores = data.chores.map((c) =>
                storedChoreToChore(c, data.users)
            )

            const assignedUserIds = new Set(
                chores
                    .filter((c) => c.assigned !== false)
                    .map((c) => (c.assigned as User).id)
            )

            const unassignedUsers = data.users.filter(
                (u) => !assignedUserIds.has(u.id)
            )

            // Sort by most recent completion ascending (least-recently-done first)
            const lastCompletionFor = (userId: string): number => {
                const completions = data.completions
                    .filter((c) => c.by === userId)
                    .map((c) => new Date(c.at).getTime())
                if (completions.length === 0) return 0
                return Math.max(...completions)
            }

            unassignedUsers.sort(
                (a, b) => lastCompletionFor(a.id) - lastCompletionFor(b.id)
            )

            return unassignedUsers
        },

        getOutstandingUnassignedChores: async () => {
            const now = new Date()
            return getUnassignedChoresDueBy(fp, now)
        },

        getUpcomingUnassignedChores: async () => {
            const tomorrow = new Date(Date.now() + dayInMilliseconds)
            return getUnassignedChoresDueBy(fp, tomorrow)
        },

        addChore: async (chore) => {
            const data = loadData(fp)
            data.chores = data.chores.filter((c) => c.name !== chore.name)
            data.chores.push(choreToStored(chore))
            saveData(fp, data)
        },

        modifyChore: async (chore) => {
            const data = loadData(fp)
            const idx = data.chores.findIndex((c) => c.name === chore.name)
            if (idx !== -1) {
                data.chores[idx] = choreToStored(chore)
            } else {
                data.chores.push(choreToStored(chore))
            }
            saveData(fp, data)
        },

        deleteChore: async (name) => {
            const data = loadData(fp)
            data.chores = data.chores.filter((c) => c.name !== name)
            saveData(fp, data)
        },

        getChoreByName: async (name) => {
            const data = loadData(fp)
            const stored = data.chores.find((c) => c.name === name)
            if (!stored) return undefined
            return storedChoreToChore(stored, data.users)
        },

        getChoresAssignedToUser: async (user) => {
            const data = loadData(fp)
            return data.chores
                .filter((c) => c.assigned === user.id)
                .map((c) => storedChoreToChore(c, data.users))
        },

        getAllChoreNames: async () => {
            return loadData(fp).chores.map((c) => c.name)
        },

        getAllAssignedChores: async () => {
            const data = loadData(fp)
            return data.chores
                .filter((c) => c.assigned !== false)
                .map((c) => storedChoreToChore(c, data.users))
        },

        addChoreCompletion: async (choreName, user) => {
            const data = loadData(fp)
            data.completions.push({
                choreName,
                by: user.id,
                at: new Date().toISOString()
            })
            saveData(fp, data)
        },

        getAllChoreCompletions: async (choreName) => {
            const data = loadData(fp)
            return data.completions
                .filter((c) => c.choreName === choreName)
                .map((c) => ({
                    choreName: c.choreName,
                    by: data.users.find((u) => u.id === c.by) ?? {
                        name: c.by,
                        id: c.by
                    },
                    at: new Date(c.at)
                })) as ChoreCompletion[]
        },

        getConfigValue: async (key) => {
            const data = loadData(fp)
            return data.config[key] ?? null
        },

        setConfigValue: async (key, value) => {
            const data = loadData(fp)
            data.config[key] = value
            saveData(fp, data)
        }
    }

    return db
}

function getUnassignedChoresDueBy(fp: string, byDate: Date): Chore[] {
    const data = loadData(fp)
    const unassigned = data.chores
        .filter((c) => c.assigned === false)
        .map((c) => storedChoreToChore(c, data.users))

    const mostRecentCompletion = (choreName: string): Date | undefined => {
        const completions = data.completions
            .filter((c) => c.choreName === choreName)
            .map((c) => new Date(c.at).getTime())
        if (completions.length === 0) return undefined
        return new Date(Math.max(...completions))
    }

    const withDueDate: [Chore, Date][] = []
    for (const chore of unassigned) {
        const lastDone = mostRecentCompletion(chore.name)
        const dueDate = getChoreDueDate(chore, lastDone)
        if (dueDate === undefined) continue
        if (dueDate < byDate) {
            withDueDate.push([chore, dueDate])
        }
    }

    withDueDate.sort((a, b) => a[1].getTime() - b[1].getTime())
    return withDueDate.map(([chore]) => chore)
}
