import * as vscode from 'vscode';
import { localize } from 'vscode-nls-i18n';
import { exec } from 'child_process';

export class BrowserOpener {
    constructor() { }

    public openUrlInBrowser(item: { path: string }): void {
        const config = vscode.workspace.getConfiguration('ftpClient');
        const baseUrl = config.get<string>('baseUrl', 'http://192.168.63.174');
        const url = `${baseUrl}${item.path}`;
        const browserOpener = new BrowserOpener();
        // if (url.endsWith('.html')) {
        try {
            this.open(encodeURI(url));
        } catch (err) {
            vscode.window.showErrorMessage(`${localize('ftpExplorer.previewHtml.errorMessage')}${err.message}`);
        }
        // } else {
        //     vscode.window.showWarningMessage(localize('ftpExplorer.previewHtml.notHtmlWarning'));
        // }
    }

    private open(url: string) {
        const platform = process.platform;

        let command: string;
        switch (platform) {
            case 'win32':
                command = `start ${url}`;
                break;
            case 'darwin':
                command = `open ${url}`;
                break;
            case 'linux':
                command = `xdg-open ${url}`;
                break;
            default:
                throw new Error('Unsupported platform: ' + platform);
        }
        exec(command, (error) => {
            if (error) {
                vscode.window.showErrorMessage(localize('ftpExplorer.openBrowser.errorMessage', error.message));
            }
        });
    }
}
