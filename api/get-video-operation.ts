import { createGeminiClient, normalizeProviderBaseUrl, parseRequestBody, resolveApiKey, sendError } from './_shared';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = parseRequestBody(req);
    const { operationObj, userApiKey, baseUrl, provider, mode } = body;
    const apiKeyResult = await resolveApiKey(req, userApiKey);

    if (!apiKeyResult.apiKey) {
      return res.status(apiKeyResult.status || 401).json({ error: apiKeyResult.error });
    }

    const apiKey = apiKeyResult.apiKey;
    const requestMode = mode === 'tool' ? 'tool' : 'gemini';
    const activeProvider = provider || operationObj.provider;

    if (requestMode === 'tool' && activeProvider === 'zhipu') {
      const zhipuBase = normalizeProviderBaseUrl(baseUrl, 'https://open.bigmodel.cn/api/paas/v4');
      const fetchUrl = `${zhipuBase}/async-result/${operationObj.taskId}`;
      const zhipuRes = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      const data = await zhipuRes.json();

      if (data.task_status === 'SUCCESS') {
        return res.status(200).json({
          done: true,
          response: { generatedVideos: [{ video: { uri: data.video_result?.[0]?.url || data.url } }] },
        });
      }
      if (data.task_status === 'FAIL') {
        throw new Error('Zhipu video generation failed');
      }
      return res.status(200).json({ done: false, taskId: operationObj.taskId, provider: 'zhipu' });
    }

    if (requestMode === 'tool' && activeProvider === 'kling') {
      const klingBase = normalizeProviderBaseUrl(baseUrl, 'https://api.klingai.com/v1/standard');
      const fetchUrl = `${klingBase}/video/task/${operationObj.taskId}`;
      const klingRes = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      const data = await klingRes.json();
      const status = data.data?.status || data.status;

      if (status === 99 || status === 'succeed' || status === 'SUCCESS') {
        const url = data.data?.task_result?.videos?.[0]?.url || data.data?.video_url || data.video_url;
        return res.status(200).json({ done: true, response: { generatedVideos: [{ video: { uri: url } }] } });
      }
      if (status === 100 || status === 'failed' || status === 'FAIL') {
        throw new Error('Kling video generation failed');
      }
      return res.status(200).json({ done: false, taskId: operationObj.taskId, provider: 'kling' });
    }

    if (requestMode === 'tool' && activeProvider === 'jimeng') {
      const jimengBase = normalizeProviderBaseUrl(baseUrl, 'https://api.volcengine.com/api/v1');
      const fetchUrl = `${jimengBase}/video_generation/tasks/${operationObj.taskId}`;
      const jimengRes = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      const data = await jimengRes.json();
      const status = data.status || data.data?.status;

      if (status === 'success' || status === 'SUCCESS') {
        const url = data.video_url || data.data?.video_url || data.url;
        return res.status(200).json({ done: true, response: { generatedVideos: [{ video: { uri: url } }] } });
      }
      if (status === 'failed' || status === 'FAIL') {
        throw new Error('Jimeng video generation failed');
      }
      return res.status(200).json({ done: false, taskId: operationObj.taskId, provider: 'jimeng' });
    }

    if (requestMode === 'tool') {
      return res.status(400).json({ error: 'Tool mode requires a supported video provider.' });
    }

    const ai = createGeminiClient(apiKey);
    const operation = await ai.operations.getVideosOperation({ operation: operationObj });
    return res.status(200).json(operation);
  } catch (error) {
    return sendError(res, error, '获取视频操作状态失败');
  }
}
