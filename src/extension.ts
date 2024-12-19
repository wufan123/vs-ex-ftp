import * as vscode from 'vscode';
import { FtpItem, FtpTreeProvider } from './FtpTreeProvider';
import { FileHandler } from './FileHandler';
const nls = require("vscode-nls-i18n");
import { BrowserOpener } from './BrowserOpener';

function activate(context: vscode.ExtensionContext) {
    nls.init(context.extensionPath);
    // 注册ftp视图
    const ftpTreeProvider = new FtpTreeProvider();
    vscode.window.registerTreeDataProvider('ftp-explorer', ftpTreeProvider);
    ftpTreeProvider.refresh();
    //注册打开设置
    context.subscriptions.push(
        vscode.commands.registerCommand('ftpExplorer.openSettings', () => {
            // 打开设置页面
            vscode.commands.executeCommand('workbench.action.openSettings', 'ftpClient');
        })
    );
    //连接服务器
    context.subscriptions.push(
        vscode.commands.registerCommand('ftpExplorer.connectFTP',async () => {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        })
    );
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
        await ftpTreeProvider.deleteFTPItem(item);
    }));
    // 注册上传命令
    context.subscriptions.push(vscode.commands.registerCommand('ftpExplorer.uploadItem', async () => {
        await ftpTreeProvider.uploadToFTP();
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

    context.subscriptions.push(
        vscode.commands.registerCommand('ftpExplorer.previewHtml', async (item: vscode.Uri) => {
            const browserOpener = new BrowserOpener();
            await browserOpener.openUrlInBrowser(item);

        })
    );
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
