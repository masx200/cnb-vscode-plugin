import * as vscode from 'vscode';
import { CNBDevAPI } from './api';
import * as path from 'path';
import * as fs from 'fs';

const TOKEN_KEY = 'cnbDev.token';

function isCursor(): boolean {
    const appName = vscode.env.appName;
    return appName.toLowerCase().includes('cursor');
}

class CNBDevViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) { }

    private async validateAndSaveToken(token: string): Promise<boolean> {
        try {
            const api = new CNBDevAPI(token);
            const isValid = await api.validateToken();
            if (isValid) {
                await this.context.globalState.update(TOKEN_KEY, token);
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    private async requestToken(): Promise<boolean> {
        const token = await vscode.window.showInputBox({
            prompt: "Please enter your CNB Development API token",
            password: true,
            ignoreFocusOut: true,
            placeHolder: "Enter your token"
        });

        if (token) {
            const isValid = await this.validateAndSaveToken(token);
            if (!isValid) {
                vscode.window.showErrorMessage('Invalid token');
                return await this.requestToken();
            } else {
                return true;
            }
        }
        return false;
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        const vueUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'vue.js')
        );
        const eventUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'event.js')
        );
        const cssUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'main.css')
        );

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.extensionUri.fsPath, 'src', 'webview'))
            ]
        };

        // 设置 WebView 内容
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'main.html');
        let html = fs.readFileSync(htmlPath, 'utf-8');
        html = html.replace('${vueUri}', vueUri.toString());
        html = html.replace('${cssUri}', cssUri.toString());
        html = html.replace('${eventUri}', eventUri.toString());

        webviewView.webview.html = html;

        // 处理来自 WebView 的消息
        webviewView.webview.onDidReceiveMessage(async (message) => {
            try {
                let token: string | undefined;
                switch (message.command) {
                    case 'hello':
                        token = this.context.globalState.get<string>(TOKEN_KEY);
                        if (token) {
                            const isValid = await this.validateAndSaveToken(token);
                            if (isValid) {
                                webviewView.webview.postMessage({
                                    command: 'tokenIsReady',
                                    eventid: message.eventid
                                });
                                break
                            }
                        }
                        webviewView.webview.postMessage({
                            command: 'tokenIsNotReady',
                            eventid: message.eventid
                        });
                        break;
                    case 'setToken':
                        let isSet = await this.requestToken();
                        if (isSet) {
                            webviewView.webview.postMessage({
                                command: 'tokenIsReady',
                                eventid: message.eventid
                            });
                        } else {
                            webviewView.webview.postMessage({
                                command: 'tokenIsNotReady',
                                eventid: message.eventid
                            });
                        }
                        break;
                    case 'resetToken':
                        this.context.globalState.update(TOKEN_KEY, '');
                        webviewView.webview.postMessage({
                            command: 'tokenIsNotReady',
                            eventid: message.eventid
                        });
                        break;
                    case 'getRepositories':
                        token = this.context.globalState.get<string>(TOKEN_KEY);
                        if (!token) throw new Error('Token not found');
                        const repos = await new CNBDevAPI(token).getRepositories(message.page, message.page_size);
                        webviewView.webview.postMessage({
                            command: 'repositoriesFetched',
                            repositories: repos,
                            eventid: message.eventid
                        });
                        break;

                    case 'getBranches':
                        token = this.context.globalState.get<string>(TOKEN_KEY);
                        if (!token) throw new Error('Token not found');
                        const branches = await new CNBDevAPI(token).getBranches(message.repoId, message.page, message.page_size);
                        webviewView.webview.postMessage({
                            command: 'branchesFetched',
                            branches: branches,
                            repoId: message.repoId,
                            eventid: message.eventid
                        });
                        break;

                    case 'startEnvironment':
                        token = this.context.globalState.get<string>(TOKEN_KEY);
                        if (!token) throw new Error('Token not found');

                        // 定义 CPU 选项
                        const cpuOptions = [
                            { label: '1 CPU', value: 1 },
                            { label: '2 CPUs', value: 2 },
                            { label: '4 CPUs', value: 4 },
                            { label: '8 CPUs', value: 8 },
                            { label: '16 CPUs', value: 16 },
                            { label: '32 CPUs', value: 32 },
                            { label: '64 CPUs', value: 64 }
                        ];

                        let selectedCpu = await vscode.window.showQuickPick(cpuOptions, {
                            placeHolder: '请选择云开发所使用的CPU数量',
                            title: '云开发CPU数量配置'
                        });

                        if (selectedCpu) {
                            const sshUrl = await new CNBDevAPI(token).startEnvironment(
                                message.repoId,
                                message.branch,
                                selectedCpu.value,
                            );

                            if (!sshUrl.cursor && !sshUrl.vscode) {
                                webviewView.webview.postMessage({
                                    command: 'cnbStartFailed',
                                    eventid: message.eventid
                                });
                                throw new Error('启动云开发成功,但是未能远程连接,这可能是您自定义了开发环境,但是并未安装openssh服务');
                            } else {
                                if (isCursor()) {
                                    await vscode.env.openExternal(vscode.Uri.parse(sshUrl.cursor));
                                } else {
                                    await vscode.env.openExternal(vscode.Uri.parse(sshUrl.vscode));
                                }
                                webviewView.webview.postMessage({
                                    command: 'cnbStartSuccess',
                                    eventid: message.eventid
                                });
                            }


                        } else {
                            webviewView.webview.postMessage({
                                command: 'cancelCNBStart',
                                eventid: message.eventid
                            });
                        }


                        break;

                    case 'getGroupList':
                        token = this.context.globalState.get<string>(TOKEN_KEY);
                        if (!token) throw new Error('Token not found');
                        const groups = await new CNBDevAPI(token).getGroupList();
                        webviewView.webview.postMessage({
                            command: 'groupListFetched',
                            groups: groups,
                            eventid: message.eventid
                        });
                        break;
                    case 'getSubGroupList':
                        token = this.context.globalState.get<string>(TOKEN_KEY);
                        if (!token) throw new Error('Token not found');
                        const subGroups = await new CNBDevAPI(token).getSubGroupList(message.groupName);
                        webviewView.webview.postMessage({
                            command: 'subGroupListFetched',
                            groups: subGroups,
                            eventid: message.eventid
                        });
                        break;
                    case 'getTemplateRepoList':
                        token = this.context.globalState.get<string>(TOKEN_KEY);
                        if (!token) throw new Error('Token not found');
                        const templateRepos = await new CNBDevAPI(token).getTemplateRepoList();
                        webviewView.webview.postMessage({
                            command: 'templateRepoListFetched',
                            templateRepos: templateRepos,
                            eventid: message.eventid
                        });
                        break;
                    case 'createNewRepo':
                        token = this.context.globalState.get<string>(TOKEN_KEY);
                        if (!token) throw new Error('Token not found');
                        try {
                            const repo = await new CNBDevAPI(token).createRepository(message.groupName, message);
                            webviewView.webview.postMessage({
                                command: 'createNewRepoSuccess',
                                repo: repo,
                                eventid: message.eventid
                            });
                        } catch (error) {
                            webviewView.webview.postMessage({
                                command: 'createNewRepoFailed',
                                eventid: message.eventid
                            });
                        }

                        break;
                }
            } catch (error) {
                vscode.window.showErrorMessage((error as Error).message);
                webviewView.webview.postMessage({
                    command: 'error',
                    message: (error as Error).message
                });
            }
        });
    }
}

export function activate(context: vscode.ExtensionContext) {
    const provider = new CNBDevViewProvider(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "cnbDev.environmentView",
            provider
        )
    );
}

export function deactivate() { }