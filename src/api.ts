import axios from 'axios';

// 配置API基础URL
const API_BASE_URL = 'https://api.cnb.cool';

// 定义接口类型
export interface Repository {
    id: string;
    name: string;
    web_url: string;
    description: string;
}

export interface Branch {
    name: string;
    commit: string;
}

export interface Environment {
    id: string;
    repositoryName: string;
    branch: string;
    createdAt: string;
    status: string;
}

export interface RemoteSSHInfo {
    vscode: string;
    cursor: string;
}

export interface CreateRepositoryParams {
    name: string;
    description: string;
    visibility: boolean;
    import: string;
}

export interface Group {
    name: string;
    path: string;
    access_role: string;
}

// API类
export class CNBDevAPI {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    private get headers() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    // 验证token
    async validateToken(): Promise<boolean> {
        try {
            await axios.get(`${API_BASE_URL}/user/repos?page=1&page_size=1&desc=false`, { headers: this.headers });
            return true;
        } catch (error) {
            return false;
        }
    }

    // 获取仓库列表
    async getRepositories(page: number, page_size: number): Promise<Repository[]> {
        try {
            const response = await axios.get(`${API_BASE_URL}/user/repos?page=${page}&page_size=${page_size}&desc=false`, { headers: this.headers });
            return response.data;
        } catch (error) {
            throw new Error('Failed to fetch repositories');
        }
    }

    // 获取分支列表
    async getBranches(repoId: string, page: number, page_size: number): Promise<Branch[]> {
        try {
            let url = `${API_BASE_URL}/${repoId}/-/git/branches?page=${page}&page_size=${page_size}`;
            const response = await axios.get(
                url,
                { headers: this.headers }
            );
            return response.data;
        } catch (error) {
            throw new Error('Failed to fetch branches');
        }
    }

    // 启动新环境
    async startEnvironment(repoId: string, branch: string, cpus: number): Promise<RemoteSSHInfo> {
        try {
            const response = await axios.post(`${API_BASE_URL}/${repoId}/-/build/start`,
                {
                    branch: branch,
                    event: "api_trigger_cnb_dev_plugin",
                    config: `
.vscode: &vscode
  api_trigger_cnb_dev_plugin:
    clouddev:
      docker:
        build: .ide/Dockerfile
        image: cnbcool/default-dev-env:latest
      runner:
        cpus: ${cpus}
      services:
        - vscode
        - docker
include:
  - config:
      $: *vscode
  - path: .cnb.yml
    ignoreError: true`
                },
                { headers: this.headers });

            const data = response.data;
            const sn = data.sn;

            // 获取启动状态,如果返回的是pengding,则需要轮询获取启动状态
            let status = await this.getStartStatus(repoId, sn);
            while (status === "pending") {
                // 休眠1秒
                await new Promise(resolve => setTimeout(resolve, 1000));
                status = await this.getStartStatus(repoId, sn);
            }

            // 获取远程ssh信息
            const sshInfo = await this.getRemoteSSHInfo(repoId, sn);

            return sshInfo;
        }
        catch (error) {
            throw new Error('Failed to start environment');
        }
    }

    // 导入仓库后获取导入状态
    async getImportStatus(repoId: string, sn: string): Promise<string> {
        try {
            const response = await axios.get(`${API_BASE_URL}/${repoId}/-/build/status/${sn}`, { headers: this.headers });
            return response.data.status;
        } catch (error) {
            throw new Error('Failed to get import status');
        }
    }

    // 导入仓库
    async importRepository(repoId: string, url: string): Promise<string> {
        try {
            const response = await axios.post(`${API_BASE_URL}/${repoId}/-/build/start`,
                {
                    branch: 'main',
                    event: "api_trigger_cnb_dev_plugin_import",
                    config: `
main:
  api_trigger_cnb_dev_plugin_import:
    - docker: 
        image: cnbcool/default-dev-env:latest
      stages:
        - name: import repository
          script: cnb-init-from-without-lfs ${url}
`
                },
                { headers: this.headers });

            const data = response.data;
            const sn = data.sn;

            // 获取启动状态,如果返回的是pengding,则需要轮询获取启动状态
            let status = await this.getImportStatus(repoId, sn);
            while (status === "pending") {
                // 休眠1秒
                await new Promise(resolve => setTimeout(resolve, 1000));
                status = await this.getImportStatus(repoId, sn);
            }

            return status;
        }
        catch (error) {
            throw new Error('Failed to start environment');
        }
    }

    // 启动环境后获取启动状态
    async getStartStatus(repoid: string, sn: string): Promise<string> {
        try {
            const response = await axios.get(`${API_BASE_URL}/${repoid}/-/build/status/${sn}`, { headers: this.headers });
            const data = await response.data;
            if (data.status === "pending") {
                let pipline: any = Object.values(data.pipelinesStatus)[0]
                if (pipline.status === "pending") {
                    if (pipline.stages[0].status === "success") {
                        return "success"
                    }
                }
            }
            return "pending"
        } catch (error) {
            throw new Error('Failed to get environment info');
        }
    }

    async getGroupList(): Promise<Group[]> {
        try {
            const response = await axios.get(`${API_BASE_URL}/user/groups?page=1&page_size=10&role=Owner`, { headers: this.headers });
            return response.data;
        } catch (error) {
            throw new Error('Failed to get group list');
        }
    }

    async getSubGroupList(groupName: string): Promise<Group[]> {
        try {
            const response = await axios.get(`${API_BASE_URL}/user/groups/${groupName}?page=1&page_size=100`, { headers: this.headers });
            return response.data;
        } catch (error) {
            throw new Error('Failed to get sub group list');
        }
    }

    // 创建新仓库
    async createRepository(groupName: string, params: CreateRepositoryParams): Promise<void> {
        try {
            await axios.post(`${API_BASE_URL}/${groupName}/-/repos`, {
                "description": params.description,
                "name": params.name,
                "visibility": params.visibility
            }, { headers: this.headers });

            if (params.import) {
                // 导入仓库
                try {
                    // 尽力就好，不需要成功
                    await this.importRepository(`${groupName}/${params.name}`, params.import);
                } catch (error) {
                    // 尽力了
                    console.log(error);
                }
            }
        } catch (error) {
            throw new Error('Failed to create repository');
        }
    }

    // 启动环境后根据sn获取远程ssh信息
    async getRemoteSSHInfo(repoid: string, sn: string): Promise<RemoteSSHInfo> {
        try {
            const response = await axios.get(`${API_BASE_URL}/${repoid}/-/workspace/detail/${sn}`, { headers: this.headers });
            return response.data;
        } catch (error) {
            throw new Error('Failed to get environment info');
        }
    }

    async getTemplateRepoList(): Promise<Repository[]> {
        try {
            const response = await axios.get(`${API_BASE_URL}/xiaofei/cnb_plugin_template/-/repos?page=1&page_size=1000&desc=true`, { headers: this.headers });
            return response.data;
        } catch (error) {
            throw new Error('Failed to get template list');
        }
    }
}