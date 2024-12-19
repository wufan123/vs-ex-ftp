
import * as vscode from 'vscode';
import * as ftp from 'basic-ftp';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
const {localize } = require("vscode-nls-i18n"); 
class FTPClientWrapper {
    private client: ftp.Client;
    private isConnecting: boolean = false;

    constructor() {
        this.client = new ftp.Client();
        this.client.ftp.verbose = true;
    }
   

    async connect(): Promise<void> {
        // 防止并发连接
        if (this.isConnecting || !this.client.closed) return;
        this.isConnecting = true;
        const config = vscode.workspace.getConfiguration('ftpClient');
        const host = config.get<string>('1.host', '');
        const user = config.get<string>('2.user', '');
        const password = config.get<string>('3.password', '');
        const secure = config.get<boolean>('6.secure', false);
        if(!host||!user||!password){
            let missingFields = [];
            if (!host) missingFields.push("host");
            if (!user) missingFields.push("user");
            if (!password) missingFields.push("password");
            let parStr = missingFields.join(", ");
            let errMessage = localize('ftp.connection.error.notConfigured', parStr);
            // vscode.window.showErrorMessage(errMessage);
            this.isConnecting = false;
            vscode.commands.executeCommand('workbench.action.openSettings', 'ftpClient');
            vscode.commands.executeCommand('setContext', 'ftpExplorer.connected', false);
            throw new Error(errMessage);
        }
        try {
            await this.client.access({ host, user, password, secure });
            vscode.commands.executeCommand('setContext', 'ftpExplorer.connected', true);
        } catch (error) {
            vscode.window.showErrorMessage(localize('ftp.connection.error', error.message));
            vscode.commands.executeCommand('setContext', 'ftpExplorer.connected', false);
            throw error;
        } finally {
            this.isConnecting = false;
        }
    }

    async list(directoryPath: string = '/'): Promise<ftp.FileInfo[]> {
        await this.connect(); // 确保连接建立
        return this.client.list(directoryPath);
    }

    async downloadToTempFile(remotePath: string): Promise<string> {
        await this.connect(); // 确保连接建立
        const tempFilePath = path.join(os.tmpdir(), path.basename(remotePath));

        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: localize('ftp.downloading', path.basename(remotePath)),
                cancellable: false
            },
            async (progress) => {
                this.client.trackProgress((info) => {
                    progress.report({
                        message: `${info.name} - ${info.bytes} bytes downloaded`,
                        increment: (info.bytes / info.bytesOverall) * 100
                    });
                });
                await this.client.downloadTo(tempFilePath, remotePath);
                this.client.trackProgress(); // 停止跟踪进度
                return tempFilePath;
            }
        );
    }
    public async downloadDirectory(remotePath: string, localDir: string, progress: vscode.Progress<{ message?: string }>) {
        await this.connect();
        // 创建本地根文件夹，并包括该文件夹在递归下载
        const folderName = path.basename(remotePath);
        const localFolderPath = path.join(localDir, folderName);
        fs.mkdirSync(localFolderPath, { recursive: true });

        // 递归下载包括当前文件夹在内的所有内容
        await this._downloadDirectoryRecursively(remotePath, localFolderPath, progress);
    }

    private async _downloadDirectoryRecursively(remotePath: string, localDir: string, progress: vscode.Progress<{ message?: string }>) {
        await this.connect();
        const remoteItems = await this.client.list(remotePath);
        for (const item of remoteItems) {
            const itemRemotePath = path.join(remotePath, item.name);
            const itemLocalPath = path.join(localDir, item.name);

            if (item.isDirectory) {
                // 创建子文件夹并递归下载内容
                fs.mkdirSync(itemLocalPath, { recursive: true });
                await this._downloadDirectoryRecursively(itemRemotePath, itemLocalPath, progress);
            } else {
                // 下载单个文件
                await this.downloadFile(itemRemotePath, localDir, progress);
            }
        }
    }

    public async downloadFile(remotePath: string, localDir: string, progress: vscode.Progress<{ message?: string }>) {
        await this.connect();
        const localFilePath = path.join(localDir, path.basename(remotePath));

        this.client.trackProgress(info => {
            progress.report({ message: `${info.bytesOverall} bytes downloaded` });
        });

        await this.client.downloadTo(localFilePath, remotePath);
        this.client.trackProgress(); // 停止进度追踪
    }

    // 删除文件
    public async removeFile(remotePath: string): Promise<void> {
        await this.connect();
        await this.client.remove(remotePath);
    }

    // 删除目录
    public async removeDirectory(remotePath: string): Promise<void> {
        await this.connect();
        await this.client.removeDir(remotePath);
    }

    // 上传文件
    public async uploadFile(localPath: string, remotePath: string, progress?: vscode.Progress<{ increment: number }>) {
        await this.connect();
        try {
            await this.client.uploadFrom(localPath, remotePath);
        } catch (error) {
            console.error(`Failed to upload file: ${localPath} to ${remotePath}:`, error);
            throw error;
        }
    }

    // 上传文件夹
    public async uploadDirectory(localDir: string, remoteDir: string, progress?: vscode.Progress<{ increment: number }>) {
        await this.connect();
        try {
            await this.client.uploadFromDir(localDir, remoteDir);
        } catch (error) {
            console.error(`Failed to upload directory: ${localDir} to ${remoteDir}:`, error);
            throw error;
        }
    }

    // 创建目录，必要时递归创建父级目录
    public async createDirectory(remotePath: string): Promise<void> {
        await this.connect();
        try {
            // 检查目录是否存在，不存在则创建
            await this.client.ensureDir(remotePath);
        } catch (error) {
            console.error(`Failed to create directory ${remotePath}: ${error.message}`);
            throw error;
        }

    }



    close(): void {
        if (!this.client.closed) {
            this.client.close();
        }
    }
}


