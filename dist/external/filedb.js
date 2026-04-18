"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileDB = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const chores_1 = require("../logic/chores");
const time_1 = require("../models/time");
function loadData(filePath) {
    if (!fs_1.default.existsSync(filePath)) {
        return { users: [], chores: [], completions: [], config: {} };
    }
    const raw = fs_1.default.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
}
function saveData(filePath, data) {
    fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
    fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
function parseFrequency(f) {
    switch (f.kind) {
        case 'Daily':
            return { kind: 'Daily', time: new Date(f.time) };
        case 'Weekly':
            return { kind: 'Weekly', weekday: f.weekday };
        case 'Monthly':
            return { kind: 'Monthly', date: new Date(f.date) };
        case 'Yearly':
            return { kind: 'Yearly', date: new Date(f.date) };
        case 'Once':
            return { kind: 'Once', date: new Date(f.date) };
        default:
            throw new Error(`Unknown frequency kind: ${f.kind}`);
    }
}
function serializeFrequency(f) {
    switch (f.kind) {
        case 'Daily':
            return { kind: 'Daily', time: f.time.toISOString() };
        case 'Weekly':
            return { kind: 'Weekly', weekday: f.weekday };
        case 'Monthly':
            return { kind: 'Monthly', date: f.date.toISOString() };
        case 'Yearly':
            return { kind: 'Yearly', date: f.date.toISOString() };
        case 'Once':
            return { kind: 'Once', date: f.date.toISOString() };
    }
}
function storedChoreToChore(stored, users) {
    var _a;
    const frequency = parseFrequency(stored.frequency);
    let assigned = false;
    if (stored.assigned !== false) {
        assigned = (_a = users.find((u) => u.id === stored.assigned)) !== null && _a !== void 0 ? _a : false;
    }
    const chore = { name: stored.name, assigned, frequency };
    if (stored.skippedBy && stored.skippedBy.length > 0) {
        chore.skippedBy = stored.skippedBy
            .map((id) => users.find((u) => u.id === id))
            .filter((u) => u !== undefined);
    }
    return chore;
}
function choreToStored(chore) {
    var _a, _b;
    return {
        name: chore.name,
        assigned: chore.assigned !== false ? chore.assigned.id : false,
        frequency: serializeFrequency(chore.frequency),
        skippedBy: (_b = (_a = chore.skippedBy) === null || _a === void 0 ? void 0 : _a.map((u) => u.id)) !== null && _b !== void 0 ? _b : []
    };
}
function fileDB(dataFilePath) {
    const fp = dataFilePath;
    const db = {
        getAllUsers: () => __awaiter(this, void 0, void 0, function* () {
            return loadData(fp).users;
        }),
        getUserByID: (id) => __awaiter(this, void 0, void 0, function* () {
            return loadData(fp).users.find((u) => u.id === id);
        }),
        addUser: (user) => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            if (!data.users.find((u) => u.id === user.id)) {
                data.users.push(user);
                saveData(fp, data);
            }
        }),
        deleteUser: (user) => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            data.users = data.users.filter((u) => u.id !== user.id);
            saveData(fp, data);
        }),
        getAssignableUsersInOrderOfRecentCompletion: () => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            const chores = data.chores.map((c) => storedChoreToChore(c, data.users));
            const assignedUserIds = new Set(chores
                .filter((c) => c.assigned !== false)
                .map((c) => c.assigned.id));
            const unassignedUsers = data.users.filter((u) => !assignedUserIds.has(u.id));
            // Sort by most recent completion ascending (least-recently-done first)
            const lastCompletionFor = (userId) => {
                const completions = data.completions
                    .filter((c) => c.by === userId)
                    .map((c) => new Date(c.at).getTime());
                if (completions.length === 0)
                    return 0;
                return Math.max(...completions);
            };
            unassignedUsers.sort((a, b) => lastCompletionFor(a.id) - lastCompletionFor(b.id));
            return unassignedUsers;
        }),
        getOutstandingUnassignedChores: () => __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            return getUnassignedChoresDueBy(fp, now);
        }),
        getUpcomingUnassignedChores: () => __awaiter(this, void 0, void 0, function* () {
            const tomorrow = new Date(Date.now() + time_1.dayInMilliseconds);
            return getUnassignedChoresDueBy(fp, tomorrow);
        }),
        addChore: (chore) => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            data.chores = data.chores.filter((c) => c.name !== chore.name);
            data.chores.push(choreToStored(chore));
            saveData(fp, data);
        }),
        modifyChore: (chore) => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            const idx = data.chores.findIndex((c) => c.name === chore.name);
            if (idx !== -1) {
                data.chores[idx] = choreToStored(chore);
            }
            else {
                data.chores.push(choreToStored(chore));
            }
            saveData(fp, data);
        }),
        deleteChore: (name) => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            data.chores = data.chores.filter((c) => c.name !== name);
            saveData(fp, data);
        }),
        getChoreByName: (name) => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            const stored = data.chores.find((c) => c.name === name);
            if (!stored)
                return undefined;
            return storedChoreToChore(stored, data.users);
        }),
        getChoresAssignedToUser: (user) => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            return data.chores
                .filter((c) => c.assigned === user.id)
                .map((c) => storedChoreToChore(c, data.users));
        }),
        getAllChoreNames: () => __awaiter(this, void 0, void 0, function* () {
            return loadData(fp).chores.map((c) => c.name);
        }),
        getAllAssignedChores: () => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            return data.chores
                .filter((c) => c.assigned !== false)
                .map((c) => storedChoreToChore(c, data.users));
        }),
        addChoreCompletion: (choreName, user) => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            data.completions.push({
                choreName,
                by: user.id,
                at: new Date().toISOString()
            });
            saveData(fp, data);
        }),
        getAllChoreCompletions: (choreName) => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            return data.completions
                .filter((c) => c.choreName === choreName)
                .map((c) => {
                var _a;
                return ({
                    choreName: c.choreName,
                    by: (_a = data.users.find((u) => u.id === c.by)) !== null && _a !== void 0 ? _a : {
                        name: c.by,
                        id: c.by
                    },
                    at: new Date(c.at)
                });
            });
        }),
        getConfigValue: (key) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const data = loadData(fp);
            return (_a = data.config[key]) !== null && _a !== void 0 ? _a : null;
        }),
        setConfigValue: (key, value) => __awaiter(this, void 0, void 0, function* () {
            const data = loadData(fp);
            data.config[key] = value;
            saveData(fp, data);
        })
    };
    return db;
}
exports.fileDB = fileDB;
function getUnassignedChoresDueBy(fp, byDate) {
    const data = loadData(fp);
    const unassigned = data.chores
        .filter((c) => c.assigned === false)
        .map((c) => storedChoreToChore(c, data.users));
    const mostRecentCompletion = (choreName) => {
        const completions = data.completions
            .filter((c) => c.choreName === choreName)
            .map((c) => new Date(c.at).getTime());
        if (completions.length === 0)
            return undefined;
        return new Date(Math.max(...completions));
    };
    const withDueDate = [];
    for (const chore of unassigned) {
        const lastDone = mostRecentCompletion(chore.name);
        const dueDate = (0, chores_1.getChoreDueDate)(chore, lastDone);
        if (dueDate === undefined)
            continue;
        if (dueDate < byDate) {
            withDueDate.push([chore, dueDate]);
        }
    }
    withDueDate.sort((a, b) => a[1].getTime() - b[1].getTime());
    return withDueDate.map(([chore]) => chore);
}
//# sourceMappingURL=filedb.js.map