import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
export default class RecentFilesTreeDataProvider implements vscode.TreeDataProvider<vscode.Uri> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.Uri | undefined | null | void> = new vscode.EventEmitter<vscode.Uri | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.Uri | undefined | null | void> = this._onDidChangeTreeData.event;

    private refreshTimeout: NodeJS.Timeout | undefined;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    private todayModifyItem: vscode.Uri[] = [];
    private pushTodyModifyItem(item: vscode.Uri) {
        // 以 item.resourceUri?.fsPath 为唯一标识去重
        const exists = this.todayModifyItem.some(i => i.fsPath === item.fsPath);
        if (!exists) {
            this.todayModifyItem.push(item);
        }
    }

    public getTodayModifyItem(): vscode.Uri[] {
        return this.todayModifyItem;
    }

    // 添加节流刷新方法
    throttledRefresh(): void {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        this.refreshTimeout = setTimeout(() => {
            this.refresh();
        }, 1000); // 1 秒节流
    }

    async getTreeItem(element: vscode.Uri): Promise<vscode.TreeItem> {
        const treeItem = new vscode.TreeItem(
            element.fsPath.split(path.sep).pop() || '',
            vscode.TreeItemCollapsibleState.None
        );
        treeItem.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [element]
        };

        // 设置鼠标悬浮时显示完整路径
        treeItem.tooltip = element.fsPath;

        try {
            const stat = await fs.promises.stat(element.fsPath);
            const mtime = new Date(stat.mtimeMs);
            const now = new Date();
            const diffMs = now.getTime() - mtime.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            if (mtime.toDateString() === now.toDateString()) {
                treeItem.description = ` \u21BB ${mtime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                this.pushTodyModifyItem(element);
                console.log("todayModifyItem", this.todayModifyItem);
            } else if (diffDays < 7) {
                treeItem.description = ` \u21BB ${mtime.toLocaleDateString([], { month: '2-digit', day: '2-digit' })}`;
            }
        } catch (error) {
            console.error(`Error getting file stats for ${element.fsPath}:`, error);
        }

        return treeItem;
    }

    async getChildren(element?: vscode.Uri): Promise<vscode.Uri[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        // 获取ignore 配置
        const config = vscode.workspace.getConfiguration('ftpClient');
        const ignorePattern = config.get<string>('7.ignore', '');
        const regex = ignorePattern ? new RegExp(ignorePattern) : null;
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const files = await this.getFilesRecursively(workspaceRoot, regex); // 传递正则表达式
        const fileStats = await Promise.all(files.map(file => this.getFileStat(file)));
        const sortedFiles = fileStats.sort((a, b) => b.mtimeMs - a.mtimeMs).map(stat => vscode.Uri.file(stat.path));
        return sortedFiles;
    }

    private async getFilesRecursively(dir: string, regex: RegExp | null): Promise<string[]> {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(entries.map(entry => {
            const fullPath = path.join(dir, entry.name);
            // 忽略符合正则规则的文件或目录
            if (regex && regex.test(entry.name)) { 
                console.log(`Ignoring file or directory: ${entry.name}`); 
                return [];
            }

            return entry.isDirectory() ? this.getFilesRecursively(fullPath, regex) : [fullPath];
        }));
        return files.flat();
    }

    private async getFileStat(filePath: string): Promise<{ path: string; mtimeMs: number }> {
        const stat = await fs.promises.stat(filePath);
        return { path: filePath, mtimeMs: stat.mtimeMs };
    }
}
