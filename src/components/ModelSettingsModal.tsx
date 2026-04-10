import React, { useState } from 'react';
import { Image as ImageIcon, Layers, MessageSquare, Video, X } from 'lucide-react';

type SettingsMode = 'gemini' | 'tool';
type ToolTextProvider = 'deepseek' | 'zhipu' | 'doubao';
type ToolImageProvider = 'zhipu' | 'doubao';
type ToolVideoProvider = 'zhipu' | 'jimeng';

type ProviderPreset = {
  label: string;
  baseUrl: string;
  model: string;
  helper: string;
};

const TEXT_PROVIDER_PRESETS: Record<ToolTextProvider, ProviderPreset> = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    helper: '适合文本分析、关键词矩阵和提示词生成。',
  },
  zhipu: {
    label: '智谱',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.5-air',
    helper: '适合中文理解和结构化输出。',
  },
  doubao: {
    label: '豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-1.5-lite-32k',
    helper: '适合走火山方舟兼容接口，模型名也可替换成你的接入点 ID。',
  },
};

const IMAGE_PROVIDER_PRESETS: Record<ToolImageProvider, ProviderPreset> = {
  zhipu: {
    label: '智谱',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-image',
    helper: '推荐用于中文营销海报和稳定测试。',
  },
  doubao: {
    label: '豆包 / 即梦',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seedream-5-0-260128',
    helper: '推荐用于豆包 Seedream 生图，也方便切换即梦系模型。',
  },
};

const VIDEO_PROVIDER_PRESETS: Record<ToolVideoProvider, ProviderPreset> = {
  zhipu: {
    label: '智谱 CogVideoX',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'cogvideox-flash',
    helper: '推荐先用 flash 冒烟测试，再切 cogvideox-2 或 cogvideox-3。',
  },
  jimeng: {
    label: '即梦',
    baseUrl: 'https://api.volcengine.com/api/v1',
    model: 'jimeng-v1',
    helper: '适合即梦视频接口，模型名可按你的账号能力调整。',
  },
};

const normalizeSettingsMode = (mode: string | null): SettingsMode =>
  mode === 'tool' ? 'tool' : 'gemini';

const normalizeTextProvider = (provider: string | null): ToolTextProvider =>
  provider === 'zhipu' || provider === 'doubao' ? provider : 'deepseek';

const normalizeImageProvider = (provider: string | null): ToolImageProvider =>
  provider === 'doubao' ? 'doubao' : 'zhipu';

const normalizeVideoProvider = (provider: string | null): ToolVideoProvider =>
  provider === 'jimeng' ? 'jimeng' : 'zhipu';

const setStoredValue = (key: string, value: string) => {
  const trimmed = value.trim();
  if (trimmed) {
    localStorage.setItem(key, trimmed);
  } else {
    localStorage.removeItem(key);
  }
};

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="mb-1 block text-xs font-medium text-slate-600">{children}</label>
);