export class FtpTreeProvider implements vscode.TreeDataProvider<FtpItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FtpItem | undefined> = new vscode.EventEmitter<FtpItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<FtpItem | undefined> = this._onDidChangeTreeData.event;

    public ftpClient: FTPClientWrapper;
    private currentPath: string = '/';
    private currentRootPath: string = '/';
    public isBusy: boolean = false;

    constructor() {
        this.ftpClient = new FTPClientWrapper();
        const config = vscode.workspace.getConfiguration('ftpClient');
        this.currentPath = this.currentRootPath = config.get<string>('4.path', '/');
        vscode.commands.executeCommand('setContext', 'ftpExplorer.refreshEnabled', true);
    }

    public connectFTP() {
         this.ftpClient.connect();
    }

    public getCurrentRootPath() {
        return this.currentRootPath;
    }

    public async downloadToDirectory(item: FtpItem) {
        const folderUris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: localize('ftp.provider.selectDestinationDirectory') // 更新本地化前缀
        });

        if (folderUris && folderUris[0]) {
            const targetDir = folderUris[0].fsPath;
            const sourcePath = item.path;
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: localize('ftp.provider.downloading', item.label), // 更新本地化前缀
                cancellable: false
            }, async (progress) => {
                try {
                    if (item.isDirectory) {
                        await this.ftpClient.downloadDirectory(sourcePath, targetDir, progress);
                    } else {
                        await this.ftpClient.downloadFile(sourcePath, targetDir, progress);
                    }
                    vscode.window.showInformationMessage(localize('ftp.provider.downloadSuccess',item.label, targetDir)); // 更新本地化前缀
                } catch (error) {
                    vscode.window.showErrorMessage(localize('ftp.provider.downloadFailed', error.message)); // 更新本地化前缀
                }
            });
        }
    }

    public async setRootDirectory(item: FtpItem) {
        this.currentRootPath = item.path;
        const config = vscode.workspace.getConfiguration('ftpClient');
        await config.update('4.path', this.currentRootPath, vscode.ConfigurationTarget.Global);
        await this.refreshFTPItems(this.currentRootPath);
    }

    async refreshFTPItems(path: string = '/'): Promise<void> {
        vscode.commands.executeCommand('setContext', 'ftpExplorer.refreshEnabled', false);
        await this.safeExecute(async () => {
            this.currentPath = path;
            this.currentRootPath = path;
            this.isBusy = true;
            await this.loadFTPItems(this.currentPath);
            this.refresh();
            vscode.window.showInformationMessage(localize('ftp.provider.refreshSuccess')); // 更新本地化前缀 
        });
        vscode.commands.executeCommand('setContext', 'ftpExplorer.refreshEnabled', true);
    }

    private async safeExecute(task: () => Promise<void>): Promise<void> {
        try {
            await task();
        } catch (error) {
            vscode.window.showErrorMessage(localize('ftp.provider.ftpError',error.message)); // 更新本地化前缀
        } finally {
            this.isBusy = false;
        }
    }

    private async loadFTPItems(path: string = '/', showPreLevel: boolean = false): Promise<FtpItem[]> {
        if (typeof path !== 'string') {
            vscode.window.showErrorMessage(localize('ftp.provider.invalidPath',typeof path)); // 更新本地化前缀
            return [];
        }

        try {
            const items: FtpItem[] = [];
            const files = await this.ftpClient.list(path);
            if (showPreLevel) {
                items.push(new FtpItem(
                    localize('ftp.provider.toParentDirectory'), // 更新本地化前缀
                    "../",
                    this.getPathParentPath(path),
                    false
                ));
            }
            items.push(...files.map(file => new FtpItem(
                file.name,
                path === '/' ? `/${file.name}` : `${path}/${file.name}`,
                path,
                file.isDirectory
            )));

            return items;
        } catch (error) {
            vscode.window.showErrorMessage(localize('ftp.provider.loadItemsFailed', error.message)); // 更新本地化前缀
            return [];
        }
    }

    private getPathParentPath(path: string): string {
        if (path === '/' || path === '') {
            return '/';
        }

        if (path.endsWith('/')) {
            path = path.slice(0, -1);
        }

        const lastSlashIndex = path.lastIndexOf('/');

        if (lastSlashIndex === -1) {
            return '/';
        }

        const parentPath = path.substring(0, lastSlashIndex);
        return parentPath === '' ? '/' : parentPath;
    }

    public async deleteFTPItem(item: FtpItem): Promise<void> {
        if (this.isBusy) {
            vscode.window.showErrorMessage(localize('ftp.provider.waitForTask')); // 更新本地化前缀
            return;
        }

        const confirmDelete = await vscode.window.showWarningMessage(localize('ftp.provider.confirmDelete',item.label), localize('ftp.provider.yes'), localize('ftp.provider.no')); // 更新本地化前缀
        if (confirmDelete !== localize('ftp.provider.yes', 'Yes')) return;
        this.isBusy = true;
        try {
            if (item.isDirectory) {
                await this.ftpClient.removeDirectory(item.path);
            } else {
                await this.ftpClient.removeFile(item.path);
            }
            vscode.window.showInformationMessage(localize('ftp.provider.deleteSuccess',item.label)); // 更新本地化前缀
            await this.refreshFTPItems(this.currentPath);
        } catch (error) {
            vscode.window.showErrorMessage(localize('ftp.provider.deleteFailed', 'Failed to delete {0}: {1}', item.label, error.message)); // 更新本地化前缀
        } finally {
            this.isBusy = false;
        }
    }

    public async uploadToFTP() {
        if (this.isBusy) {
            vscode.window.showErrorMessage(localize('ftp.provider.waitForTask')); // 更新本地化前缀
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
        if (!workspaceFolder) {
            vscode.window.showErrorMessage(localize('ftp.provider.noWorkspaceFolder', 'No workspace folder found.')); // 更新本地化前缀
            return;
        }

        const actions = [localize('ftp.provider.uploadFolder'), localize('ftp.provider.uploadFile')]; // 更新本地化前缀
        const action = await vscode.window.showQuickPick(actions, {
            placeHolder: localize('ftp.provider.chooseUploadAction') // 更新本地化前缀
        });

        const isSelectFolders = action === localize('ftp.provider.uploadFolder');

        const selectedFiles = await vscode.window.showOpenDialog({
            canSelectFolders: isSelectFolders,
            canSelectFiles: !isSelectFolders,
            canSelectMany: true,
            openLabel: action,
            defaultUri: workspaceFolder ? vscode.Uri.file(workspaceFolder) : undefined
        });

        if (!selectedFiles || selectedFiles.length === 0) return;
        this.isBusy = true;

        const workspaceFolderName = workspaceFolder ? path.basename(workspaceFolder) : '';
        const defaultRemotePath = this.currentRootPath ? path.posix.join(this.currentRootPath, workspaceFolderName) : '/';

        const remotePath = await vscode.window.showInputBox({
            prompt: localize('ftp.provider.enterDestinationPath'), // 更新本地化前缀
            value: defaultRemotePath,
            placeHolder: localize('ftp.provider.examplePath') // 更新本地化前缀
        });

        if (!remotePath) return;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: localize('ftp.provider.uploadingTo', remotePath), // 更新本地化前缀
            cancellable: false
        }, async (progress) => {
            try {
                for (const file of selectedFiles) {
                    const localPath = file.fsPath;
                    const relativePath = path.relative(workspaceFolder, localPath);
                    const remoteTargetPath = path.posix.join(remotePath, relativePath);
                    const isDirectory = (await vscode.workspace.fs.stat(file)).type === vscode.FileType.Directory;

                    if (isDirectory) {
                        await this.uploadDirectoryWithStructure(localPath, remotePath, progress);
                    } else {
                        const fileName = path.basename(localPath); 
                        const remoteTargetPath = path.posix.join(remotePath, fileName); 
                        const remoteFileDir = path.posix.dirname(remoteTargetPath);
                        await this.ftpClient.createDirectory(remoteFileDir); 
                        await this.ftpClient.uploadFile(localPath, remoteTargetPath, progress);
                    }
                    vscode.window.showInformationMessage(localize('ftp.provider.uploadSuccess', localPath, remoteTargetPath)); // 更新本地化前缀
                }
                await this.refreshFTPItems(this.currentPath);
            } catch (error) {
                vscode.window.showErrorMessage(localize('ftp.provider.uploadFailed',error.message)); // 更新本地化前缀
            } finally {
                this.isBusy = false;
            }
        });
    }

    private async uploadDirectoryWithStructure(localPath: string, remotePath: string, progress: vscode.Progress<{ increment: number }>) {
        const fs = require('fs').promises;
        const path = require('path');

        await this.ftpClient.createDirectory(remotePath);

        const items = await fs.readdir(localPath, { withFileTypes: true });

        for (const item of items) {
            const itemLocalPath = path.join(localPath, item.name);
            const itemRemotePath = path.posix.join(remotePath, item.name);

            if (item.isDirectory()) {
                await this.uploadDirectoryWithStructure(itemLocalPath, itemRemotePath, progress);
            } else {
                await this.ftpClient.uploadFile(itemLocalPath, itemRemotePath, progress);
            }
        }
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: FtpItem): vscode.TreeItem {
        return element;
    }

    async backParentDirectory(item: FtpItem) {
        const parentPath = item.parentPath;
        await this.refreshFTPItems(parentPath);
    }

    async getChildren(element?: FtpItem): Promise<FtpItem[]> {
        if (!element) {
            let showPreLevel = this.currentPath === "/" ? false : true;
            return this.loadFTPItems(this.currentPath, showPreLevel); // 根目录
        } else if (element.isDirectory) {
            return this.loadFTPItems(element.path); // 获取子目录
        }
        return [];
    }
}


export class FtpItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly path: string,
        public readonly parentPath: string,
        public readonly isDirectory: boolean
    ) {
        super(
            label,
            isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );
        if (path === "../" && parentPath) {
            this.command = {
                command: 'ftpExplorer.backParentDirectory',
                title: 'Back Parent Directory',
                arguments: [this]
            }
        } else {
            this.command = isDirectory ? undefined : {
                command: 'ftpExplorer.openFile',
                title: 'Open File',
                arguments: [this.path]
            };
        }


        this.contextValue = isDirectory ? 'folder' : 'file';
    }
}
