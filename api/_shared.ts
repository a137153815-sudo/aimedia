import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://iuntxvmqkxgvcrbibcjr.supabase.co';
const supabaseAnonKey =
  process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ja012WFpWiK_Ctbgq_Va_Q_tx3o7rSm';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function normalizeProviderBaseUrl(rawBaseUrl: unknown, fallback: string) {
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

export function parseRequestBody(req: any) {
  if (!req?.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export async function resolveApiKey(req: any, userApiKey?: string) {
  if (userApiKey) {
    return { apiKey: userApiKey };
  }

  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return { error: '使用平台 API 密钥需要身份验证。请登录或在设置中提供您自己的密钥。', status: 401 };
  }

  const token = String(authHeader).replace('Bearer ', '');
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { error: '无效的身份验证令牌。', status: 401 };
  }

  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: '缺少 API 密钥。', status: 401 };
  }

  return { apiKey };
}

export function schemaToExample(schema: any): any {
  if (!schema) return null;
  const type = String(schema.type || '').toUpperCase();

  if (type === 'OBJECT') {
    const obj: Record<string, any> = {};
    for (const [key, value] of Object.entries(schema.properties || {})) {
      obj[key] = schemaToExample(value);
    }
    return obj;
  }

  if (type === 'ARRAY') {
    return [1, 2, 3, 4].map((index) => {
      const item = schemaToExample(schema.items);

      const tagLeaves = (value: any): any => {
        if (typeof value === 'string') {
          return value.replace('>', ` [变体${index}，内容必须与其他变体明显不同]>`);
        }
        if (Array.isArray(value)) return value.map(tagLeaves);
        if (value && typeof value === 'object') {
          return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tagLeaves(v)]));
        }
        return value;
      };

      return tagLeaves(item);
    });
  }

  return schema.description ? `<${schema.description}>` : '<string>';
}

export function sendError(res: any, error: unknown, fallback = '请求失败') {
  console.error('[API error]', error);

  if (typeof error === 'object' && error && 'status' in error && 'message' in error) {
    return res.status((error as any).status || 500).json({ error: (error as any).message || fallback });
  }

  let errorMessage = fallback;
  if (error instanceof Error) {
    errorMessage = error.message || fallback;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }

  try {
    const parsed = JSON.parse(errorMessage);
    if (parsed?.error?.message) {
      errorMessage = parsed.error.message;
    }
  } catch {
    // Ignore non-JSON errors.
  }

  return res.status(500).json({ error: errorMessage });
}

export function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}
