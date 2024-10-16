import * as vscode from 'vscode';
import * as ftp from 'basic-ftp';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

class FTPClientWrapper {
    private client: ftp.Client;
    constructor() {
        this.client = new ftp.Client();
        this.client.ftp.verbose = true;
    }

    async connect() {
        if (!this.client.closed) return;

        try {
            await this.client.access({
                host: "192.168.63.174",
                user: "udc",
                password: "jishubu@4399.com",
                secure: false
            });
        } catch (error) {
            vscode.window.showErrorMessage(`FTP Connection Error: ${error.message}`);
        }
    }

    async list(directoryPath: string = '/') {
        await this.connect();
        return this.client.list(directoryPath);
    }

    // 带进度条的下载方法
    public async downloadToTempFile(remotePath: string): Promise<string> {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Downloading ${path.basename(remotePath)}...`,
                cancellable: false
            },
            async (progress) => {
                await this.connect();
                const tempFilePath = path.join(os.tmpdir(), path.basename(remotePath));

                // 添加进度回调函数
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

    close() {
        this.client.close();
    }
}

export class FtpTreeProvider implements vscode.TreeDataProvider<FtpItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FtpItem | undefined> = new vscode.EventEmitter<FtpItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<FtpItem | undefined> = this._onDidChangeTreeData.event;

    public ftpClient: FTPClientWrapper;

    constructor() {
        this.ftpClient = new FTPClientWrapper();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    async loadFTPItems(path: string = '/') {
        const files = await this.ftpClient.list(path);
        return files.map(file => new FtpItem(file.name, path === '/' ? `/${file.name}` : `${path}/${file.name}`, file.isDirectory));
    }

    getTreeItem(element: FtpItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: FtpItem): Promise<FtpItem[]> {
        if (!element) {
            // 加载根目录的内容
            return this.loadFTPItems();
        } else if (element.isDirectory) {
            // 加载被点击文件夹下的子目录
            return this.loadFTPItems(element.path);
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


