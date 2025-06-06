const {google} = require('googleapis');
const {
    SlashCommandBuilder,
} = require('discord.js')
const sheets = require('../../auth.js');
const config = require('../../config.json');
const sheetsConfig = require('../../sheets-config.json');
const qualifiersSheet = sheetsConfig.qualifiersSheetName;
const {getSpreadsheetData, updateSpreadsheetData} = require('../../modules/spreadsheetFunctions.js');
const {columnToIndex} = require('../../modules/columnToIndex.js');
const {indexToColumn} = require('../../modules/indexToColumn.js');
const qualifiersCaptainDiscordStartingColumn = sheetsConfig.qualifiersCaptainDiscordStartingColumn;
const qualifiersLobbySize = config.qualifiersLobbySize;
const captainRole = config.captainRole;
const qualifiersLobbyIdColumn = sheetsConfig.qualifiersLobbyIdColumn;

function checkValidUser(interaction) {
    return interaction.member.roles.cache.has(captainRole);
}

function checkIfAlreadyInLobby(lobbyRow, userId) {
    for (let i = 0; i < qualifiersLobbySize; i++) {
        const captainDiscordId = lobbyRow[columnToIndex(qualifiersCaptainDiscordStartingColumn) + i];
        if (captainDiscordId === userId) {
            return true;
        }
    }
    return false;
}

async function checkIfAlreadyInAnotherLobby(interaction, rows, userId) {
    for (const row of rows) {
        for (let i = 0; i < qualifiersLobbySize; i++) {
            const captainDiscordId = row[columnToIndex(qualifiersCaptainDiscordStartingColumn) + i];
            if (captainDiscordId === userId) {
                //leave lobby
                const lobbyId = row[columnToIndex(qualifiersLobbyIdColumn)];
                const lobbyRowIndex = rows.indexOf(row) + 1;
                const columnFound = indexToColumn(columnToIndex(qualifiersCaptainDiscordStartingColumn) + i);
                const range = `'${qualifiersSheet}'!${columnFound}${lobbyRowIndex}:${columnFound}${lobbyRowIndex}`;
                const value = [['']];
                await updateSpreadsheetData(range, value)
                return true;
            }
        }
    }
    return false;
}

async function handleQualifiersJoin(rows, interaction, lobbyRow, lobbyRowIndex) {
    let lobbyFound = false;
    let columnFound = '';
    if (checkIfAlreadyInLobby(lobbyRow, interaction.user.id)) {
        return interaction.editReply({
            content: `:x: You are already in this lobby.`,
            ephemeral: true,
        });
    }
    for (let i = 0; i < qualifiersLobbySize; i++) {
        const captainDiscordId = lobbyRow[columnToIndex(qualifiersCaptainDiscordStartingColumn) + i];
        if (!captainDiscordId) {
            columnFound = indexToColumn(columnToIndex(qualifiersCaptainDiscordStartingColumn) + i);
            lobbyFound = true;
            break;
        }
    }
    if (!lobbyFound) {
        return interaction.editReply({
            content: `:x: Lobby is full.`,
            ephemeral: true,
        });
    } else {
        let replyContent = ``;
        if (await checkIfAlreadyInAnotherLobby(interaction, rows, interaction.user.id)) {
            replyContent = `:warning: You have been removed from your previous lobby.\n`;
        }
        const range = `'${qualifiersSheet}'!${columnFound}${lobbyRowIndex}:${columnFound}${lobbyRowIndex}`;
        const value = [[interaction.user.id]];
        updateSpreadsheetData(range, value)
            .then(() => {
                replyContent += `:white_check_mark: You have joined the lobby **${interaction.options.getString('lobbyid').toUpperCase()}**.`;
                interaction.editReply({
                    content: replyContent,
                    ephemeral: true,
                });
            })
            .catch((error) => {
                console.error(error);
                interaction.editReply({
                    content: `${replyContent}:x: An error occurred while updating the spreadsheet.`,
                    ephemeral: true,
                });
            });
    }
}

function handleQualifiersLeave(interaction, lobbyRow, lobbyRowIndex) {
    let lobbyFound = false;
    let columnFound = '';
    for (let i = 0; i < qualifiersLobbySize; i++) {
        const captainDiscordId = lobbyRow[columnToIndex(qualifiersCaptainDiscordStartingColumn) + i];
        if (captainDiscordId === interaction.user.id) {
            lobbyRow[columnToIndex(qualifiersCaptainDiscordStartingColumn) + i] = '';
            columnFound = indexToColumn(columnToIndex(qualifiersCaptainDiscordStartingColumn) + i);
            lobbyFound = true;
            break;
        }
    }
    if (!lobbyFound) {
        return interaction.editReply({
            content: `:x: You are not in this lobby.`,
            ephemeral: true,
        });
    } else {
        const range = `'${qualifiersSheet}'!${columnFound}${lobbyRowIndex}:${columnFound}${lobbyRowIndex}`;
        const value = [['']];
        updateSpreadsheetData(range, value)
            .then(() => {
                interaction.editReply({
                    content: `:white_check_mark: You have left the lobby **${interaction.options.getString('lobbyid').toUpperCase()}**.`,
                    ephemeral: true,
                });
            })
            .catch((error) => {
                console.error(error);
                interaction.editReply({
                    content: `:x: An error occurred while updating the spreadsheet.`,
                    ephemeral: true,
                });
            });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('qualifiers')
        .setDescription("Join/Leave Qualifiers' lobbies")
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Join a lobby')
                .addStringOption(option =>
                    option
                        .setName('lobbyid')
                        .setDescription('Lobby ID')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setDescription('Leave a lobby')
                .addStringOption(option =>
                    option
                        .setName('lobbyid')
                        .setDescription('Lobby ID')
                        .setRequired(true)
                )
        ),
    execute: async (interaction) => {
        await interaction.deferReply();
        const lobbyId = interaction.options.getString('lobbyid').toUpperCase();
        if (!checkValidUser(interaction)) {
            return interaction.editReply({
                content: ':x: You are not authorized to use this command.',
                ephemeral: true,
            });
        }
        const rows = await getSpreadsheetData(qualifiersSheet);
        const lobbyRow = rows.find((row) => row[columnToIndex(qualifiersLobbyIdColumn)] === lobbyId);
        if (!lobbyRow) {
            return interaction.editReply({
                content: ':x: Lobby ID not found.',
                ephemeral: true,
            });
        }
        const lobbyRowIndex = rows.indexOf(lobbyRow) + 1;
        if (interaction.options.getSubcommand() === 'join') {
            await handleQualifiersJoin(rows, interaction, lobbyRow, lobbyRowIndex);
        } else {
            handleQualifiersLeave(interaction, lobbyRow, lobbyRowIndex);
        }
    }
}

