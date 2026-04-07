# 前后端分离部署

## 目标结构

- 前端：Vercel
- 后端：常驻 Node 服务
  - 推荐：Railway / Render / Fly.io / 香港云服务器

## 前端需要的环境变量

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`

说明：

- `VITE_API_BASE_URL` 填后端服务的根地址
- 例如：`https://aimedia-backend-production.up.railway.app`
- 前端会自动请求：
  - `${VITE_API_BASE_URL}/api/generate-content`
  - `${VITE_API_BASE_URL}/api/generate-videos`

## 后端需要的环境变量

- `GEMINI_API_KEY`
- `API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `ALLOWED_ORIGINS`

示例：

```env
ALLOWED_ORIGINS="https://aimedia-eosin.vercel.app,http://localhost:3000"
```

## 后端启动

项目已经支持直接启动后端：

```powershell
npm install
npm run start
```

当前 `start` 脚本会使用 `tsx server.ts`。

## 为什么这么改

这个项目的后端会：
- 代理第三方 AI 接口
- 处理长耗时请求
- 后续还要接趣盟和数据库

这类形态更适合常驻 Node 服务，不适合继续放在 Vercel Function 里硬跑。
