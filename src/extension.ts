import * as vscode from 'vscode';
import { CNBDevAPI } from './api';
import * as path from 'path';
import * as fs from 'fs';

const TOKEN_KEY = 'cnbDev.token';
const DEFAULT_REPO_KEY = 'cnbDev.defaultRepo';


function getSSHUrlSchema(): string{
    const appName = vscode.env.appName.toLowerCase();
    console.log("appName--->",appName)
    if(appName.includes('cursor')){
        return 'cursor://'
    }
    if(appName.includes('codebuddy')){
        return 'codebuddy://'
    }
    return 'vscode://'
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
                    case 'setDefaultRepo':
                        const repo = message.repo;
                        this.context.globalState.update(DEFAULT_REPO_KEY, repo);
                        webviewView.webview.postMessage({
                            command: 'setDefaultRepoSuccess',
                            eventid: message.eventid
                        });
                        break;
                    case 'cancelSetDefaultRepo':
                        this.context.globalState.update(DEFAULT_REPO_KEY, '');
                        webviewView.webview.postMessage({
                            command: 'cancelSetDefaultRepo',
                            eventid: message.eventid
                        });
                        break;
                    case 'getDefaultRepo':
                        const defaultRepo = this.context.globalState.get<string>(DEFAULT_REPO_KEY);
                        webviewView.webview.postMessage({
                            command: 'getDefaultRepo',
                            defaultRepo: defaultRepo,
                            eventid: message.eventid
                        });
                        break;
                    case 'syncImage':
                        token = this.context.globalState.get<string>(TOKEN_KEY);
                        if (!token) throw new Error('Token not found');
                        const source = message.source;
                        const target = message.target;
                        const arch = message.arch;
                        const syncResult = await new CNBDevAPI(token).syncImage(source, target, arch, 
                            function(sn:string){
                                webviewView.webview.postMessage({
                                    command: 'syncImageSuccess_getsn',
                                    sn: sn,
                                    autoDelete: false,
                                    eventid: message.eventid
                                });
                            });
                        webviewView.webview.postMessage({
                            command: 'syncImageSuccess',
                            newImage: syncResult.newImage,
                            error: syncResult.error,
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

                        // 直接使用页面传过来的参数
                        const selectedArch = message.selectedArch;
                        const selectedCpu = message.selectedCpu || 0;
                        
                        // 如果没有提供必要参数，返回错误
                        if (!selectedArch) {
                            webviewView.webview.postMessage({
                                command: 'cnbStartFailed',
                                eventid: message.eventid,
                                error: '缺少必要参数: 环境架构'
                            });
                            break;
                        }

                        const sshUrl = await new CNBDevAPI(token).startEnvironment(
                            message.repoId,
                            message.branch,
                            selectedCpu,
                            selectedArch
                        );

                        if (!sshUrl.cursor && !sshUrl.vscode) {
                            webviewView.webview.postMessage({
                                command: 'cnbStartFailed',
                                eventid: message.eventid
                            });
                            throw new Error('启动云开发成功,但是未能远程连接,这可能是您自定义了开发环境,但是并未安装openssh服务');
                        } else {
                            let url = sshUrl.vscode.replace('vscode://', getSSHUrlSchema())
                            await vscode.env.openExternal(vscode.Uri.parse(url));

                            webviewView.webview.postMessage({
                                command: 'cnbStartSuccess',
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