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

        try {
            await this.client.access({
                host: "192.168.63.174",
                user: "udc",
                password: "jishubu@4399.com",
                secure: false
            });
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
        // 启用刷新按钮
        vscode.commands.executeCommand('setContext', 'ftpExplorer.refreshEnabled', true);
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
            this.currentRootPath =path;
            this.isBusy = true;
            await this.loadFTPItems(); // 加载FTP项
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
    private async loadFTPItems(path: string = '/'): Promise<FtpItem[]> {
        if (typeof path !== 'string') {
            vscode.window.showErrorMessage(`Invalid path: expected a string but got ${typeof path}`);
            return []; // 确保返回一个空数组以防止进一步错误
        }

        try {
            const items: FtpItem[] = [];
            const files = await this.ftpClient.list(path); // 从FTP服务器获取文件列表
            items.push(...files.map(file => new FtpItem(
                file.name,
                path === '/' ? `/${file.name}` : `${path}/${file.name}`,
                file.isDirectory
            )));

            return items;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load items: ${error.message}`);
            return [];
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
     * 获取子节点，确保每次展开文件夹时获取最新数据。
     */
    async getChildren(element?: FtpItem): Promise<FtpItem[]> {
        if (!element) {
            return this.loadFTPItems(this.currentPath); // 根目录
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
        public readonly isDirectory: boolean
    ) {
        super(
            label,
            isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        this.command = isDirectory ? undefined : {
            command: 'ftpExplorer.openFile',
            title: 'Open File',
            arguments: [this.path]
        };

        this.contextValue = isDirectory ? 'folder' : 'file';
    }
}
