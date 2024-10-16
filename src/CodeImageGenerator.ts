// codeImageGenerator.ts
import * as vscode from 'vscode';
const puppeteer = require('puppeteer');
const clipboardy = require('clipboardy');
const { exec } = require('child_process');
const fs = require('fs');

export class CodeImageGenerator {
    async generateAndCopyImageFromSelection() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor!');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text.trim()) {
            vscode.window.showErrorMessage('Selected code is empty!');
            return;
        }

        const styleOptions = ['Light', 'Dark'];
        const selectedStyle = await vscode.window.showQuickPick(styleOptions, {
            placeHolder: 'Choose a style for the image'
        });

        if (!selectedStyle) {
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Converting code to image...",
            cancellable: false
        }, async () => {
            try {
                const style = selectedStyle.toLowerCase();
                const base64Image = await this.convertToImage(text, style);
                await this.copyToClipboard(base64Image);
                vscode.window.showInformationMessage('Image copied to clipboard!');
            } catch (error: any) {
                console.error(error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        });
    }

    async convertToImage(code: string, style: string): Promise<string> {
        const escapedCode = this.escapeHtml(code);
        const browser = await puppeteer.launch({ headless: false });
        const page = (await browser.pages())[0];
        const highlightedCode = `<pre style="white-space: pre-wrap;"><code>${escapedCode}</code></pre>`;
        const htmlContent = `
          <html>
              <head>
                  <link rel="stylesheet" href="${style === 'dark' ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.3.1/styles/github-dark.min.css' : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.3.1/styles/github.min.css'}">
                  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.3.1/highlight.min.js"></script>
                  <script>hljs.initHighlightingOnLoad();</script>
              </head>
              <body style="margin: 0">${highlightedCode}</body>
          </html>
        `;
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const dimensions = await page.evaluate(() => {
            const pre = document.querySelector('pre');
            return {
                width: pre?.offsetWidth || 0,
                height: pre?.offsetHeight || 0,
            };
        });

        await page.setViewport({
            width: dimensions.width,
            height: dimensions.height,
            deviceScaleFactor: 2
        });

        const base64Image = await page.screenshot({ encoding: 'base64' });
        await browser.close();
        return `data:image/png;base64,${base64Image}`;
    }

    async copyToClipboard(base64Image: string): Promise<void> {
        const imageData = base64Image.split(',')[1];
        const buffer = Buffer.from(imageData, 'base64');
        const tempFilePath = `${process.cwd()}/tempImage.png`;

        await new Promise<void>((resolve, reject) => {
            fs.writeFile(tempFilePath, buffer, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        const platform = process.platform;
        let copyCommand: string;
        if (platform === 'win32') {
            copyCommand = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${tempFilePath}'))"`;
        } else if (platform === 'darwin') {
            copyCommand = `osascript -e 'set the clipboard to (read (POSIX file "${tempFilePath}") as «class PNG»)'`;
        } else {
            copyCommand = `xclip -selection clipboard -t image/png -i ${tempFilePath}`;
        }

        return new Promise((resolve, reject) => {
            exec(copyCommand, (error: any) => {
                if (error) {
                    return reject(error);
                }
                resolve();
            });
        });
    }

    private escapeHtml(code: string): string {
        return code
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
