"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.defaultCallsign = exports.AllCommands = exports.HelpCommand = exports.OptOutCommand = exports.OptInCommand = exports.InfoCommand = exports.ListCommand = exports.DeleteCommand = exports.AddCommand = exports.StatusCommand = exports.CompleteCommand = exports.SkipCommand = exports.RequestCommand = exports.AssignCommand = exports.PingCommand = void 0;
const chat_1 = require("../models/chat");
const chat_2 = require("../external/chat");
const log_1 = __importDefault(require("../utility/log"));
const routes = __importStar(require("../routes"));
const strings_1 = require("../utility/strings");
const time_1 = require("./time");
const actions_1 = require("./actions");
const chores_1 = require("./chores");
// NOTE: If you add a new command, be sure to add it to the `AllCommands` array
// Parse a Discord user mention like <@123456> or <@!123456> and return the user ID
function parseMention(text) {
    const match = text.match(/^<@!?(\d+)>/);
    return match ? match[1] : undefined;
}
exports.PingCommand = {
    callsigns: ['ping', '!ping'],
    summary: '🏓 Bot responds with "pong", useful diagnostic to check if ChoresBot is running.',
    handler: () => __awaiter(void 0, void 0, void 0, function* () {
        return [
            {
                kind: 'SendMessage',
                message: {
                    text: '🏓 pong!',
                    author: chat_1.ChoresBotUser
                }
            }
        ];
    })
};
exports.AssignCommand = {
    callsigns: ['!assign'],
    minArgumentCount: 2,
    summary: '📌 Assign a chore directly to a member — !assign @member chore-name',
    helpText: `!assign @member chore-name

@member:
    The Discord mention of the member you want to assign the chore to (e.g. @John).
    They must have opted in with !opt-in first.

chore-name:
    The name of the chore to assign.

e.g.
!assign @John vacuum the living room
!assign @Jane take out trash`,
    handler: (message, config, db, commandArgs) => __awaiter(void 0, void 0, void 0, function* () {
        // Extract the mention at the start of args
        const mentionMatch = commandArgs.match(/^(<@!?\d+>)\s+(.+)$/);
        if (!mentionMatch) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: exports.AssignCommand.helpText ||
                            'Invalid format. Usage: !assign @member chore-name',
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        const mentionStr = mentionMatch[1];
        const choreName = mentionMatch[2].trim();
        const targetUserId = parseMention(mentionStr);
        if (!targetUserId) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `❌ ${(0, chat_2.tagUser)(message.author)} Could not parse that user mention. Try @mentioning them directly.`,
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        const targetUser = yield db.getUserByID(targetUserId);
        if (!targetUser) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `❌ ${(0, chat_2.tagUser)(message.author)} That member hasn't opted in yet. They need to use ${(0, chat_2.inlineCode)('!opt-in')} first.`,
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        let chore;
        try {
            chore = yield db.getChoreByName(choreName);
        }
        catch (e) {
            (0, log_1.default)(`error retrieving chore "${choreName}": ${e}`, config);
        }
        if (!chore) {
            return [
                (0, actions_1.didYouMeanMessage)(choreName, yield getClosestChoreName(choreName, db), exports.AssignCommand, message.author)
            ];
        }
        const updatedChore = (0, chores_1.assignChore)(chore, targetUser);
        return [
            {
                kind: 'ModifyChore',
                chore: updatedChore
            },
            {
                kind: 'SendMessage',
                message: {
                    text: `📌 ${(0, chat_2.tagUser)(message.author)} has assigned "${chore.name}" to ${(0, chat_2.tagUser)(targetUser)}! Good luck! 💪`,
                    author: chat_1.ChoresBotUser
                }
            }
        ];
    })
};
exports.RequestCommand = {
    callsigns: ['!request'],
    summary: '🙋 Request a new chore for yourself',
    handler: (message, config, db) => __awaiter(void 0, void 0, void 0, function* () {
        const userAssignedChores = yield db.getChoresAssignedToUser(message.author);
        if (userAssignedChores.length > 0) {
            const mostUrgentChore = userAssignedChores[0];
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `⚠️ ${(0, chat_2.tagUser)(message.author)} you are already assigned the chore "${mostUrgentChore.name}". ` +
                            `If you would like to skip you can use the ${(0, chat_2.inlineCode)(defaultCallsign(exports.SkipCommand))} command`,
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        const assignableChores = yield db.getUpcomingUnassignedChores();
        if (assignableChores.length == 0) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `✨ ${(0, chat_2.tagUser)(message.author)} there are no upcoming chores — you're all caught up! 🎉`,
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        const mostUrgentChore = (0, chores_1.findChoreForUser)(assignableChores, message.author);
        if (mostUrgentChore === undefined) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `${(0, chat_2.tagUser)(message.author)} unable to find you a suitable new chore. ` +
                            `This might happen if all available chores have been skipped`,
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        return (0, actions_1.assignChoreActions)(mostUrgentChore, message.author);
    })
};
exports.SkipCommand = {
    callsigns: ['!skip'],
    summary: '⏭️ Skip your currently assigned chore',
    helpText: `!skip

Skips your currently assigned chore. You will not be re-assigned this chore again until it has been completed by someone else.`,
    handler: (message, config, db) => __awaiter(void 0, void 0, void 0, function* () {
        const userAssignedChores = yield db.getChoresAssignedToUser(message.author);
        if (userAssignedChores.length === 0) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `${(0, chat_2.tagUser)(message.author)} you have no chores currently assigned. ` +
                            `If you would like to request a new chore you can use the ${(0, chat_2.inlineCode)(defaultCallsign(exports.RequestCommand))} command`,
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        const choreToSkip = userAssignedChores[0];
        return [
            {
                kind: 'ModifyChore',
                chore: (0, chores_1.skipChore)(choreToSkip, message.author)
            },
            {
                kind: 'SendMessage',
                message: {
                    text: `⏭️ ${(0, chat_2.tagUser)(message.author)} skipped the chore "${choreToSkip.name}"`,
                    author: chat_1.ChoresBotUser
                }
            }
        ];
    })
};
exports.CompleteCommand = {
    callsigns: ['!complete', '!completed', '!done'],
    summary: '✅ Mark a chore as completed',
    helpText: `!complete [chore-name]

chore-name:
    Optional.
    The name of the chore you wish to complete. If no name is provided then your currently assigned chore is used.

Note: you do not need to be assigned to a chore to complete it`,
    handler: (message, config, db, commandArgs) => __awaiter(void 0, void 0, void 0, function* () {
        if (commandArgs.length === 0) {
            return completeAssignedChore(message.author, db);
        }
        return completeChoreByName(commandArgs, message.author, db);
    })
};
exports.StatusCommand = {
    callsigns: ['!status', '!uncompleted', '!overdue'],
    summary: '📋 Show all currently assigned (uncompleted) chores',
    handler: (message, config, db) => __awaiter(void 0, void 0, void 0, function* () {
        const assignedChores = yield db.getAllAssignedChores();
        if (assignedChores.length === 0) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `🎉 ${(0, chat_2.tagUser)(message.author)} No chores are currently assigned — everything is done! 🌟`,
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        const lines = assignedChores
            .map((chore) => {
            if (chore.assigned === false)
                return '';
            return `❗ "${chore.name}" → ${(0, chat_2.tagUser)(chore.assigned)}`;
        })
            .filter(Boolean);
        return [
            {
                kind: 'SendMessage',
                message: {
                    text: `📋 ${(0, chat_2.bold)('UNCOMPLETED CHORES')}:\n${lines.join('\n')}`,
                    author: chat_1.ChoresBotUser
                }
            }
        ];
    })
};
exports.AddCommand = {
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
    handler: (message, config, db, commandArgs) => __awaiter(void 0, void 0, void 0, function* () {
        const words = commandArgs.split(' ');
        const atSignIndex = words.indexOf('@');
        if (atSignIndex === -1 || atSignIndex < 2) {
            (0, log_1.default)(`invalid command format for !add command: ${commandArgs}`, config);
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: exports.AddCommand.helpText ||
                            'invalid format for !add command',
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        const choreName = words.slice(0, atSignIndex - 1).join(' ');
        const frequencyString = words.slice(atSignIndex - 1).join(' ');
        const frequency = (0, time_1.parseFrequency)(frequencyString);
        if (frequency instanceof Error) {
            (0, log_1.default)(`Error parsing frequency "${frequency.message}"`, config);
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: '❌ Error: unable to parse the frequency (see logs)',
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
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
                    text: `➕ ${(0, chat_2.tagUser)(message.author)} new chore "${choreName}" added with frequency "${(0, time_1.frequencyToString)(frequency)}" ✅`,
                    author: chat_1.ChoresBotUser
                }
            }
        ];
    })
};
exports.DeleteCommand = {
    callsigns: ['!delete'],
    minArgumentCount: 1,
    summary: '🗑️ Delete an existing chore',
    helpText: `!delete chore-name

chore-name:
    The name of the chore to delete.`,
    handler: (message, config, db, choreName) => __awaiter(void 0, void 0, void 0, function* () {
        let chore;
        try {
            chore = yield db.getChoreByName(choreName);
        }
        catch (e) {
            (0, log_1.default)(`error retrieving chore "${choreName}": ${e}`, config);
        }
        if (chore === undefined) {
            return [
                (0, actions_1.didYouMeanMessage)(choreName, yield getClosestChoreName(choreName, db), exports.DeleteCommand, message.author)
            ];
        }
        return [
            {
                kind: 'DeleteChore',
                chore
            },
            {
                kind: 'SendMessage',
                message: {
                    text: `🗑️ ${(0, chat_2.tagUser)(message.author)} chore "${choreName}" has been deleted`,
                    author: chat_1.ChoresBotUser
                }
            }
        ];
    })
};
exports.ListCommand = {
    callsigns: ['!list', '!chores', '!all'],
    summary: '📝 Get a list of all chores',
    handler: (message, config) => __awaiter(void 0, void 0, void 0, function* () {
        return [
            {
                kind: 'SendMessage',
                message: {
                    text: `📝 A list of all chores is available ${(0, chat_2.hyperlink)('here', `${config.clientUrlRoot}${routes.choresListPage}`)}`,
                    author: chat_1.ChoresBotUser
                }
            }
        ];
    })
};
exports.InfoCommand = {
    callsigns: ['!info'],
    summary: 'ℹ️ Get information on a chore',
    helpText: `!info [chore-name]

chore-name:
    Optional.
    The name of the chore you want info on. If no name is provided then your currently assigned chore is used.`,
    handler: (message, config, db, choreName) => __awaiter(void 0, void 0, void 0, function* () {
        let chore;
        if (choreName === '') {
            const userAssignedChores = yield db.getChoresAssignedToUser(message.author);
            if (userAssignedChores.length === 0) {
                return [
                    {
                        kind: 'SendMessage',
                        message: {
                            text: `ℹ️ ${(0, chat_2.tagUser)(message.author)} you have no chores assigned`,
                            author: chat_1.ChoresBotUser
                        }
                    }
                ];
            }
            chore = userAssignedChores[0];
        }
        else {
            try {
                chore = yield db.getChoreByName(choreName);
            }
            catch (e) {
                (0, log_1.default)(`error retrieving chore "${choreName}": ${e}`, config);
            }
            if (chore === undefined) {
                return [
                    (0, actions_1.didYouMeanMessage)(choreName, yield getClosestChoreName(choreName, db), exports.InfoCommand, message.author)
                ];
            }
        }
        const completions = yield db.getAllChoreCompletions(chore.name);
        const mostRecentCompletion = completions.shift();
        return [
            {
                kind: 'SendMessage',
                message: {
                    text: (0, chores_1.describeChore)(chore, mostRecentCompletion),
                    author: chat_1.ChoresBotUser
                }
            }
        ];
    })
};
exports.OptInCommand = {
    callsigns: ['!opt-in'],
    summary: '🙋 Add yourself to ChoresBot so chores can be assigned to you.',
    handler: (message) => __awaiter(void 0, void 0, void 0, function* () {
        return [
            {
                kind: 'AddUser',
                user: message.author
            },
            {
                kind: 'SendMessage',
                message: {
                    text: `🎉 ${(0, chat_2.tagUser)(message.author)} Welcome to ChoresBot! You'll now be included in chore assignments. ✨💚`,
                    author: chat_1.ChoresBotUser
                }
            }
        ];
    })
};
exports.OptOutCommand = {
    callsigns: ['!opt-out'],
    summary: '👋 Remove yourself from ChoresBot. You will no longer be assigned chores.',
    handler: (message, config, db) => __awaiter(void 0, void 0, void 0, function* () {
        const actions = [];
        const userAssignedChores = yield db.getChoresAssignedToUser(message.author);
        for (const chore of userAssignedChores) {
            actions.push({
                kind: 'ModifyChore',
                chore: (0, chores_1.unassignChore)(chore)
            });
        }
        actions.push({
            kind: 'DeleteUser',
            user: message.author
        }, {
            kind: 'SendMessage',
            message: {
                text: `👋 ${(0, chat_2.tagUser)(message.author)} You've been removed from ChoresBot. See you around! 🌟`,
                author: chat_1.ChoresBotUser
            }
        });
        return actions;
    })
};
exports.HelpCommand = {
    callsigns: ['!help'],
    summary: '❓ Get help on how to use a command',
    helpText: `!help [command]

command:
    Optional.
    The name of the command you would like help with. If none is provided a summary of all commands will be given.`,
    handler: (message, config, db, commandName) => __awaiter(void 0, void 0, void 0, function* () {
        if (commandName.length === 0) {
            const helpSummary = exports.AllCommands.map((command) => `${defaultCallsign(command)} — ${command.summary}`).join('\n');
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `${(0, chat_2.bold)('ChoresBot Commands')} 🤖\n\n${helpSummary}`,
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        else {
            const commandNames = exports.AllCommands.map(defaultCallsign);
            const closestCommand = (0, strings_1.bestMatch)(commandName, commandNames);
            const command = exports.AllCommands.find((command) => defaultCallsign(command) === closestCommand);
            if (command === undefined) {
                const errorText = `Cannot find closest matching command "${closestCommand}"`;
                (0, log_1.default)(errorText, config);
                throw new Error(errorText);
            }
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: command.helpText || command.summary,
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
    })
};
exports.AllCommands = [
    exports.PingCommand,
    exports.AssignCommand,
    exports.RequestCommand,
    exports.SkipCommand,
    exports.CompleteCommand,
    exports.StatusCommand,
    exports.AddCommand,
    exports.DeleteCommand,
    exports.ListCommand,
    exports.InfoCommand,
    exports.OptInCommand,
    exports.OptOutCommand,
    exports.HelpCommand
];
// --- Chore Completion ---
function completeAssignedChore(user, db) {
    return __awaiter(this, void 0, void 0, function* () {
        const userAssignedChores = yield db.getChoresAssignedToUser(user);
        if (userAssignedChores.length === 0) {
            return [
                {
                    kind: 'SendMessage',
                    message: {
                        text: `${(0, chat_2.tagUser)(user)} you have no chores currently assigned. ` +
                            `If you would like to request a new chore you can use the ${(0, chat_2.inlineCode)(defaultCallsign(exports.RequestCommand))} command`,
                        author: chat_1.ChoresBotUser
                    }
                }
            ];
        }
        const completedChore = (0, chores_1.completeChore)(userAssignedChores[0]);
        const completeActions = (0, actions_1.completeChoreActions)(completedChore, user);
        const reassignActions = yield autoReassignAfterCompletion(userAssignedChores[0], user, db);
        return [...completeActions, ...reassignActions];
    });
}
function completeChoreByName(choreName, completedBy, db) {
    return __awaiter(this, void 0, void 0, function* () {
        const chore = yield db.getChoreByName(choreName);
        if (chore instanceof Error) {
            throw chore;
        }
        if (chore === undefined) {
            return [
                (0, actions_1.didYouMeanMessage)(choreName, yield getClosestChoreName(choreName, db), exports.CompleteCommand, completedBy)
            ];
        }
        const completedChore = (0, chores_1.completeChore)(chore);
        const completeActions = (0, actions_1.completeChoreActions)(completedChore, completedBy);
        const reassignActions = yield autoReassignAfterCompletion(chore, completedBy, db);
        return [...completeActions, ...reassignActions];
    });
}
// After a chore is completed, immediately assign it to the next eligible member (round-robin)
function autoReassignAfterCompletion(originalChore, completedBy, db) {
    return __awaiter(this, void 0, void 0, function* () {
        // Only auto-reassign recurring chores (Once chores are done forever)
        if (originalChore.frequency.kind === 'Once') {
            return [];
        }
        // Get users who don't currently have a chore assigned
        // (completedBy still has this chore in DB since actions haven't run yet, so they're excluded)
        const assignableUsers = yield db.getAssignableUsersInOrderOfRecentCompletion();
        assignableUsers.reverse(); // least recently done first
        // Also exclude the member who just completed (in case they have no other chores)
        const candidates = assignableUsers.filter((u) => u.id !== completedBy.id);
        if (candidates.length === 0) {
            return [];
        }
        // The cleaned chore has no assignment and no skips — everyone is eligible
        const cleanedChore = (0, chores_1.completeChore)(originalChore);
        const nextUser = (0, chores_1.findUserForChore)(cleanedChore, candidates);
        if (nextUser === undefined) {
            return [];
        }
        return (0, actions_1.assignChoreActions)(cleanedChore, nextUser);
    });
}
// --- Utility ---
function getClosestChoreName(requestedName, db) {
    return __awaiter(this, void 0, void 0, function* () {
        const chores = yield db.getAllChoreNames();
        return (0, strings_1.bestMatch)(requestedName, chores);
    });
}
// --- Command "Methods" ---
function defaultCallsign(command) {
    if (command.callsigns.length === 0) {
        throw new Error('All commands must have at least one callsign');
    }
    return command.callsigns[0];
}
exports.defaultCallsign = defaultCallsign;
//# sourceMappingURL=commands.js.map