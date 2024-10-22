// extension.ts
import * as vscode from 'vscode';
import * as ftp from 'basic-ftp';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

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
        const host = config.get<string>('host', '192.168.63.174');
        const user = config.get<string>('user', 'udc');
        const password = config.get<string>('password', 'jishubu@4399.com');
        const secure = config.get<boolean>('secure', false);

        try {
            await this.client.access({ host, user, password, secure });
        } catch (error) {
            vscode.window.showErrorMessage(`FTP Connection Error: ${error.message}`);
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
                title: `Downloading ${path.basename(remotePath)}...`,
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
        try {
            await this.client.uploadFrom(localPath, remotePath);
        } catch (error) {
            console.error(`Failed to upload file: ${localPath} to ${remotePath}:`, error);
            throw error;
        }
    }

    // 上传文件夹
    public async uploadDirectory(localDir: string, remoteDir: string, progress?: vscode.Progress<{ increment: number }>) {
        try {
            await this.client.uploadFromDir(localDir, remoteDir);
        } catch (error) {
            console.error(`Failed to upload directory: ${localDir} to ${remoteDir}:`, error);
            throw error;
        }
    }

    // 创建目录，必要时递归创建父级目录
    public async createDirectory(remotePath: string): Promise<void> {
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
    private currentPath: string = '/'; // 当前刷新路径
    private currentRootPath: string = '/'; // 当前一级目录路径
    public isBusy: boolean = false;

    constructor() {
        this.ftpClient = new FTPClientWrapper();
        const config = vscode.workspace.getConfiguration('ftpClient');
        this.currentPath = this.currentRootPath = config.get<string>('path', '/');
        // 启用刷新按钮
        vscode.commands.executeCommand('setContext', 'ftpExplorer.refreshEnabled', true);
    }
    public getCurrentRootPath() {
        return this.currentRootPath;
    }

    public async downloadToDirectory(item: FtpItem) {
        const folderUris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Destination Directory'
        });

        if (folderUris && folderUris[0]) {
            const targetDir = folderUris[0].fsPath;
            const sourcePath = item.path;
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Downloading ${item.label}...`,
                cancellable: false
            }, async (progress) => {
                try {
                    if (item.isDirectory) {
                        await this.ftpClient.downloadDirectory(sourcePath, targetDir, progress);
                    } else {
                        await this.ftpClient.downloadFile(sourcePath, targetDir, progress);
                    }
                    vscode.window.showInformationMessage(`Downloaded ${item.label} to ${targetDir}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to download: ${error.message}`);
                }
            });
        }
    }

    // 设置当前路径为一级目录
    public async setRootDirectory(item: FtpItem) {
        this.currentRootPath = item.path; // 更新当前根路径
        // 更新插件配置，将当前根路径保存到 'ftpClient.path'
        const config = vscode.workspace.getConfiguration('ftpClient');
        await config.update('path', this.currentRootPath, vscode.ConfigurationTarget.Global);
        await this.refreshFTPItems(this.currentRootPath); // 刷新FTP项目 
    }

    /**
     * 刷新当前路径下的FTP目录，并更新TreeView。
     */
    async refreshFTPItems(path: string = '/'): Promise<void> {
        // 禁用刷新按钮
        vscode.commands.executeCommand('setContext', 'ftpExplorer.refreshEnabled', false);
        await this.safeExecute(async () => {
            this.currentPath = path;
            this.currentRootPath = path;
            this.isBusy = true;
            await this.loadFTPItems(this.currentPath); // 加载FTP项
            this.refresh(); // 更新TreeView
            vscode.window.showInformationMessage('FTP directory refreshed successfully'); // 刷新成功提示
        });
        // 启用刷新按钮
        vscode.commands.executeCommand('setContext', 'ftpExplorer.refreshEnabled', true);
    }

    private async safeExecute(task: () => Promise<void>): Promise<void> {
        try {
            await task();
        } catch (error) {
            vscode.window.showErrorMessage(`FTP Error: ${error.message}`);
        } finally {
            this.isBusy = false; // 确保任务完成后重置忙状态
        }
    }

    // 加载并获取当前目录下的FTP项目。
    private async loadFTPItems(path: string = '/', showPreLevel: boolean = false): Promise<FtpItem[]> {
        if (typeof path !== 'string') {
            vscode.window.showErrorMessage(`Invalid path: expected a string but got ${typeof path}`);
            return []; // 确保返回一个空数组以防止进一步错误
        }

        try {
            const items: FtpItem[] = [];
            const files = await this.ftpClient.list(path); // 从FTP服务器获取文件列表
            if (showPreLevel) {
                items.push(new FtpItem(
                    "[To Parent Directory]",
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
            vscode.window.showErrorMessage(`Failed to load items: ${error.message}`);
            return [];
        }
    }

    private getPathParentPath(path: string): string {
        // 如果路径是根路径，返回根路径本身
        if (path === '/' || path === '') {
            return '/';
        }

        // 移除路径末尾的斜杠
        if (path.endsWith('/')) {
            path = path.slice(0, -1);
        }

        // 获取最后一个斜杠的位置
        const lastSlashIndex = path.lastIndexOf('/');

        // 如果没有斜杠，返回根路径
        if (lastSlashIndex === -1) {
            return '/';
        }

        // 获取父路径
        const parentPath = path.substring(0, lastSlashIndex);

        // 如果父路径为空，返回根路径
        return parentPath === '' ? '/' : parentPath;
    }

    // 新增删除文件的方法
    public async deleteFTPItem(item: FtpItem): Promise<void> {
        if (this.isBusy) {
            vscode.window.showErrorMessage('Please wait for the current task to complete.');
            return;
        }

        const confirmDelete = await vscode.window.showWarningMessage(`Are you sure you want to delete ${item.label}?`, 'Yes', 'No');
        if (confirmDelete !== 'Yes') return;
        this.isBusy = true;
        try {
            // 调用FTP删除操作，文件或文件夹
            if (item.isDirectory) {
                await this.ftpClient.removeDirectory(item.path);
            } else {
                await this.ftpClient.removeFile(item.path);
            }
            // 删除成功提示
            vscode.window.showInformationMessage(`Successfully deleted ${item.label}`);
            // 删除成功后刷新当前目录
            await this.refreshFTPItems(this.currentPath);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete ${item.label}: ${error.message}`);
        } finally {
            this.isBusy = false;
        }
    }

    public async uploadToFTP() {
        if (this.isBusy) {
            vscode.window.showErrorMessage('Please wait for the current task to complete.');
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        const actions = ['上传文件夹', '上传文件'];
        const action = await vscode.window.showQuickPick(actions, {
            placeHolder: '选择上传操作'
        });

        const isSelectFolders = action === '上传文件夹';

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
            prompt: 'Enter the destination path on the FTP server',
            value: defaultRemotePath,
            placeHolder: 'e.g., /uploads/myfile'
        });

        if (!remotePath) return;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Uploading to ${remotePath}...`,
            cancellable: false
        }, async (progress) => {
            try {
                for (const file of selectedFiles) {
                    const localPath = file.fsPath;
                    const relativePath = path.relative(workspaceFolder, localPath);
                    const remoteTargetPath = path.posix.join(remotePath, relativePath);
                    const isDirectory = (await vscode.workspace.fs.stat(file)).type === vscode.FileType.Directory;

                    if (isDirectory) {
                        // 如果是文件夹，保持层级结构上传
                        await this.uploadDirectoryWithStructure(localPath, remotePath, progress);
                    } else {
                        // 如果是文件，直接上传文件，不保留本地目录结构
                        const fileName = path.basename(localPath);  // 仅获取文件名
                        const remoteTargetPath = path.posix.join(remotePath, fileName);  // 直接上传到指定路径
                        // 确保文件的父目录已创建
                        const remoteFileDir = path.posix.dirname(remoteTargetPath);
                        await this.ftpClient.createDirectory(remoteFileDir); // 递归创建父目录
                        await this.ftpClient.uploadFile(localPath, remoteTargetPath, progress);
                    }
                    vscode.window.showInformationMessage(`Successfully uploaded ${localPath} to ${remoteTargetPath}`);
                }
                await this.refreshFTPItems(this.currentPath);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to upload: ${error.message}`);
            } finally {
                this.isBusy = false;
            }
        });
    }


    // 递归上传文件夹并保持结构
    private async uploadDirectoryWithStructure(localPath: string, remotePath: string, progress: vscode.Progress<{ increment: number }>) {
        const fs = require('fs').promises;
        const path = require('path');

        // 创建远程路径上的文件夹
        await this.ftpClient.createDirectory(remotePath);

        // 获取本地文件夹中的文件和子文件夹
        const items = await fs.readdir(localPath, { withFileTypes: true });

        for (const item of items) {
            const itemLocalPath = path.join(localPath, item.name);
            const itemRemotePath = path.posix.join(remotePath, item.name); // 在 remotePath 上拼接

            if (item.isDirectory()) {
                // 递归上传子文件夹
                await this.uploadDirectoryWithStructure(itemLocalPath, itemRemotePath, progress);
            } else {
                // 上传文件
                await this.ftpClient.uploadFile(itemLocalPath, itemRemotePath, progress);
            }
        }
    }



    /**
     * 触发TreeView更新。
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: FtpItem): vscode.TreeItem {
        return element;
    }
    /**
     * 回到上一级
     */
    async backParentDirectory(item: FtpItem) {
        const parentPath = item.parentPath;
        await this.refreshFTPItems(parentPath);
    }
    /**
     * 获取子节点，确保每次展开文件夹时获取最新数据。
     */
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
