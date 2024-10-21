import * as vscode from 'vscode';
import { CodeImageGenerator } from './CodeImageGenerator';
import { FtpItem, FtpTreeProvider } from './FtpTreeProvider';
import { FileHandler } from './FileHandler';
import * as path from 'path';

function activate(context: vscode.ExtensionContext) {

    // 注册代码复制为图片的命令
    const codeImageGenerator = new CodeImageGenerator();
    const disposable = vscode.commands.registerCommand('extension.copyCodeAsImage', async () => {
        await codeImageGenerator.generateAndCopyImageFromSelection();
    });
    context.subscriptions.push(disposable);
    // 注册ftp视图
    const ftpTreeProvider = new FtpTreeProvider();
    vscode.window.registerTreeDataProvider('ftp-explorer', ftpTreeProvider);
    ftpTreeProvider.refresh();
    // 注册刷新命令
    const refreshCommand = vscode.commands.registerCommand('ftpExplorer.refresh', async () => {
        await ftpTreeProvider.refreshFTPItems(ftpTreeProvider.getCurrentRootPath());
    });
    context.subscriptions.push(refreshCommand);

    //注册下载文件命令
    context.subscriptions.push(
        vscode.commands.registerCommand('ftpExplorer.downloadToDirectory', (item: FtpItem) => {
            ftpTreeProvider.downloadToDirectory(item);
        })
    );
    //注册删除文件命令
    context.subscriptions.push(vscode.commands.registerCommand('ftpExplorer.deleteItem', async (item: FtpItem) => {
        const treeProvider = new FtpTreeProvider();
        await treeProvider.deleteFTPItem(item);
    }));
    // 注册回到上一级命令
    context.subscriptions.push(
        vscode.commands.registerCommand('ftpExplorer.backParentDirectory', (item: FtpItem) => {
            ftpTreeProvider.backParentDirectory(item);
        })
    );

    // 注册设置当前路径为一级目录的命令
    context.subscriptions.push(vscode.commands.registerCommand('ftpExplorer.setRootDirectory', async (item: FtpItem) => {
        await ftpTreeProvider.setRootDirectory(item); // 调用设置方法
    }));

    // 注册文件打开命令
    const fileHandler = new FileHandler();
    context.subscriptions.push(vscode.commands.registerCommand('ftpExplorer.openFile', async (filePath: string) => {
        const tempFilePath = await ftpTreeProvider.ftpClient.downloadToTempFile(filePath);
        await fileHandler.openFile(tempFilePath);
    }));
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
