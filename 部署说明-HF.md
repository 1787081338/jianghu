# 部署到 Hugging Face Spaces（免费、无需信用卡）

## 步骤

1. 注册 https://huggingface.co/join （邮箱即可）
2. 右上头像 → **New Space**
   - Space name: `jianghu`
   - License: 随便
   - SDK: **Docker**
   - Template: **Blank**
   - 可见性: **Public**
   - 点 **Create Space**
3. 进入 Space → **Files** 标签 → **Add file** → **Create a new file**
   - 文件名：`Dockerfile`（注意没有后缀）
   - 内容粘贴仓库里的 `Dockerfile.hf` 全文
   - 提交
4. Space → **Settings** → **Variables and secrets** → **New secret**
   - Name: `GH_TOKEN`
   - Value: 你的 GitHub 令牌（ghp_ 开头）
5. 等待构建（3~5 分钟），状态变 Running 后打开：
   `https://<你的用户名>-jianghu.hf.space`

## 说明
- 免费 CPU 实例，闲置一段时间会休眠，访问时自动唤醒（约 30 秒）
- 存档通过 `GH_TOKEN` 同步到私有仓库 `jianghu-data`，重启不丢
- 端口固定 7860（Hugging Face 要求）
