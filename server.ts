import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// Load dotenv only in development
if (process.env.NODE_ENV !== 'production') {
  import('dotenv').then(dotenv => dotenv.config());
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://iuntxvmqkxgvcrbibcjr.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ja012WFpWiK_Ctbgq_Va_Q_tx3o7rSm';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

function applyCors(req: express.Request, res: express.Response) {
  const requestOrigin = req.headers.origin;
  const allowAllOrigins = allowedOrigins.length === 0;

  if (requestOrigin && (allowAllOrigins || allowedOrigins.includes(requestOrigin))) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  } else if (allowAllOrigins) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

app.use((req, res, next) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
app.use(express.json({ limit: '50mb' }));

function normalizeProviderBaseUrl(rawBaseUrl: unknown, fallback: string) {
  if (typeof rawBaseUrl !== 'string') return fallback;

  let candidate = rawBaseUrl.trim();
  if (!candidate) return fallback;

  const lastHttpIndex = Math.max(candidate.lastIndexOf('https://'), candidate.lastIndexOf('http://'));
  if (lastHttpIndex > 0) {
    candidate = candidate.slice(lastHttpIndex);
  }

  try {
    const parsed = new URL(candidate);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

// API routes FIRST
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/generate-content', async (req, res) => {
  try {
    const { payload, userApiKey, baseUrl, customModel, mode } = req.body;
    const authHeader = req.headers.authorization;
    
    let apiKey = userApiKey;
    
    // If no user API key, verify Supabase token to use platform key
    if (!apiKey) {
      if (!authHeader) {
        return res.status(401).json({ error: '使用平台 API 密钥需要身份验证。请登录或在设置中提供您自己的密钥。' });
      }
      
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return res.status(401).json({ error: '无效的身份验证令牌。' });
      }
      
      apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    }
    
    if (!apiKey) {
      return res.status(401).json({ error: '缺少 API 密钥。' });
    }

    const requestMode = mode === 'tool' ? 'tool' : 'gemini';
    const normalizedBaseUrl = requestMode === 'tool'
      ? normalizeProviderBaseUrl(baseUrl, '')
      : '';

    // Convert Gemini schema to a concrete JSON example for non-Gemini models
    function schemaToExample(schema: any): any {
      if (!schema) return null;
      const t = (schema.type || '').toUpperCase();
      if (t === 'OBJECT') {
        const obj: any = {};
        for (const [key, val] of Object.entries(schema.properties || {})) {
          obj[key] = schemaToExample(val);
        }
        return obj;
      }
      if (t === 'ARRAY') {
        // Return 4 items with numbered placeholders to force distinct content
        return [1, 2, 3, 4].map(n => {
          const item = schemaToExample(schema.items);
          // Append variant number to all string leaf values so model knows each must differ
          function tagLeaves(obj: any): any {
            if (typeof obj === 'string') return obj.replace('>', ` [变体${n}，内容必须与其他变体明显不同]>`);
            if (Array.isArray(obj)) return obj.map(tagLeaves);
            if (obj && typeof obj === 'object') return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, tagLeaves(v)]));
            return obj;
          }
          return tagLeaves(item);
        });
      }
      return schema.description ? `<${schema.description}>` : '<string>';
    }

    // Check if we should use OpenAI compatible format
    const isCustomOpenAI = requestMode === 'tool';
    
    if (isCustomOpenAI) {
      if (!normalizedBaseUrl) {
        return res.status(400).json({ error: 'Tool mode requires a Base URL for text and image requests.' });
      }

      const model = customModel || payload.model || 'deepseek-chat';

      // Image generation path: detect imageConfig and call /images/generations
      if (payload.config?.imageConfig) {
        const parts = payload.contents?.parts || [];
        const prompt = typeof payload.contents === 'string'
          ? payload.contents
          : parts.find((p: any) => p.text)?.text || '';
        const referenceImagePart = parts.find((p: any) => p.inlineData);
        const referenceBase64 = referenceImagePart?.inlineData?.data;
        const referenceSimilarity = payload.config.imageConfig.referenceSimilarity; // 0-100

        const aspectRatio = payload.config.imageConfig.aspectRatio || '1:1';
        // Doubao requires at least 3,686,400 pixels total
        const sizeMap: Record<string, string> = {
          '1:1': '1920x1920', '9:16': '1440x2560', '16:9': '2560x1440',
          '4:3': '2240x1680', '3:4': '1680x2240'
        };
        const size = sizeMap[aspectRatio] || '1920x1920';

        const imageUrl = normalizedBaseUrl.endsWith('/') ? `${normalizedBaseUrl}images/generations` : `${normalizedBaseUrl}/images/generations`;
        const imageBody: any = { model, prompt, size, response_format: 'url' };
        // Add reference image if provided
        if (referenceBase64) {
          imageBody.image = `data:image/jpeg;base64,${referenceBase64}`;
          // strength: 0=identical to reference, 1=ignore reference; invert user's similarity %
          imageBody.strength = referenceSimilarity != null
            ? parseFloat((1 - referenceSimilarity / 100).toFixed(2))
            : 0.5;
        }

        const imageRes = await fetch(imageUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(imageBody)
        });

        if (!imageRes.ok) throw new Error(`Image API Error (${imageRes.status}): ${await imageRes.text()}`);

        const imageData = await imageRes.json();
        const generatedUrl = imageData.data?.[0]?.url || imageData.data?.[0]?.b64_json;
        if (!generatedUrl) throw new Error('No image URL returned from API');

        let inlineData: { data: string; mimeType: string };
        if (generatedUrl.startsWith('http')) {
          const imgRes = await fetch(generatedUrl);
          const buffer = await imgRes.arrayBuffer();
          inlineData = {
            data: Buffer.from(buffer).toString('base64'),
            mimeType: imgRes.headers.get('content-type') || 'image/jpeg'
          };
        } else {
          inlineData = { data: generatedUrl, mimeType: 'image/jpeg' };
        }

        return res.json({ text: '', candidates: [{ content: { parts: [{ inlineData }] } }] });
      }

      // Translate Gemini payload to OpenAI chat format
      let messages: any[] = [];
      
      // Handle text or multimodal input
      if (typeof payload.contents === 'string') {
        messages = [{ role: 'user', content: payload.contents }];
      } else if (payload.contents?.parts) {
        messages = [{
          role: 'user',
          content: payload.contents.parts.map((part: any) => {
            if (part.text) return { type: 'text', text: part.text };
            if (part.inlineData) {
              return { 
                type: 'image_url', 
                image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` } 
              };
            }
            return null;
          }).filter(Boolean)
        }];
      } else if (Array.isArray(payload.contents)) {
         // Handle array of parts or strings
         messages = payload.contents.map((c: any) => {
            if (typeof c === 'string') return { role: 'user', content: c };
            if (c.parts) {
               return {
                  role: 'user',
                  content: c.parts.map((part: any) => {
                     if (part.text) return { type: 'text', text: part.text };
                     if (part.inlineData) return { type: 'image_url', image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` } };
                     return null;
                  }).filter(Boolean)
               };
            }
            return { role: 'user', content: JSON.stringify(c) };
         });
      }

      // Handle JSON response format if requested by Gemini config
      const isJson = payload.config?.responseMimeType === 'application/json';
      if (isJson && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        let schemaInstruction = '\n\nIMPORTANT: Return ONLY a plain JSON object with actual data values. Do NOT wrap in keys like "answer" or "result". Do NOT include "type", "properties", or "required" meta-fields.';
        if (payload.config?.responseSchema) {
          const example = schemaToExample(payload.config.responseSchema);
          schemaInstruction += ` Your response MUST match this exact JSON structure. For array fields you MUST generate exactly 4 items — each item must have meaningfully DIFFERENT content (replace <...> placeholders with real, distinct values):\n${JSON.stringify(example, null, 2)}`;
        }
        if (typeof lastMsg.content === 'string') {
          lastMsg.content += schemaInstruction;
        } else if (Array.isArray(lastMsg.content)) {
          lastMsg.content.push({ type: 'text', text: schemaInstruction });
        }
      }

      const openAiPayload: any = {
        model: model,
        messages: messages,
      };

      if (isJson) {
        openAiPayload.response_format = { type: 'json_object' };
      }

      const fetchUrl = normalizedBaseUrl.endsWith('/') ? `${normalizedBaseUrl}chat/completions` : `${normalizedBaseUrl}/chat/completions`;
      
      const openAiResponse = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(openAiPayload)
      });

      if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
        throw new Error(`OpenAI API Error (${openAiResponse.status}): ${errorText}`);
      }

      const openAiData = await openAiResponse.json();
      const responseText = openAiData.choices?.[0]?.message?.content || '';

      return res.json({
        text: responseText,
        candidates: [{ content: { parts: [{ text: responseText }] } }]
      });
    }

    // Default: Use Gemini SDK
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent(payload);
    
    res.json({
      text: response.text,
      ...response
    });
  } catch (error: any) {
    console.error('Error generating content:', error);
    let errorMessage = error.message || '生成内容失败';
    try {
      const parsed = JSON.parse(errorMessage);
      if (parsed.error && parsed.error.message) {
        errorMessage = parsed.error.message;
      }
    } catch (e) {}
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/generate-videos', async (req, res) => {
  try {
    const { payload, userApiKey, baseUrl, customModel, provider, mode } = req.body;
    const authHeader = req.headers.authorization;
    
    let apiKey = userApiKey;
    
    if (!apiKey) {
      if (!authHeader) {
        return res.status(401).json({ error: '使用平台 API 密钥需要身份验证。请登录或在设置中提供您自己的密钥。' });
      }
      
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return res.status(401).json({ error: '无效的身份验证令牌。' });
      }
      
      apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    }
    
    if (!apiKey) {
      return res.status(401).json({ error: '缺少 API 密钥。' });
    }

    const requestMode = mode === 'tool' ? 'tool' : 'gemini';
    const requestedAspectRatio = payload?.config?.aspectRatio || '16:9';
    const requestedResolution = payload?.config?.resolution || '720p';
    const referenceImageBytes = payload?.image?.imageBytes;
    const referenceImageMimeType = payload?.image?.mimeType || 'image/jpeg';
    const zhipuSizeMap: Record<string, Record<string, string>> = {
      '720p': {
        '16:9': '1280x720',
        '9:16': '720x1280',
        '1:1': '1024x1024',
      },
      '1080p': {
        '16:9': '1920x1080',
        '9:16': '1080x1920',
        '1:1': '1024x1024',
      },
    };

    if (requestMode === 'tool' && provider === 'zhipu') {
      const base = normalizeProviderBaseUrl(baseUrl, 'https://open.bigmodel.cn/api/paas/v4');
      const fetchUrl = base.endsWith('/videos/generations') ? base : `${base}/videos/generations`;
      const size = zhipuSizeMap[requestedResolution]?.[requestedAspectRatio] || zhipuSizeMap['720p']['16:9'];
      const zhipuBody: any = {
        model: customModel || 'cogvideox',
        prompt: payload.prompt,
        size,
      };

      if (referenceImageBytes) {
        zhipuBody.image_url = `data:${referenceImageMimeType};base64,${referenceImageBytes}`;
      }

      let zhipuRes = await fetch(fetchUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(zhipuBody)
      });

      if (!zhipuRes.ok) {
        const errorText = await zhipuRes.text();
        const shouldRetryWithoutSize =
          zhipuBody.size &&
          (errorText.includes('"code":"1214"') || errorText.includes('不支持当前size值'));

        if (shouldRetryWithoutSize) {
          const { size: _unusedSize, ...retryBody } = zhipuBody;
          zhipuRes = await fetch(fetchUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(retryBody)
          });
        } else {
          throw new Error(`Zhipu API Error: ${errorText}`);
        }
      }

      if (!zhipuRes.ok) throw new Error(`Zhipu API Error: ${await zhipuRes.text()}`);
      const data = await zhipuRes.json();
      return res.json({ done: false, taskId: data.id, provider: 'zhipu' });
    }
    
    if (requestMode === 'tool' && provider === 'kling') {
      const base = normalizeProviderBaseUrl(baseUrl, 'https://api.klingai.com/v1/standard');
      const fetchUrl = base.endsWith('/text2video') ? base : `${base}/video/text2video`;
      const klingRes = await fetch(fetchUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: customModel || 'kling-v1', prompt: payload.prompt })
      });
      if (!klingRes.ok) throw new Error(`Kling API Error: ${await klingRes.text()}`);
      const data = await klingRes.json();
      return res.json({ done: false, taskId: data.data?.task_id || data.task_id, provider: 'kling' });
    }
    
    if (requestMode === 'tool' && provider === 'jimeng') {
      const base = normalizeProviderBaseUrl(baseUrl, 'https://api.volcengine.com/api/v1');
      const fetchUrl = base.endsWith('/video_generation') ? base : `${base}/video_generation`;
      const jimengRes = await fetch(fetchUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: customModel || 'jimeng-v1', prompt: payload.prompt })
      });
      if (!jimengRes.ok) throw new Error(`Jimeng API Error: ${await jimengRes.text()}`);
      const data = await jimengRes.json();
      return res.json({ done: false, taskId: data.req_id || data.task_id || data.id, provider: 'jimeng' });
    }

    if (requestMode === 'tool') {
      return res.status(400).json({ error: 'Tool mode requires a supported video provider.' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const operation = await ai.models.generateVideos(payload);
    res.json(operation);
  } catch (error: any) {
    console.error('Error generating videos:', error);
    let errorMessage = error.message || '生成视频失败';
    try {
      const parsed = JSON.parse(errorMessage);
      if (parsed.error && parsed.error.message) {
        errorMessage = parsed.error.message;
      }
    } catch (e) {}
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/get-video-operation', async (req, res) => {
  try {
    const { operationObj, userApiKey, baseUrl, customModel, provider, mode } = req.body;
    const authHeader = req.headers.authorization;
    
    let apiKey = userApiKey;
    
    if (!apiKey) {
      if (!authHeader) {
        return res.status(401).json({ error: '使用平台 API 密钥需要身份验证。请登录或在设置中提供您自己的密钥。' });
      }
      
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return res.status(401).json({ error: '无效的身份验证令牌。' });
      }
      
      apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    }
    
    if (!apiKey) {
      return res.status(401).json({ error: '缺少 API 密钥。' });
    }

    const requestMode = mode === 'tool' ? 'tool' : 'gemini';
    const activeProvider = provider || operationObj.provider;
    
    if (requestMode === 'tool' && activeProvider === 'zhipu') {
      const zhipuBase = normalizeProviderBaseUrl(baseUrl, 'https://open.bigmodel.cn/api/paas/v4');
      const fetchUrl = `${zhipuBase}/async-result/${operationObj.taskId}`;
      const zhipuRes = await fetch(fetchUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      const data = await zhipuRes.json();
      console.log('[Zhipu status]', JSON.stringify(data));
      if (data.task_status === 'SUCCESS') {
        return res.json({ done: true, response: { generatedVideos: [{ video: { uri: data.video_result?.[0]?.url || data.url } }] } });
      } else if (data.task_status === 'FAIL') {
        throw new Error('Zhipu video generation failed');
      }
      return res.json({ done: false, taskId: operationObj.taskId, provider: 'zhipu' });
    }
    
    if (requestMode === 'tool' && activeProvider === 'kling') {
      const klingBase = normalizeProviderBaseUrl(baseUrl, 'https://api.klingai.com/v1/standard');
      const fetchUrl = `${klingBase}/video/task/${operationObj.taskId}`;
      const klingRes = await fetch(fetchUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      const data = await klingRes.json();
      const status = data.data?.status || data.status;
      if (status === 99 || status === 'succeed' || status === 'SUCCESS') {
        const url = data.data?.task_result?.videos?.[0]?.url || data.data?.video_url || data.video_url;
        return res.json({ done: true, response: { generatedVideos: [{ video: { uri: url } }] } });
      } else if (status === 100 || status === 'failed' || status === 'FAIL') {
        throw new Error('Kling video generation failed');
      }
      return res.json({ done: false, taskId: operationObj.taskId, provider: 'kling' });
    }
    
    if (requestMode === 'tool' && activeProvider === 'jimeng') {
      const jimengBase = normalizeProviderBaseUrl(baseUrl, 'https://api.volcengine.com/api/v1');
      const fetchUrl = `${jimengBase}/video_generation/tasks/${operationObj.taskId}`;
      const jimengRes = await fetch(fetchUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      const data = await jimengRes.json();
      const status = data.status || data.data?.status;
      if (status === 'success' || status === 'SUCCESS') {
        const url = data.video_url || data.data?.video_url || data.url;
        return res.json({ done: true, response: { generatedVideos: [{ video: { uri: url } }] } });
      } else if (status === 'failed' || status === 'FAIL') {
        throw new Error('Jimeng video generation failed');
      }
      return res.json({ done: false, taskId: operationObj.taskId, provider: 'jimeng' });
    }

    if (requestMode === 'tool') {
      return res.status(400).json({ error: 'Tool mode requires a supported video provider.' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const operation = await ai.operations.getVideosOperation({ operation: operationObj });
    res.json(operation);
  } catch (error: any) {
    console.error('Error getting video operation:', error);
    let errorMessage = error.message || '获取视频操作状态失败';
    try {
      const parsed = JSON.parse(errorMessage);
      if (parsed.error && parsed.error.message) {
        errorMessage = parsed.error.message;
      }
    } catch (e) {}
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/fetch-video', async (req, res) => {
  try {
    const { downloadLink, userApiKey } = req.body;
    const authHeader = req.headers.authorization;
    
    let apiKey = userApiKey;
    
    if (!apiKey) {
      if (!authHeader) {
        return res.status(401).json({ error: '使用平台 API 密钥需要身份验证。请登录或在设置中提供您自己的密钥。' });
      }
      
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return res.status(401).json({ error: '无效的身份验证令牌。' });
      }
      
      apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    }
    
    if (!apiKey) {
      return res.status(401).json({ error: '缺少 API 密钥。' });
    }

    const response = await fetch(downloadLink, {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`获取视频失败: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const contentType = response.headers.get('content-type') || 'video/mp4';
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  } catch (error: any) {
    console.error('Error fetching video:', error);
    let errorMessage = error.message || '获取视频失败';
    try {
      const parsed = JSON.parse(errorMessage);
      if (parsed.error && parsed.error.message) {
        errorMessage = parsed.error.message;
      }
    } catch (e) {}
    res.status(500).json({ error: errorMessage });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
