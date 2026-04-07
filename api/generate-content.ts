import { createGeminiClient, normalizeProviderBaseUrl, parseRequestBody, resolveApiKey, schemaToExample, sendError } from './_shared';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = parseRequestBody(req);
    const { payload, userApiKey, baseUrl, customModel, mode } = body;
    const apiKeyResult = await resolveApiKey(req, userApiKey);

    if (!apiKeyResult.apiKey) {
      return res.status(apiKeyResult.status || 401).json({ error: apiKeyResult.error });
    }

    const apiKey = apiKeyResult.apiKey;
    const requestMode = mode === 'tool' ? 'tool' : 'gemini';
    const normalizedBaseUrl = requestMode === 'tool' ? normalizeProviderBaseUrl(baseUrl, '') : '';
    const isCustomOpenAI = requestMode === 'tool';

    if (isCustomOpenAI) {
      if (!normalizedBaseUrl) {
        return res.status(400).json({ error: 'Tool mode requires a Base URL for text and image requests.' });
      }

      const model = customModel || payload.model || 'deepseek-chat';

      if (payload.config?.imageConfig) {
        const parts = payload.contents?.parts || [];
        const prompt =
          typeof payload.contents === 'string'
            ? payload.contents
            : parts.find((part: any) => part.text)?.text || '';
        const referenceImagePart = parts.find((part: any) => part.inlineData);
        const referenceBase64 = referenceImagePart?.inlineData?.data;
        const referenceSimilarity = payload.config.imageConfig.referenceSimilarity;

        const aspectRatio = payload.config.imageConfig.aspectRatio || '1:1';
        const sizeMap: Record<string, string> = {
          '1:1': '1920x1920',
          '9:16': '1440x2560',
          '16:9': '2560x1440',
          '4:3': '2240x1680',
          '3:4': '1680x2240',
        };
        const size = sizeMap[aspectRatio] || '1920x1920';

        const imageUrl = normalizedBaseUrl.endsWith('/')
          ? `${normalizedBaseUrl}images/generations`
          : `${normalizedBaseUrl}/images/generations`;
        const imageBody: any = { model, prompt, size, response_format: 'url' };

        if (referenceBase64) {
          imageBody.image = `data:image/jpeg;base64,${referenceBase64}`;
          imageBody.strength =
            referenceSimilarity != null
              ? parseFloat((1 - referenceSimilarity / 100).toFixed(2))
              : 0.5;
        }

        const imageRes = await fetch(imageUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(imageBody),
        });

        if (!imageRes.ok) {
          throw new Error(`Image API Error (${imageRes.status}): ${await imageRes.text()}`);
        }

        const imageData = await imageRes.json();
        const generatedUrl = imageData.data?.[0]?.url || imageData.data?.[0]?.b64_json;
        if (!generatedUrl) {
          throw new Error('No image URL returned from API');
        }

        let inlineData: { data: string; mimeType: string };
        if (generatedUrl.startsWith('http')) {
          const imgRes = await fetch(generatedUrl);
          const buffer = await imgRes.arrayBuffer();
          inlineData = {
            data: Buffer.from(buffer).toString('base64'),
            mimeType: imgRes.headers.get('content-type') || 'image/jpeg',
          };
        } else {
          inlineData = { data: generatedUrl, mimeType: 'image/jpeg' };
        }

        return res.status(200).json({ text: '', candidates: [{ content: { parts: [{ inlineData }] } }] });
      }

      let messages: any[] = [];
      if (typeof payload.contents === 'string') {
        messages = [{ role: 'user', content: payload.contents }];
      } else if (payload.contents?.parts) {
        messages = [
          {
            role: 'user',
            content: payload.contents.parts
              .map((part: any) => {
                if (part.text) return { type: 'text', text: part.text };
                if (part.inlineData) {
                  return {
                    type: 'image_url',
                    image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` },
                  };
                }
                return null;
              })
              .filter(Boolean),
          },
        ];
      } else if (Array.isArray(payload.contents)) {
        messages = payload.contents.map((content: any) => {
          if (typeof content === 'string') return { role: 'user', content };
          if (content.parts) {
            return {
              role: 'user',
              content: content.parts
                .map((part: any) => {
                  if (part.text) return { type: 'text', text: part.text };
                  if (part.inlineData) {
                    return {
                      type: 'image_url',
                      image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` },
                    };
                  }
                  return null;
                })
                .filter(Boolean),
            };
          }
          return { role: 'user', content: JSON.stringify(content) };
        });
      }

      const isJson = payload.config?.responseMimeType === 'application/json';
      if (isJson && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        let schemaInstruction =
          '\n\nIMPORTANT: Return ONLY a plain JSON object with actual data values. Do NOT wrap in keys like "answer" or "result". Do NOT include "type", "properties", or "required" meta-fields.';

        if (payload.config?.responseSchema) {
          const example = schemaToExample(payload.config.responseSchema);
          schemaInstruction += ` Your response MUST match this exact JSON structure. For array fields you MUST generate exactly 4 items and each item must be meaningfully different:\n${JSON.stringify(example, null, 2)}`;
        }

        if (typeof lastMessage.content === 'string') {
          lastMessage.content += schemaInstruction;
        } else if (Array.isArray(lastMessage.content)) {
          lastMessage.content.push({ type: 'text', text: schemaInstruction });
        }
      }

      const openAiPayload: any = { model, messages };
      if (isJson) {
        openAiPayload.response_format = { type: 'json_object' };
      }

      const fetchUrl = normalizedBaseUrl.endsWith('/')
        ? `${normalizedBaseUrl}chat/completions`
        : `${normalizedBaseUrl}/chat/completions`;

      const openAiResponse = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(openAiPayload),
      });

      if (!openAiResponse.ok) {
        throw new Error(`OpenAI API Error (${openAiResponse.status}): ${await openAiResponse.text()}`);
      }

      const openAiData = await openAiResponse.json();
      const responseText = openAiData.choices?.[0]?.message?.content || '';

      return res.status(200).json({
        text: responseText,
        candidates: [{ content: { parts: [{ text: responseText }] } }],
      });
    }

    const ai = createGeminiClient(apiKey);
    const response = await ai.models.generateContent(payload);

    return res.status(200).json({
      text: response.text,
      ...response,
    });
  } catch (error) {
    return sendError(res, error, '生成内容失败');
  }
}