const SectionCard = ({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
    <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
      {icon}
      {title}
    </h4>
    <div className="space-y-3">{children}</div>
  </div>
);

interface ModelSettingsModalProps {
  onClose: () => void;
}

export default function ModelSettingsModal({ onClose }: ModelSettingsModalProps) {
  const [settingsMode, setSettingsMode] = useState<SettingsMode>(() =>
    normalizeSettingsMode(localStorage.getItem('settings_mode'))
  );

  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [geminiTextModel, setGeminiTextModel] = useState(
    () => localStorage.getItem('text_model') || 'gemini-3.1-pro-preview'
  );
  const [geminiImageModel, setGeminiImageModel] = useState(
    () => localStorage.getItem('image_model') || 'gemini-3.1-flash-image-preview'
  );
  const [geminiVideoModel, setGeminiVideoModel] = useState(
    () => localStorage.getItem('video_model') || 'veo-3.1-fast-generate-preview'
  );

  const [textProvider, setTextProvider] = useState<ToolTextProvider>(() =>
    normalizeTextProvider(localStorage.getItem('text_provider'))
  );
  const [textApiKey, setTextApiKey] = useState(() => localStorage.getItem('text_api_key') || '');
  const [textBaseUrl, setTextBaseUrl] = useState(
    () =>
      localStorage.getItem('text_base_url') ||
      TEXT_PROVIDER_PRESETS[normalizeTextProvider(localStorage.getItem('text_provider'))].baseUrl
  );
  const [textModelName, setTextModelName] = useState(
    () =>
      localStorage.getItem('text_model_name') ||
      TEXT_PROVIDER_PRESETS[normalizeTextProvider(localStorage.getItem('text_provider'))].model
  );

  const [imageProvider, setImageProvider] = useState<ToolImageProvider>(() =>
    normalizeImageProvider(localStorage.getItem('image_provider'))
  );
  const [imageApiKey, setImageApiKey] = useState(() => localStorage.getItem('image_api_key') || '');
  const [imageBaseUrl, setImageBaseUrl] = useState(
    () =>
      localStorage.getItem('image_base_url') ||
      IMAGE_PROVIDER_PRESETS[normalizeImageProvider(localStorage.getItem('image_provider'))].baseUrl
  );
  const [imageModelName, setImageModelName] = useState(
    () =>
      localStorage.getItem('image_model_name') ||
      IMAGE_PROVIDER_PRESETS[normalizeImageProvider(localStorage.getItem('image_provider'))].model
  );

  const [videoProvider, setVideoProvider] = useState<ToolVideoProvider>(() =>
    normalizeVideoProvider(localStorage.getItem('video_provider'))
  );
  const [videoApiKey, setVideoApiKey] = useState(() => localStorage.getItem('video_api_key') || '');
  const [videoBaseUrl, setVideoBaseUrl] = useState(
    () =>
      localStorage.getItem('video_base_url') ||
      VIDEO_PROVIDER_PRESETS[normalizeVideoProvider(localStorage.getItem('video_provider'))].baseUrl
  );
  const [videoModelName, setVideoModelName] = useState(
    () =>
      localStorage.getItem('video_model_name') ||
      VIDEO_PROVIDER_PRESETS[normalizeVideoProvider(localStorage.getItem('video_provider'))].model
  );
  const [qumengClientId, setQumengClientId] = useState(() => localStorage.getItem('qumeng_client_id') || '');
  const [qumengAccessToken, setQumengAccessToken] = useState(() => localStorage.getItem('qumeng_access_token') || '');
  const [qumengRefreshToken, setQumengRefreshToken] = useState(() => localStorage.getItem('qumeng_refresh_token') || '');
  const [qumengAccountId, setQumengAccountId] = useState(() => localStorage.getItem('qumeng_account_id') || '');

  const selectedTextPreset = TEXT_PROVIDER_PRESETS[textProvider];
  const selectedImagePreset = IMAGE_PROVIDER_PRESETS[imageProvider];
  const selectedVideoPreset = VIDEO_PROVIDER_PRESETS[videoProvider];

  const applyTextPreset = (provider: ToolTextProvider) => {
    const preset = TEXT_PROVIDER_PRESETS[provider];
    setTextProvider(provider);
    setTextBaseUrl(preset.baseUrl);
    setTextModelName(preset.model);
  };

  const applyImagePreset = (provider: ToolImageProvider) => {
    const preset = IMAGE_PROVIDER_PRESETS[provider];
    setImageProvider(provider);
    setImageBaseUrl(preset.baseUrl);
    setImageModelName(preset.model);
  };

  const applyVideoPreset = (provider: ToolVideoProvider) => {
    const preset = VIDEO_PROVIDER_PRESETS[provider];
    setVideoProvider(provider);
    setVideoBaseUrl(preset.baseUrl);
    setVideoModelName(preset.model);
  };

  const handleSave = () => {
    localStorage.setItem('settings_mode', settingsMode);

    if (settingsMode === 'gemini') {
      setStoredValue('gemini_api_key', geminiApiKey);
      setStoredValue('text_api_key', geminiApiKey);
      setStoredValue('image_api_key', geminiApiKey);
      setStoredValue('video_api_key', geminiApiKey);

      localStorage.removeItem('text_base_url');
      localStorage.removeItem('text_model_name');
      localStorage.removeItem('image_base_url');
      localStorage.removeItem('image_model_name');
      localStorage.removeItem('video_base_url');
      localStorage.removeItem('video_model_name');

      localStorage.setItem('video_provider', 'gemini');
      localStorage.setItem('text_model', geminiTextModel);
      localStorage.setItem('image_model', geminiImageModel);
      localStorage.setItem('video_model', geminiVideoModel);
    } else {
      localStorage.setItem('text_provider', textProvider);
      localStorage.setItem('image_provider', imageProvider);
      localStorage.setItem('video_provider', videoProvider);

      setStoredValue('text_api_key', textApiKey);
      setStoredValue('text_base_url', textBaseUrl);
      setStoredValue('text_model_name', textModelName);

      setStoredValue('image_api_key', imageApiKey);
      setStoredValue('image_base_url', imageBaseUrl);
      setStoredValue('image_model_name', imageModelName);

      setStoredValue('video_api_key', videoApiKey);
      setStoredValue('video_base_url', videoBaseUrl);
      setStoredValue('video_model_name', videoModelName);
      setStoredValue('qumeng_client_id', qumengClientId);
      setStoredValue('qumeng_access_token', qumengAccessToken);
      setStoredValue('qumeng_refresh_token', qumengRefreshToken);
      setStoredValue('qumeng_account_id', qumengAccountId);
    }

    onClose();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">模型设置</h2>
          <button
            onClick={onClose}
            className="text-slate-400 transition-colors hover:text-slate-600"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[80vh] space-y-6 overflow-y-auto p-6">
          <div>
            <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">
              模式切换
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSettingsMode('gemini')}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  settingsMode === 'gemini'
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="text-sm font-semibold text-slate-800">Gemini 模式</div>
                <p className="mt-1 text-xs text-slate-500">
                  文本、图片、视频都直接走 Gemini 官方模型。
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSettingsMode('tool')}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  settingsMode === 'tool'
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="text-sm font-semibold text-slate-800">工具模式</div>
                <p className="mt-1 text-xs text-slate-500">
                  按供应商切换主流模型，不用再改后台代码。
                </p>
              </button>
            </div>
          </div>

          {settingsMode === 'gemini' ? (
            <>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <FieldLabel>Gemini API Key</FieldLabel>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  留空时继续使用平台默认 Gemini Key。
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <FieldLabel>文本模型</FieldLabel>
                  <select
                    value={geminiTextModel}
                    onChange={(event) => setGeminiTextModel(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  >
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                  </select>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <FieldLabel>图片模型</FieldLabel>
                  <select
                    value={geminiImageModel}
                    onChange={(event) => setGeminiImageModel(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  >
                    <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image</option>
                    <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                  </select>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <FieldLabel>视频模型</FieldLabel>
                  <select
                    value={geminiVideoModel}
                    onChange={(event) => setGeminiVideoModel(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  >
                    <option value="veo-3.1-fast-generate-preview">Veo 3.1 Fast Generate</option>
                    <option value="veo-3.1-generate-preview">Veo 3.1 Generate</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <div className="text-sm font-semibold text-slate-800">快速切换</div>
                <p className="mt-1 text-xs text-slate-500">
                  选择供应商后会自动填入推荐的 Base URL 和模型名，下面仍然可以手动覆盖。
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <FieldLabel>文本供应商</FieldLabel>
                    <select
                      value={textProvider}
                      onChange={(event) => applyTextPreset(event.target.value as ToolTextProvider)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                    >
                      <option value="deepseek">DeepSeek</option>
                      <option value="zhipu">智谱</option>
                      <option value="doubao">豆包</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>图片供应商</FieldLabel>
                    <select
                      value={imageProvider}
                      onChange={(event) => applyImagePreset(event.target.value as ToolImageProvider)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                    >
                      <option value="zhipu">智谱</option>
                      <option value="doubao">豆包 / 即梦</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>视频供应商</FieldLabel>
                    <select
                      value={videoProvider}
                      onChange={(event) => applyVideoPreset(event.target.value as ToolVideoProvider)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                    >
                      <option value="zhipu">智谱</option>
                      <option value="jimeng">即梦</option>
                    </select>
                  </div>
                </div>
              </div>

              <SectionCard
                icon={<MessageSquare className="h-4 w-4 text-indigo-500" />}
                title="文本分析与提示词"
              >
                <div>
                  <FieldLabel>供应商</FieldLabel>
                  <select
                    value={textProvider}
                    onChange={(event) => applyTextPreset(event.target.value as ToolTextProvider)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  >
                    <option value="deepseek">{TEXT_PROVIDER_PRESETS.deepseek.label}</option>
                    <option value="zhipu">{TEXT_PROVIDER_PRESETS.zhipu.label}</option>
                    <option value="doubao">{TEXT_PROVIDER_PRESETS.doubao.label}</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">{selectedTextPreset.helper}</p>
                </div>

                <div>
                  <FieldLabel>API Key</FieldLabel>
                  <input
                    type="password"
                    value={textApiKey}
                    onChange={(event) => setTextApiKey(event.target.value)}
                    placeholder="sk-..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>接口地址 (Base URL)</FieldLabel>
                    <input
                      type="text"
                      value={textBaseUrl}
                      onChange={(event) => setTextBaseUrl(event.target.value)}
                      placeholder={selectedTextPreset.baseUrl}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <FieldLabel>自定义模型名</FieldLabel>
                    <input
                      type="text"
                      value={textModelName}
                      onChange={(event) => setTextModelName(event.target.value)}
                      placeholder={selectedTextPreset.model}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                icon={<ImageIcon className="h-4 w-4 text-pink-500" />}
                title="图片生成"
              >
                <div>
                  <FieldLabel>供应商</FieldLabel>
                  <select
                    value={imageProvider}
                    onChange={(event) => applyImagePreset(event.target.value as ToolImageProvider)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  >
                    <option value="zhipu">{IMAGE_PROVIDER_PRESETS.zhipu.label}</option>
                    <option value="doubao">{IMAGE_PROVIDER_PRESETS.doubao.label}</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">{selectedImagePreset.helper}</p>
                </div>

                <div>
                  <FieldLabel>API Key</FieldLabel>
                  <input
                    type="password"
                    value={imageApiKey}
                    onChange={(event) => setImageApiKey(event.target.value)}
                    placeholder="sk-..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>接口地址 (Base URL)</FieldLabel>
                    <input
                      type="text"
                      value={imageBaseUrl}
                      onChange={(event) => setImageBaseUrl(event.target.value)}
                      placeholder={selectedImagePreset.baseUrl}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <FieldLabel>自定义模型名</FieldLabel>
                    <input
                      type="text"
                      value={imageModelName}
                      onChange={(event) => setImageModelName(event.target.value)}
                      placeholder={selectedImagePreset.model}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                icon={<Video className="h-4 w-4 text-purple-500" />}
                title="视频生成"
              >
                <div>
                  <FieldLabel>供应商</FieldLabel>
                  <select
                    value={videoProvider}
                    onChange={(event) => applyVideoPreset(event.target.value as ToolVideoProvider)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  >
                    <option value="zhipu">{VIDEO_PROVIDER_PRESETS.zhipu.label}</option>
                    <option value="jimeng">{VIDEO_PROVIDER_PRESETS.jimeng.label}</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">{selectedVideoPreset.helper}</p>
                </div>

                <div>
                  <FieldLabel>API Key</FieldLabel>
                  <input
                    type="password"
                    value={videoApiKey}
                    onChange={(event) => setVideoApiKey(event.target.value)}
                    placeholder="sk-..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>接口地址 (Base URL)</FieldLabel>
                    <input
                      type="text"
                      value={videoBaseUrl}
                      onChange={(event) => setVideoBaseUrl(event.target.value)}
                      placeholder={selectedVideoPreset.baseUrl}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <FieldLabel>自定义模型名</FieldLabel>
                    <input
                      type="text"
                      value={videoModelName}
                      onChange={(event) => setVideoModelName(event.target.value)}
                      placeholder={selectedVideoPreset.model}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                icon={<Layers className="h-4 w-4 text-emerald-500" />}
                title="趣盟素材同步"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>App ID / Client ID</FieldLabel>
                    <input
                      type="text"
                      value={qumengClientId}
                      onChange={(event) => setQumengClientId(event.target.value)}
                      placeholder="2000011280753172"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <FieldLabel>账户 ID</FieldLabel>
                    <input
                      type="text"
                      value={qumengAccountId}
                      onChange={(event) => setQumengAccountId(event.target.value)}
                      placeholder="1867672"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Access Token</FieldLabel>
                  <textarea
                    value={qumengAccessToken}
                    onChange={(event) => setQumengAccessToken(event.target.value)}
                    rows={4}
                    placeholder="填写趣盟开放平台返回的 Access Token"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none resize-y"
                  />
                </div>
                <div>
                  <FieldLabel>Refresh Token</FieldLabel>
                  <textarea
                    value={qumengRefreshToken}
                    onChange={(event) => setQumengRefreshToken(event.target.value)}
                    rows={3}
                    placeholder="填写趣盟开放平台返回的 Refresh Token"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none resize-y"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  当前第一版会用 Access Token 和账户 ID 来同步图片素材，App ID 与 Refresh Token 先一起存好，后续接创意创建或 token 刷新时会用到。
                </p>
              </SectionCard>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
