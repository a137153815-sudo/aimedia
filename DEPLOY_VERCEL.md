# Vercel 部署步骤

## 1. 本地初始化 Git

在 `aimedia` 目录执行：

```powershell
git init
git config user.name "你的名字"
git config user.email "你的邮箱"
git add .
git commit -m "chore: prepare vercel deployment"
```

如果你不想改全局配置，上面这两条会只写入当前项目。

## 2. 上传到 GitHub

在 GitHub 新建一个空仓库后，执行：

```powershell
git remote add origin <你的仓库地址>
git branch -M main
git push -u origin main
```

## 3. 在 Vercel 导入仓库

- 选择刚上传的 GitHub 仓库
- 如果你上传的是上层仓库而不是 `aimedia` 单独仓库：
  - 把 `Root Directory` 设为 `aimedia`

## 4. 配置环境变量

至少配置：

- `GEMINI_API_KEY`
- `API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

说明：

- `GEMINI_API_KEY` / `API_KEY` 只在服务端使用
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 会暴露到前端，这是正常的

## 5. 触发部署

- 首次导入后直接点击部署
- 如果后面修改了环境变量，需要重新部署一次

## 6. 部署前本地检查

```powershell
npm run lint
npm run build
```

## 当前项目的关键文件

- 前端入口：`src/App.tsx`
- 后端入口：`server.ts`
- Vercel Serverless 入口：`api/index.ts`
- Vercel 配置：`vercel.json`
