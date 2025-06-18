import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { console } from 'inspector';
const archiver = require('archiver');
const { init, localize } = require("vscode-nls-i18n");
export async function compressSelectedItems(selectedItems: vscode.Uri[], workspaceRoot: string) {
    const timestamp = new Date().toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(/[/,:]/g, '').replace(/[ ]/g, '_');
    const directoryName = path.basename(workspaceRoot);
    const outputPath = path.join(workspaceRoot, `${directoryName}_${timestamp}.zip`);
    const output = fs.createWriteStream(outputPath);

    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    output.on('close', () => {
        const sizeInBytes = archive.pointer();
        let sizeString = getSizeString(sizeInBytes);
        vscode.window.showInformationMessage(
            localize('compress.completed', outputPath, sizeString),
            localize('compress.openFolder', 'Open Folder')
        ).then(selection => {
            if (selection === localize('compress.openFolder', 'Open Folder')) {
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
            }
        });
    });

    archive.on('error', (err: any) => {
        vscode.window.showErrorMessage(localize('compress.error', err.message));
    });

    archive.pipe(output);

    for (const item of selectedItems) {
        const relativePath = path.relative(workspaceRoot, item.fsPath);
        const stat = await fs.promises.stat(item.fsPath);
        if (stat.isDirectory()) {
            archive.directory(item.fsPath, relativePath);
        } else {
            archive.file(item.fsPath, { name: relativePath });
        }
    }

    await archive.finalize();
}
export function getSizeString(sizeInBytes: number): string {
    let sizeString;
    if (sizeInBytes >= 1e9) {
        sizeString = (sizeInBytes / 1e9).toFixed(2) + ' GB';
    } else if (sizeInBytes >= 1e6) {
        sizeString = (sizeInBytes / 1e6).toFixed(2) + ' MB';
    } else if (sizeInBytes >= 1e3) {
        sizeString = (sizeInBytes / 1e3).toFixed(2) + ' KB';
    } else {
        sizeString = sizeInBytes + ' B';
    }
    return sizeString;
}

export async function compressDirectoryWithIgnore(workspaceRoot: string) {
    const config = vscode.workspace.getConfiguration('ftpClient');
    const ignorePattern = config.get<string>('7.ignore', '');
    const regex = ignorePattern ? new RegExp(ignorePattern) : null;

    const directoryName = path.basename(workspaceRoot);
    const timestamp = new Date().toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(/[/,:]/g, '').replace(/[ ]/g, '_');
    const outputPath = path.join(workspaceRoot, `${directoryName}_${timestamp}.zip`);
    const output = fs.createWriteStream(outputPath);

    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    output.on('close', () => {
        const sizeInBytes = archive.pointer();
        let sizeString = getSizeString(sizeInBytes);
        vscode.window.showInformationMessage(
            localize('compress.completed', outputPath, sizeString),
            localize('compress.openFolder', 'Open Folder')
        ).then(selection => {
            if (selection === localize('compress.openFolder', 'Open Folder')) {
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
            }
        });
    });

    archive.on('error', (err: any) => {
        vscode.window.showErrorMessage(localize('compress.error', err.message));
    });

    archive.pipe(output);

    async function addFilesToArchive(dir: string) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (regex && regex.test(entry.name)) {

                continue;
            }

            if (entry.isDirectory()) {
                await addFilesToArchive(fullPath);
            } else {
                archive.file(fullPath, { name: path.relative(workspaceRoot, fullPath) });
            }
        }
    }

    await addFilesToArchive(workspaceRoot);
    await archive.finalize();
}