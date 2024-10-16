import * as vscode from 'vscode';
import { CodeImageGenerator } from './CodeImageGenerator';
import { FtpTreeProvider } from './FtpTreeProvider';
import { FileHandler } from './FileHandler';
import * as path from 'path';

function activate(context: vscode.ExtensionContext) {
    const codeImageGenerator = new CodeImageGenerator();
    const fileHandler = new FileHandler();

    // 注册代码复制为图片的命令
    const disposable = vscode.commands.registerCommand('extension.copyCodeAsImage', async () => {
        await codeImageGenerator.generateAndCopyImageFromSelection();
    });
    context.subscriptions.push(disposable);

    const ftpTreeProvider = new FtpTreeProvider();
    vscode.window.registerTreeDataProvider('ftp-explorer', ftpTreeProvider);

    // 注册文件打开命令
    context.subscriptions.push(vscode.commands.registerCommand('ftpExplorer.openFile', async (filePath: string) => {
        const tempFilePath = await ftpTreeProvider.ftpClient.downloadToTempFile(filePath);
        await fileHandler.openFile(tempFilePath);
    }));

    ftpTreeProvider.refresh();
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
