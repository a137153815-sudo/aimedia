# AI Media Analyzer Pro

素材分析、提示词生成、图片生成、视频生成的一体化本地站点，支持 `Gemini 模式` 和 `工具模式`。

## 本地运行

前置要求：
- Node.js 18+

步骤：
1. 安装依赖：`npm install`
2. 按 [.env.example](./.env.example) 准备环境变量
3. 启动开发环境：`npm run dev`
4. 浏览器打开：`http://localhost:3000`

## 构建检查

- 类型检查：`npm run lint`
- 生产构建：`npm run build`

## 部署到 Vercel

推荐流程：
1. 把当前 `aimedia` 目录上传到 GitHub 新仓库
2. 在 Vercel 导入该仓库
3. 如果你上传的是上层仓库，把 `Root Directory` 设为 `aimedia`
4. 在 Vercel 配置环境变量
5. 点击部署

建议配置的环境变量：
- `GEMINI_API_KEY`
- `API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

说明：
- `GEMINI_API_KEY` 和 `API_KEY` 只在服务端使用，不会再注入前端构建包
- `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 会暴露到前端，这是正常行为

## 当前部署结构

- 前端静态构建：Vite
- 后端 API：Express，通过 [api/index.ts](./api/index.ts) 接入 Vercel Serverless Function
- Vercel 路由配置： [vercel.json](./vercel.json)

## 上传前建议

当前 `.gitignore` 已排除：
- `node_modules`
- `dist`
- 本地日志
- 备份目录
- 临时 txt / zip / pdf / exe 文件

建议你上传前只保留真正项目文件，不要把本地备份和调试产物一起推上去。
