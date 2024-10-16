import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class FileHandler {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        // 创建状态栏项，并将其初始化为隐藏
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.hide();
    }

    // 打开文件并在异步加载时显示进度条
    public async openFile(filePath: string): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: "Opening File...",
                cancellable: false
            },
            async () => {
                this.displayFileMetadata(filePath); // 显示文件元数据

                if (this.isImageFile(filePath) || this.isSvgFile(filePath) || this.isVideoFile(filePath)) {
                    await this.showMediaInWebView(filePath);
                } else {
                    const document = await vscode.workspace.openTextDocument(filePath);
                    vscode.window.showTextDocument(document);
                }
            }
        );
    }

    // 显示文件大小和修改日期
    private displayFileMetadata(filePath: string): void {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                vscode.window.showErrorMessage(`Error retrieving file metadata: ${err.message}`);
                return;
            }

            const fileSize = this.formatFileSize(stats.size);
            // const modifiedDate = stats.mtime.toLocaleDateString();
            // const modifiedTime = stats.mtime.toLocaleTimeString();

            // 设置状态栏内容并显示
            this.statusBarItem.text = `Size: ${fileSize}`;
            this.statusBarItem.show();
        });
    }

    // 文件大小格式化
    private formatFileSize(sizeInBytes: number): string {
        if (sizeInBytes < 1024) return `${sizeInBytes} B`;
        const units = ['KB', 'MB', 'GB'];
        let size = sizeInBytes / 1024;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    // 判断文件是否是图片类型
    private isImageFile(filePath: string): boolean {
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
        return imageExtensions.includes(path.extname(filePath).toLowerCase());
    }

    // 判断文件是否是 SVG 类型
    private isSvgFile(filePath: string): boolean {
        return path.extname(filePath).toLowerCase() === '.svg';
    }

    // 判断文件是否是视频类型
    private isVideoFile(filePath: string): boolean {
        const videoExtensions = ['.mp4', '.webm', '.ogg'];
        return videoExtensions.includes(path.extname(filePath).toLowerCase());
    }

    // 在 WebView 中显示媒体文件
    private async showMediaInWebView(filePath: string): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'mediaPreview',
            path.basename(filePath),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.dirname(filePath))]
            }
        );

        const mediaUri = panel.webview.asWebviewUri(vscode.Uri.file(filePath));

        if (this.isSvgFile(filePath)) {
            panel.webview.html = this.getSvgHtmlContent(mediaUri);
        } else if (this.isVideoFile(filePath)) {
            panel.webview.html = this.getVideoHtmlContent(mediaUri);
        } else {
            panel.webview.html = this.getImageHtmlContent(mediaUri);
        }
    }

    // 生成包含 SVG 的 HTML 内容
    private getSvgHtmlContent(svgUri: vscode.Uri): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>SVG Preview</title>
        </head>
        <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
            <img src="${svgUri}" style="max-width: 100%; max-height: 100%;" />
        </body>
        </html>`;
    }

    // 生成包含视频的 HTML 内容
    private getVideoHtmlContent(videoUri: vscode.Uri): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Video Preview</title>
        </head>
        <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
            <video controls autoplay style="max-width: 100%; max-height: 100%;">
                <source src="${videoUri}" type="video/${path.extname(videoUri.path).substring(1)}">
                Your browser does not support the video tag.
            </video>
        </body>
        </html>`;
    }

    // 生成包含图片的 HTML 内容
    private getImageHtmlContent(imageUri: vscode.Uri): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Image Preview</title>
        </head>
        <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
            <img src="${imageUri}" style="max-width: 100%; max-height: 100%;" />
        </body>
        </html>`;
    }
}
