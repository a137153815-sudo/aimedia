import { parseRequestBody, resolveApiKey, sendError } from './_shared';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = parseRequestBody(req);
    const { downloadLink, userApiKey } = body;
    const apiKeyResult = await resolveApiKey(req, userApiKey);

    if (!apiKeyResult.apiKey) {
      return res.status(apiKeyResult.status || 401).json({ error: apiKeyResult.error });
    }

    const response = await fetch(downloadLink, {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKeyResult.apiKey },
    });

    if (!response.ok) {
      throw new Error(`获取视频失败: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'video/mp4';

    res.setHeader('Content-Type', contentType);
    return res.status(200).send(buffer);
  } catch (error) {
    return sendError(res, error, '获取视频失败');
  }
}
