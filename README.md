# CNB VSCODE Plugin

一个用于管理 CNB (https://cnb.cool) 云开发环境的 VS Code 插件。

此插件可以帮助你在VSCODE中快速启动和连接CNB云开发环境，支持 VS Code 和 Cursor IDE。

## 功能特性

- 🔑 CNB Token 管理
  - 安全存储和验证 CNB API Token
  - 支持重置 Token
- 📚 仓库管理
  - 查看所有可访问的仓库列表
  - 显示仓库详细信息（描述、Star数、Fork数）
  - 支持私有仓库标识
  - 支持创建新仓库
    - 设置仓库名称和描述
    - 配置仓库权限（公开/私有）
    - [重磅] 支持创建的时候指定导入仓库
- 🌲 分支管理
  - 查看仓库的所有分支
  - 显示分支最新提交信息
- ☁️ 云开发环境
  - 一键启动云开发环境
  - 支持自定义 CPU 配置（1-64核）
  - 自动适配 VS Code 和 Cursor IDE

## 前置要求

1. VS Code 或 Cursor IDE
2. Remote SSH 插件
3. CNB Token（需要以下权限）：
   - `account-engage`（只读）- 用于读取用户仓库列表
   - `repo-code`（读写）- 用于读取/创建仓库和分支
   - `repo-cnb-trigger`（读写）- 用于启动云开发环境
   - `repo-cnb-detail`（只读）- 用于获取云开发环境链接
   - `group-resource`（读写）- 用于创建新仓库

## 安装

### 方式一：从 VS Code 插件市场安装（推荐）

1. 打开 VS Code
2. 点击左侧扩展图标或使用快捷键 `Ctrl+Shift+X` (`Cmd+Shift+X` on Mac)
3. 在搜索框中输入 "CNB Dev"
4. 点击安装

### 方式二：从 Release 安装 VSIX 文件

1. 从 [Release 页面](https://cnb.cool/xiaofei/cnb-vscode-plugin/-/releases) 下载最新的 `.vsix` 文件
2. 在 VS Code/Cursor 中:
   - 按 `Ctrl+Shift+P` (`Cmd+Shift+P` on Mac) 打开命令面板
   - 输入 "Install from VSIX"
   - 选择下载的 `.vsix` 文件
3. 重启 VS Code/Cursor

注意：
- VS Code 插件市场安装方式仅支持 VS Code
- VSIX 安装方式同时支持 VS Code 和 Cursor IDE
- 建议定期检查更新以获取最新功能

## 使用说明

1. **设置 Token**
   - 打开 CNB 的 [Token 设置页面](https://cnb.cool/profile/token)
   - 创建具有所需权限的 Token
   - 在插件中点击 "设置 CNB Token" 并输入

2. **创建新仓库**
   - 点击创建新仓库按钮
   - 填写仓库名称（必填）和描述
   - 选择仓库权限（公开/私有）
   - 可选：填写导入仓库地址
   - 点击创建按钮

3. **启动云开发环境**
   - 在仓库列表中选择目标仓库
   - 选择所需分支
   - 点击启动按钮
   - 选择 CPU 配置
   - 等待环境启动完成

## 注意事项

- Token 会被安全存储在 VS Code 的全局存储中
- 确保有足够的权限访问目标仓库
- CPU 配置会影响云开发环境的性能和成本

## 常见问题

1. **Token 无效？**
   - 检查 Token 是否具有所需权限
   - 确认 Token 未过期
   - 可以尝试重置 Token

2. **环境启动失败？**
   - 确认网络连接正常
   - 检查仓库和分支权限
   - 查看是否有足够的资源配额

3. **仓库创建失败？**
   - 确认 Token 具有 group-resource 权限
   - 检查仓库名称是否合法
   - 确认导入仓库地址（如有）是否有效

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

[MIT License](https://cnb.cool/xiaofei/cnb-vscode-plugin/-/blob/master/LICENSE)