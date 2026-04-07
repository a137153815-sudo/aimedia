import { createGeminiClient, normalizeProviderBaseUrl, parseRequestBody, resolveApiKey, sendError } from './_shared';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = parseRequestBody(req);
    const { payload, userApiKey, baseUrl, customModel, provider, mode } = body;
    const apiKeyResult = await resolveApiKey(req, userApiKey);

    if (!apiKeyResult.apiKey) {
      return res.status(apiKeyResult.status || 401).json({ error: apiKeyResult.error });
    }

    const apiKey = apiKeyResult.apiKey;
    const requestMode = mode === 'tool' ? 'tool' : 'gemini';
    const requestedAspectRatio = payload?.config?.aspectRatio || '16:9';
    const requestedResolution = payload?.config?.resolution || '720p';
    const referenceImageBytes = payload?.image?.imageBytes;
    const referenceImageMimeType = payload?.image?.mimeType || 'image/jpeg';

    const zhipuSizeMap: Record<string, Record<string, string>> = {
      '720p': { '16:9': '1280x720', '9:16': '720x1280', '1:1': '1024x1024' },
      '1080p': { '16:9': '1920x1080', '9:16': '1080x1920', '1:1': '1024x1024' },
    };

    if (requestMode === 'tool' && provider === 'zhipu') {
      const base = normalizeProviderBaseUrl(baseUrl, 'https://open.bigmodel.cn/api/paas/v4');
      const fetchUrl = base.endsWith('/videos/generations') ? base : `${base}/videos/generations`;
      const size =
        zhipuSizeMap[requestedResolution]?.[requestedAspectRatio] || zhipuSizeMap['720p']['16:9'];

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
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(zhipuBody),
      });

      if (!zhipuRes.ok) {
        const errorText = await zhipuRes.text();
        const shouldRetryWithoutSize =
          zhipuBody.size && (errorText.includes('"code":"1214"') || errorText.includes('不支持当前size值'));

        if (shouldRetryWithoutSize) {
          const { size: _unusedSize, ...retryBody } = zhipuBody;
          zhipuRes = await fetch(fetchUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(retryBody),
          });
        } else {
          throw new Error(`Zhipu API Error: ${errorText}`);
        }
      }

      if (!zhipuRes.ok) {
        throw new Error(`Zhipu API Error: ${await zhipuRes.text()}`);
      }

      const data = await zhipuRes.json();
      return res.status(200).json({ done: false, taskId: data.id, provider: 'zhipu' });
    }

    if (requestMode === 'tool' && provider === 'kling') {
      const base = normalizeProviderBaseUrl(baseUrl, 'https://api.klingai.com/v1/standard');
      const fetchUrl = base.endsWith('/text2video') ? base : `${base}/video/text2video`;
      const klingRes = await fetch(fetchUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: customModel || 'kling-v1', prompt: payload.prompt }),
      });
      if (!klingRes.ok) {
        throw new Error(`Kling API Error: ${await klingRes.text()}`);
      }
      const data = await klingRes.json();
      return res.status(200).json({ done: false, taskId: data.data?.task_id || data.task_id, provider: 'kling' });
    }

    if (requestMode === 'tool' && provider === 'jimeng') {
      const base = normalizeProviderBaseUrl(baseUrl, 'https://api.volcengine.com/api/v1');
      const fetchUrl = base.endsWith('/video_generation') ? base : `${base}/video_generation`;
      const jimengRes = await fetch(fetchUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: customModel || 'jimeng-v1', prompt: payload.prompt }),
      });
      if (!jimengRes.ok) {
        throw new Error(`Jimeng API Error: ${await jimengRes.text()}`);
      }
      const data = await jimengRes.json();
      return res.status(200).json({ done: false, taskId: data.req_id || data.task_id || data.id, provider: 'jimeng' });
    }

    if (requestMode === 'tool') {
      return res.status(400).json({ error: 'Tool mode requires a supported video provider.' });
    }

    const ai = await createGeminiClient(apiKey);
    const operation = await ai.models.generateVideos(payload);
    return res.status(200).json(operation);
  } catch (error) {
    return sendError(res, error, '生成视频失败');
  }
}
