# Xunfeng 的运动

Garmin Connect 国际区（[garmin.com](https://connect.garmin.com)，不是佳明中国 garmin.cn）的运动看板，部署在 GitHub Pages：

https://xunfeng-1.github.io/workouts/

页面标题为「Xunfeng 的运动」，默认中文。页头和页脚可以回到 [https://xunfeng-1.github.io](https://xunfeng-1.github.io)。

同步脚本与看板来自 [yihong0618/running_page](https://github.com/yihong0618/running_page)（MIT）。看板界面沿用该项目的 dashboard 主题，视觉上也参考了 [zhaohongxuan/workouts](https://github.com/zhaohongxuan/workouts)（MIT，同样派生自 running_page）。上游许可证见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。本仓库不包含这两个项目里的个人活动、GPX 或统计 SVG。

首次同步前 `src/static/activities.json` 是空数组 `[]`，前端可以正常构建。

## 你需要手动完成的步骤

按这个顺序做。只改仓库文件不够，下面几项都在 GitHub 网站上完成。

### 1. 把 Pages 的 Source 设为 GitHub Actions

1. 打开仓库 **Settings → Pages**。
2. 在 **Build and deployment** 里，**Source** 选择 **GitHub Actions**。
3. 不要选 **Deploy from a branch**。本仓库用 `actions/upload-pages-artifact` 和 `actions/deploy-pages` 发布，源必须是 GitHub Actions。
4. 发布成功后站点是 https://xunfeng-1.github.io/workouts/ （子路径 `/workouts/`）。公开仓库可以免费使用 GitHub Pages。

合并到 `main` 后，`.github/workflows/gh-pages.yml` 会构建并部署。在 Source 改成 GitHub Actions 之前，部署步骤会失败，构建本身仍然可以成功。

### 2. 打开 Actions 的写权限

同步工作流要把新的 GPX、`src/static/activities.json` 和 `run_page/data.db` 提交回 `main`，因此需要写权限。工作流里已经声明 `permissions: contents: write`。

1. 打开 **Settings → Actions → General**。
2. 找到 **Workflow permissions**。
3. 选择 **Read and write permissions**。
4. 保存。

如果这里仍是 **Read repository contents and packages permissions**，`git push` 会被拒绝，数据不会写回仓库。

如果 `main` 开了分支保护并且禁止 GitHub Actions 推送，需要允许 `github-actions[bot]` 写入 `main`，否则同步任务无法提交。

### 3. 添加 Actions Secrets

打开 **Settings → Secrets and variables → Actions → Repository secrets → New repository secret**。

需要两个 Secret，名字必须完全一致。不要把它们写进 `config.yml` 或提交到 Git。

#### `GARMIN_SECRET_STRING`（佳明国际区登录态，不是密码）

登录已经从废弃的 `garth` 换成 `garminconnect`（>=0.3.20，用 curl_cffi 做 TLS 伪装）。佳明 / Cloudflare 从 2026-03 起会直接对 `https://sso.garmin.com/mobile/api/login` 返回 HTTP 429，旧的 garth 脚本一运行就失败。

**以前用 garth 生成的 `GARMIN_SECRET_STRING` 已经失效。** 必须用下面的命令重新生成，并在 GitHub 里覆盖原来的 Secret。

在你自己的电脑上执行。Python **3.12、3.13、3.14、3.15** 都可以（macOS 上用系统的 `python3` 即可）。不要加 `--is-cn`，那个参数会连到 garmin.cn。

```bash
git clone https://github.com/Xunfeng-1/workouts.git
cd workouts
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
pip install -r requirements.txt
python run_page/get_garmin_secret.py --help
python run_page/get_garmin_secret.py 你的佳明邮箱
```

然后：

1. 提示 `Garmin password (hidden, not saved):` 时输入佳明密码。密码不会显示，也不会进 shell 历史。请不要把密码写在命令后面。
2. 如果账号开了两步验证，终端会问 `MFA code:`，输入验证码。没开两步验证就不会问。
3. 终端最后把 secret 打到标准输出（一行 JSON，里面是 `di_token` / `di_refresh_token`）。`Copy everything below...` 和 “Tokens created with garth...” 这两句在标准错误里，不要复制。
4. 新建或更新 Secret，**Name** 填 `GARMIN_SECRET_STRING`，**Value** 粘贴整段新 secret，替换掉旧的 garth 字符串。
5. 生成后可以 `deactivate`，并考虑清掉终端滚动缓冲。不要把 secret 发给别人，也不要提交到仓库。

不推荐、但脚本仍兼容的写法（密码会出现在 shell 历史和进程列表里）：

```bash
python run_page/get_garmin_secret.py 你的佳明邮箱 '你的密码'
```

工作流里 `RUN_TYPE` 固定为 `garmin`，执行的是：

```bash
python run_page/garmin_sync.py "$GARMIN_SECRET_STRING"
```

这会请求 **garmin.com / connectapi.garmin.com**，不会加 `--is-cn`。默认同步跑步、骑行等全部活动。若只想要跑步，可在 `.github/workflows/run_data_sync.yml` 的那条命令末尾加上 `--only-run`。

如果 GitHub Actions 里同步仍然出现 **HTTP 429**（Cloudflare 按 Actions 的 IP 拦截），把 `.github/workflows/run_data_sync.yml` 里的 `USE_CLOUDFLARE_WARP` 从 `false` 改成 `true` 再提交。默认是关的。打开后，同步前会安装并连接 Cloudflare WARP，结束时断开。本机生成 secret 不需要开这个开关。

#### `MAPBOX_TOKEN`（构建时注入为 `VITE_MAPBOX_TOKEN`）

1. 打开 [Mapbox Access tokens](https://account.mapbox.com/access-tokens/) 并登录（没有账号就注册）。
2. 新建一个 token，或复制默认的 public token。它以 `pk.` 开头。
3. 建议加上 URL 限制：`https://xunfeng-1.github.io/*`。
4. 新建 Secret，**Name** 填 `MAPBOX_TOKEN`，**Value** 填这串 `pk.` token。

`.github/workflows/gh-pages.yml` 在构建时执行：

```yaml
env:
  VITE_MAPBOX_TOKEN: ${{ secrets.MAPBOX_TOKEN }}
run: PATH_PREFIX=/workouts pnpm build
```

前端从 `import.meta.env.VITE_MAPBOX_TOKEN` 读取。Secret 还没加时构建也会成功，地图改用免费底图；加上之后下一次部署会使用 Mapbox。

### 4. 跑一次同步

1. 打开 **Actions → Sync Garmin → Run workflow**（`workflow_dispatch`）。
2. 之后每天 **UTC 00:00**（北京时间 08:00）自动再跑一次。
3. 成功后工作流会把数据提交到 `main`，并接着部署 Pages。用 `GITHUB_TOKEN` 推送的提交不会再次触发「Publish GitHub Pages」，所以同步工作流自己会调用部署。
4. 代码推到 `main` 时，「Publish GitHub Pages」也会构建部署，因此没有运动数据时站点已经可以打开。

仓库如果是公开的，同步进来的轨迹也会公开。

## 本地构建

```bash
pnpm install
PATH_PREFIX=/workouts pnpm build
pnpm preview
```

可选：`VITE_MAPBOX_TOKEN=pk.xxx PATH_PREFIX=/workouts pnpm build`。

## 工作流

| 文件 | 作用 |
| --- | --- |
| `.github/workflows/run_data_sync.yml` | 每天和手动触发。`RUN_TYPE=garmin`，用新的 garminconnect secret 跑 `run_page/garmin_sync.py`，再把数据提交回仓库并部署。可选 `USE_CLOUDFLARE_WARP=true` 应对 Actions 上的 429。 |
| `.github/workflows/gh-pages.yml` | `pnpm build`（`PATH_PREFIX=/workouts`），`actions/upload-pages-artifact`，然后 `actions/deploy-pages`。 |
