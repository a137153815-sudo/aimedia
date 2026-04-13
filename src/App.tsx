import React, { useState, useRef, useEffect } from 'react';
import { Type } from '@google/genai';
import { UploadCloud, Image as ImageIcon, Video, Loader2, CheckCircle, Copy, Sparkles, Eye, PlayCircle, MousePointerClick, Layers, Film, Target, Sliders, BrainCircuit, Download, Settings, X, LogOut, User, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import ModelSettingsModal from './components/ModelSettingsModal';

type GenerationMode = 'video' | 'image';
type QumengSyncStatus = 'idle' | 'syncing' | 'synced' | 'failed';
type QumengImageSpecKey = 'BIG_IMAGE' | 'IMAGE';

const QUMENG_IMAGE_SPECS: Record<QumengImageSpecKey, {
  label: string;
  sizeLabel: string;
  width: number;
  height: number;
  materialType: QumengImageSpecKey;
  maxBytes: number;
  recommendedAspectRatio: '16:9' | '4:3';
}> = {
  BIG_IMAGE: {
    label: '大图',
    sizeLabel: '690×360',
    width: 690,
    height: 360,
    materialType: 'BIG_IMAGE',
    maxBytes: 500 * 1024,
    recommendedAspectRatio: '16:9',
  },
  IMAGE: {
    label: '小图',
    sizeLabel: '225×150',
    width: 225,
    height: 150,
    materialType: 'IMAGE',
    maxBytes: 100 * 1024,
    recommendedAspectRatio: '4:3',
  },
};

function DraggableOverlay({
  text,
  color,
  stroke,
  strokeWidth,
  fontWeight,
  fontSize,
  defaultPos,
  position,
  onPositionChange,
  containerId
}: {
  text: string;
  color: string;
  stroke: string;
  strokeWidth: number;
  fontWeight: number;
  fontSize: number;
  defaultPos: 'top' | 'middle';
  position?: { x: number, y: number };
  onPositionChange: (pos: { x: number, y: number }) => void;
  containerId: string;
}) {
  const currentPos = position || { x: 50, y: defaultPos === 'top' ? 15 : 50 };
  const [containerWidth, setContainerWidth] = useState<number>(500);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [containerId]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...currentPos };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      const rect = container.getBoundingClientRect();
      
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      
      const newX = startPos.x + (dx / rect.width) * 100;
      const newY = startPos.y + (dy / rect.height) * 100;
      
      onPositionChange({
        x: Math.max(0, Math.min(100, newX)),
        y: Math.max(0, Math.min(100, newY))
      });
    };

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  if (!text) return null;

  return (
    <div 
      className="absolute cursor-move touch-none select-none"
      style={{ 
        left: `${currentPos.x}%`, 
        top: `${currentPos.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 20
      }}
      onPointerDown={handlePointerDown}
    >
      <span 
        className="text-center break-words leading-tight whitespace-nowrap"
        style={{ 
          fontFamily: '"SimHei", "Heiti SC", sans-serif',
          color: color,
          fontWeight: fontWeight,
          fontSize: `${fontSize * (containerWidth / 500)}px`,
          WebkitTextStroke: `${strokeWidth * (containerWidth / 500)}px ${stroke}`,
          textShadow: `0 4px 8px rgba(0,0,0,0.4)`
        }}
      >
        {text}
      </span>
    </div>
  );
}

const videoSchema = {
  type: Type.OBJECT,
  properties: {
    analysis: {
      type: Type.OBJECT,
      properties: {
        visualDynamics: {
          type: Type.OBJECT,
          properties: {
            framing: { type: Type.STRING, description: '镜头景别与构图' },
            camera: { type: Type.STRING, description: '机位与运镜' },
            lighting: { type: Type.STRING, description: '光影与色彩' },
            texture: { type: Type.STRING, description: '画面质感' }
          }
        },
        hookNarrative: {
          type: Type.OBJECT,
          properties: {
            hook: { type: Type.STRING, description: '黄金三秒钩子' },
            character: { type: Type.STRING, description: '人物形象与表现力' },
            pacing: { type: Type.STRING, description: '叙事节奏' }
          }
        },
        interactionCTA: {
          type: Type.OBJECT,
          properties: {
            ui: { type: Type.STRING, description: '界面元素与指引' },
            audio: { type: Type.STRING, description: '音频能量' }
          }
        }
      }
    },
    aiPrompts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          aiPrompt: { type: Type.STRING, description: 'AI 视频生成提示词（中文，可直接用于国内模型）' },
          narrativeAngle: { type: Type.STRING, description: '画面主体或视角变化说明（中文）' }
        },
        required: ['aiPrompt', 'narrativeAngle']
      },
      description: '4 个不同视角的视频提示词，要求风格统一但主体、动作或场景有明显区分。'
    }
  },
  required: ['analysis', 'aiPrompts']
};

const imageSchema = {
  type: Type.OBJECT,
  properties: {
    analysis: {
      type: Type.OBJECT,
      properties: {
        conversionAttraction: {
          type: Type.OBJECT,
          properties: {
            patternInterrupt: { type: Type.STRING, description: '视觉阻断力' },
            nativeAesthetic: { type: Type.STRING, description: '原生感评分' },
            eyeTrackingLogic: { type: Type.STRING, description: '视觉诱导路径' },
            audienceFit: { type: Type.STRING, description: '人群代入感' }
          }
        },
        visualParameters: {
          type: Type.OBJECT,
          properties: {
            framing: { type: Type.STRING, description: '构图与视角' },
            lightingTexture: { type: Type.STRING, description: '光影质感' },
            colorPalette: { type: Type.STRING, description: '色彩心理' },
            safeZoneCheck: { type: Type.STRING, description: '安全区兼容性' }
          }
        },
        psychologicalHooks: {
          type: Type.OBJECT,
          properties: {
            emotionalIndex: { type: Type.STRING, description: '情绪指标' },
            socialDistance: { type: Type.STRING, description: '社交距离' }
          }
        }
      }
    },
    aiPrompts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          aiPrompt: { type: Type.STRING, description: 'AI 绘图提示词（中文，可直接用于国内模型）' },
          narrativeAngle: { type: Type.STRING, description: '画面主体或视角变化说明（中文）' }
        },
        required: ['aiPrompt', 'narrativeAngle']
      },
      description: '4 个不同视角的图片提示词，要求风格统一但主体、动作或场景有明显区分。'
    }
  },
  required: ['analysis', 'aiPrompts']
};

const textMatrixSchema = {
  type: Type.OBJECT,
  properties: {
    industry: { type: Type.STRING, description: '行业' },
    contentType: { type: Type.STRING, description: '内容类型' },
    adGoal: { type: Type.STRING, description: '广告目标' },
    targetAudience: { type: Type.STRING, description: '目标受众' },
    keywords: {
      type: Type.OBJECT,
      properties: {
        theme: { type: Type.ARRAY, items: { type: Type.STRING }, description: '主题词' },
        audience: { type: Type.ARRAY, items: { type: Type.STRING }, description: '受众词' },
        scene: { type: Type.ARRAY, items: { type: Type.STRING }, description: '场景词' },
        tone: { type: Type.ARRAY, items: { type: Type.STRING }, description: '调性词' },
        visualElements: { type: Type.ARRAY, items: { type: Type.STRING }, description: '视觉元素' },
        actionHooks: { type: Type.ARRAY, items: { type: Type.STRING }, description: '行动钩子' }
      }
    }
  }
};

const promptVariationSchema = {
  type: Type.OBJECT,
  properties: {
    aiPrompt: { type: Type.STRING, description: 'AI 绘图或视频生成提示词（中文，可直接用于国内模型）' },
    hookType: { type: Type.STRING, description: '钩子类型，如痛点钩子、好奇钩子、利益钩子' },
    ctaCopy: { type: Type.STRING, description: 'CTA 建议文案' },
    narrativeAngle: { type: Type.STRING, description: '叙事角度说明' }
  },
  required: ['aiPrompt', 'hookType', 'ctaCopy', 'narrativeAngle']
};

const textPromptsSchema = {
  type: Type.OBJECT,
  properties: {
    douyin: {
      type: Type.OBJECT,
      properties: {
        video: { type: Type.ARRAY, items: promptVariationSchema, description: '抖音视频提示词，4 个变体' },
        image: { type: Type.ARRAY, items: promptVariationSchema, description: '抖音图片提示词，4 个变体' }
      },
      required: ['video', 'image']
    },
    xiaohongshu: {
      type: Type.OBJECT,
      properties: {
        video: { type: Type.ARRAY, items: promptVariationSchema, description: '小红书视频提示词，4 个变体' },
        image: { type: Type.ARRAY, items: promptVariationSchema, description: '小红书图片提示词，4 个变体' }
      },
      required: ['video', 'image']
    },
    moments: {
      type: Type.OBJECT,
      properties: {
        video: { type: Type.ARRAY, items: promptVariationSchema, description: '朋友圈视频提示词，4 个变体' },
        image: { type: Type.ARRAY, items: promptVariationSchema, description: '朋友圈图片提示词，4 个变体' }
      },
      required: ['video', 'image']
    }
  },
  required: ['douyin', 'xiaohongshu', 'moments']
};

interface TextAnalysisResult {
  industry: string;
  contentType: string;
  adGoal: string;
  targetAudience: string;
  keywords: {
    theme: string[];
    audience: string[];
    scene: string[];
    tone: string[];
    visualElements: string[];
    actionHooks: string[];
  };
}

interface PromptVariation {
  aiPrompt: string;
  hookType: string;
  ctaCopy: string;
  narrativeAngle: string;
}

interface TextPromptsResult {
  douyin: { video: PromptVariation[]; image: PromptVariation[] };
  xiaohongshu: { video: PromptVariation[]; image: PromptVariation[] };
  moments: { video: PromptVariation[]; image: PromptVariation[] };
}

interface AnalysisResult {
  mode: GenerationMode;
  aiPrompt: string | PromptVariation[];
  videoAnalysis?: {
    visualDynamics: { framing: string; camera: string; lighting: string; texture: string; };
    hookNarrative: { hook: string; character: string; pacing: string; };
    interactionCTA: { ui: string; audio: string; };
  };
  imageAnalysis?: {
    conversionAttraction: { patternInterrupt: string; nativeAesthetic: string; eyeTrackingLogic: string; audienceFit: string; };
    visualParameters: { framing: string; lightingTexture: string; colorPalette: string; safeZoneCheck: string; };
    psychologicalHooks: { emotionalIndex: string; socialDistance: string; };
  };
}

const normalizeRewardWording = (text: string) =>
  text
    .replace(/现金奖励|现金/g, '奖励')
    .replace(/金币奖励|金币/g, '奖励')
    .replace(/可提现/g, '奖励可领取')
    .replace(/赚零花钱/g, '领取奖励');

const normalizePromptText = (text: string) =>
  normalizeRewardWording(text)
    .replace(/文字位于顶部|标题位于顶部|顶部标题/g, '主标题位于画面中间')
    .replace(/物理夸张|超现实/g, '真实自然');

const normalizePromptVariation = (variation: PromptVariation): PromptVariation => ({
  ...variation,
  aiPrompt: normalizePromptText(variation.aiPrompt),
  ctaCopy: normalizeRewardWording(variation.ctaCopy || ''),
  narrativeAngle: variation.narrativeAngle || '',
});

const normalizePromptResult = (value: PromptVariation[] | string) =>
  Array.isArray(value) ? value.map(normalizePromptVariation) : normalizePromptText(value);

const extractFrame = async (file: File): Promise<{dataUrl: string, isPortrait: boolean}> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    
    video.onloadeddata = () => {
      // Seek to 1 second or middle if shorter
      video.currentTime = Math.min(video.duration / 2, 1);
    };
    
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法获取 canvas 上下文'));
        return;
      }
      
      // Scale down if too large to prevent OOM crashes
      const MAX_DIMENSION = 1080;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve({ dataUrl, isPortrait: video.videoHeight > video.videoWidth });
    };

    video.onerror = (e) => {
      reject(e);
    };
  });
};

const getImageDimensions = (file: File): Promise<boolean> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(img.height > img.width);
    };
    img.src = URL.createObjectURL(file);
  });
};

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {};
};

const getSettingsMode = () => localStorage.getItem('settings_mode') === 'tool' ? 'tool' : 'gemini';
const getApiBaseUrl = () => (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const buildApiUrl = (path: string) => {
  const apiBaseUrl = getApiBaseUrl();
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
};

const extractErrorMessage = async (response: Response, fallback: string) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const errorData = await response.json().catch(() => ({}));
    return errorData.error || fallback;
  }

  const text = await response.text().catch(() => '');
  return text || fallback;
};

const apiGenerateContent = async (payload: any, userApiKey: string, baseUrl?: string, customModel?: string) => {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(buildApiUrl('/api/generate-content'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ payload, userApiKey, baseUrl, customModel, mode: getSettingsMode() })
  });
  
  if (!response.ok) {
    const errorMessage = await extractErrorMessage(response, '生成内容失败');
    throw new Error(errorMessage);
  }
  
  return await response.json();
};

const apiGenerateVideos = async (payload: any, userApiKey: string, baseUrl?: string, customModel?: string, provider?: string) => {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(buildApiUrl('/api/generate-videos'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ payload, userApiKey, baseUrl, customModel, provider, mode: getSettingsMode() })
  });
  
  if (!response.ok) {
    const errorMessage = await extractErrorMessage(response, '生成视频失败');
    throw new Error(errorMessage);
  }
  
  return await response.json();
};

const apiGetVideoOperation = async (operationObj: any, userApiKey: string, baseUrl?: string, customModel?: string, provider?: string) => {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(buildApiUrl('/api/get-video-operation'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ operationObj, userApiKey, baseUrl, customModel, provider, mode: getSettingsMode() })
  });
  
  if (!response.ok) {
    const errorMessage = await extractErrorMessage(response, '获取视频操作状态失败');
    throw new Error(errorMessage);
  }
  
  return await response.json();
};

const apiFetchVideo = async (downloadLink: string, userApiKey: string) => {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(buildApiUrl('/api/fetch-video'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ downloadLink, userApiKey })
  });

  if (!response.ok) {
    const errorMessage = await extractErrorMessage(response, `获取视频失败: ${response.statusText}`);
    throw new Error(errorMessage);
  }

  return response;
};

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 2000): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const isRetryable = 
        error?.status === 503 || 
        error?.status === 500 ||
        error?.status === 429 || 
        error?.message?.includes('503') || 
        error?.message?.includes('500') ||
        error?.message?.includes('429') ||
        error?.message?.includes('high demand') ||
        error?.message?.includes('UNAVAILABLE') ||
        error?.message?.includes('Internal Server Error');
        
      if (attempt >= maxRetries || !isRetryable) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`API call failed with retryable error. Retrying in ${delay}ms (Attempt ${attempt} of ${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('已达到最大重试次数');
};

export default function App() {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [textApiKey, setTextApiKey] = useState(() => localStorage.getItem('text_api_key') || '');
  const [textBaseUrl, setTextBaseUrl] = useState(() => localStorage.getItem('text_base_url') || '');
  const [textModelName, setTextModelName] = useState(() => localStorage.getItem('text_model_name') || '');
  
  const [imageApiKey, setImageApiKey] = useState(() => localStorage.getItem('image_api_key') || '');
  const [imageBaseUrl, setImageBaseUrl] = useState(() => localStorage.getItem('image_base_url') || '');
  const [imageModelName, setImageModelName] = useState(() => localStorage.getItem('image_model_name') || '');
  
  const [videoApiKey, setVideoApiKey] = useState(() => localStorage.getItem('video_api_key') || '');
  const [videoBaseUrl, setVideoBaseUrl] = useState(() => localStorage.getItem('video_base_url') || '');
  const [videoModelName, setVideoModelName] = useState(() => localStorage.getItem('video_model_name') || '');
  const [videoProvider, setVideoProvider] = useState(() => localStorage.getItem('video_provider') || 'gemini');
  
  const [textModel, setTextModel] = useState(() => localStorage.getItem('text_model') || 'gemini-3.1-pro-preview');
  const [imageModel, setImageModel] = useState(() => localStorage.getItem('image_model') || 'gemini-3.1-flash-image-preview');
  const [videoModel, setVideoModel] = useState(() => localStorage.getItem('video_model') || 'veo-3.1-fast-generate-preview');

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const checkApiKey = async () => {
      const hasAnyKey = localStorage.getItem('text_api_key') || localStorage.getItem('image_api_key') || localStorage.getItem('video_api_key');
      if (hasAnyKey) {
        setHasApiKey(true);
        return;
      }

      if ((window as any).aistudio && (window as any).aistudio.hasSelectedApiKey) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        // If not running in AI Studio environment, assume true for local dev
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio && (window as any).aistudio.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      // Assume success after triggering openSelectKey
      setHasApiKey(true);
    }
  };

  const saveSettings = () => {
    if (textApiKey.trim()) localStorage.setItem('text_api_key', textApiKey.trim());
    else localStorage.removeItem('text_api_key');
    if (textBaseUrl.trim()) localStorage.setItem('text_base_url', textBaseUrl.trim());
    else localStorage.removeItem('text_base_url');
    if (textModelName.trim()) localStorage.setItem('text_model_name', textModelName.trim());
    else localStorage.removeItem('text_model_name');
    
    if (imageApiKey.trim()) localStorage.setItem('image_api_key', imageApiKey.trim());
    else localStorage.removeItem('image_api_key');
    if (imageBaseUrl.trim()) localStorage.setItem('image_base_url', imageBaseUrl.trim());
    else localStorage.removeItem('image_base_url');
    if (imageModelName.trim()) localStorage.setItem('image_model_name', imageModelName.trim());
    else localStorage.removeItem('image_model_name');
    
    if (videoApiKey.trim()) localStorage.setItem('video_api_key', videoApiKey.trim());
    else localStorage.removeItem('video_api_key');
    if (videoBaseUrl.trim()) localStorage.setItem('video_base_url', videoBaseUrl.trim());
    else localStorage.removeItem('video_base_url');
    if (videoModelName.trim()) localStorage.setItem('video_model_name', videoModelName.trim());
    else localStorage.removeItem('video_model_name');

    localStorage.setItem('video_provider', videoProvider);
    localStorage.setItem('text_model', textModel);
    localStorage.setItem('image_model', imageModel);
    localStorage.setItem('video_model', videoModel);
    setIsSettingsOpen(false);
    
    // Re-check api key status
    if (textApiKey.trim() || imageApiKey.trim() || videoApiKey.trim()) {
      setHasApiKey(true);
    }
  };

  const [inputType, setInputType] = useState<'upload' | 'text'>('upload');
  const [textInput, setTextInput] = useState("");
  const [textMatrix, setTextMatrix] = useState<TextAnalysisResult | null>(null);
  const [isEditingMatrix, setIsEditingMatrix] = useState(false);
  const [textPrompts, setTextPrompts] = useState<TextPromptsResult | null>(null);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<'douyin' | 'xiaohongshu' | 'moments'>('douyin');

  const [generationMode, setGenerationMode] = useState<GenerationMode>('video');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [generatedMedia, setGeneratedMedia] = useState<string[]>([]);
  const [generatedMediaPromptIndices, setGeneratedMediaPromptIndices] = useState<number[]>([]);
  const [mediaGenerationProgress, setMediaGenerationProgress] = useState<string>("");
  const [mediaGenerationError, setMediaGenerationError] = useState<string | null>(null);
  const [qumengSyncStates, setQumengSyncStates] = useState<Record<number, { status: QumengSyncStatus; materialId?: string; error?: string }>>({});
  const [isBulkSyncingToQumeng, setIsBulkSyncingToQumeng] = useState(false);
  const [qumengSyncSummary, setQumengSyncSummary] = useState<string | null>(null);
  
  const [mediaBase64, setMediaBase64] = useState<{data: string, mimeType: string} | null>(null);
  const [mediaAspectRatio, setMediaAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  
  // Video Generation Settings
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [selectedImageSpec, setSelectedImageSpec] = useState<QumengImageSpecKey>(() => {
    const stored = localStorage.getItem('qumeng_image_spec');
    return stored === 'IMAGE' ? 'IMAGE' : 'BIG_IMAGE';
  });
  const [generationMethod, setGenerationMethod] = useState<'reference' | 'prompt'>('reference');
  const [referenceSimilarity, setReferenceSimilarity] = useState<number>(50);
  const [overlayText, setOverlayText] = useState("");
  const [overlayColor, setOverlayColor] = useState("#ffffff");
  const [overlayStroke, setOverlayStroke] = useState("#000000");
  const [overlayStrokeWidth, setOverlayStrokeWidth] = useState<number>(1.5);
  const [overlayFontWeight, setOverlayFontWeight] = useState<number>(700);
  const [overlayFontSize, setOverlayFontSize] = useState<number>(36);
  const [overlayPosition, setOverlayPosition] = useState<'top' | 'middle'>('middle');
  const [textPositions, setTextPositions] = useState<{ [key: number]: { x: number, y: number } }>({});

  // Reset text positions when default position changes
  useEffect(() => {
    setTextPositions({});
  }, [overlayPosition]);

  useEffect(() => {
    setQumengSyncStates({});
    setIsBulkSyncingToQumeng(false);
    setQumengSyncSummary(null);
  }, [generatedMedia, results?.mode, selectedImageSpec]);

  useEffect(() => {
    localStorage.setItem('qumeng_image_spec', selectedImageSpec);
  }, [selectedImageSpec]);

  const currentQumengImageSpec = QUMENG_IMAGE_SPECS[selectedImageSpec];
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setResults(null);
      setError(null);
      setMediaBase64(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && (droppedFile.type.startsWith('image/') || droppedFile.type.startsWith('video/'))) {
      setFile(droppedFile);
      setPreviewUrl(URL.createObjectURL(droppedFile));
      setResults(null);
      setError(null);
      setMediaBase64(null);
    }
  };

  const analyzeText = async () => {
    if (!textInput.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setTextMatrix(null);
    setTextPrompts(null);
    setResults(null);

    try {
      const prompt = `你是一名资深信息流投放策略师。请根据下面的业务描述，输出一个适合广告素材策划的关键词矩阵。

用户输入：
${textInput}

请返回结构化结果，包含：
1. 行业
2. 内容类型
3. 广告目标
4. 目标受众
5. keywords:
   - theme: 主题词
   - audience: 受众词
   - scene: 场景词
   - tone: 调性词
   - visualElements: 视觉元素
   - actionHooks: 行动钩子

补充要求：
- 关键词要面向信息流广告投放，不要写空泛描述。
- 如果是问卷、调研、投票、测试、报名等转化场景，关键词里要体现参与感、互动感、手机操作感。
- 如果存在激励机制，统一使用“奖励、参与奖励、完成奖励”这类中性表达，不要出现现金、金币、可提现、代金券、优惠券、礼品卡。
- 场景词和视觉元素要尽量贴近真实投放素材，而不是论文式总结。`;

      const response = await withRetry(() => apiGenerateContent({
        model: textModelName || textModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: textMatrixSchema,
        }
      }, textApiKey, textBaseUrl, textModelName));

      const jsonStr = response.text;
      if (jsonStr) {
         const parsed = JSON.parse(jsonStr);
         setTextMatrix(parsed);
      } else {
         throw new Error("AI 返回内容为空");
      }
    } catch (err: any) {
      console.error("Text analysis failed:", err);
      const errorMessage = err.message || '分析失败，请重试。';
      
      if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
        if (textApiKey) {
          setError('您在设置中填写的文本 API Key 无效，请检查是否填写正确。');
        } else {
          setError('平台默认 API Key 无效。请重新选择项目，或在设置中填写您自己的 Key。');
          setHasApiKey(false);
        }
      } else if (errorMessage.includes("Requested entity was not found")) {
        setError('找不到请求的模型或资源。');
        if (!textApiKey) setHasApiKey(false);
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generatePromptsFromMatrix = async () => {
    if (!textMatrix) return;
    setIsGeneratingPrompts(true);
    setError(null);

    try {
      const prompt = `请根据下面的广告关键词矩阵，为【抖音】【小红书】【朋友圈】分别生成【视频】和【图片】AI 生成提示词。

关键词矩阵：
${JSON.stringify(textMatrix, null, 2)}

输出要求：
- 每个平台的 video 和 image 都生成 4 个变体。
- 每个变体都要返回 aiPrompt、hookType、ctaCopy、narrativeAngle。
- aiPrompt 用中文写，要求可以直接给国内模型使用，例如智谱、豆包、即梦。
- 不要写成抽象概念，要直接描述主体、动作、镜头、光线、背景、情绪、构图、留白。

视频提示词要求：
- 强制无字，不要出现任何可见文字、字幕、Logo、水印、按钮字。
- 顶部或底部预留干净文案区，方便后期叠加正确文案。
- 重点保证主体一致、服装一致、场景相关、镜头有变化。

图片提示词要求：
- 如果是海报或调研招募类素材，画面里只保留一个主标题，不要堆很多文字。
- 主标题固定放在画面中间，其他位置不要再出现补充文案、金额文案或按钮字。
- 背景必须和行业、内容主题、调研对象强相关，不要套泛用背景。
- 更偏向真实投放海报风格，而不是设计练习作品。
- 必须是符合物理常识的真实场景，人物动作、手势、道具关系都要自然可信。
- 如果出现人物手持手机展示内容，必须展示手机正面屏幕，不要出现拿着手机背面给镜头看的错误画面。
- 必须先根据关键词矩阵判断行业语境再出图：例如输入网文调研、小说调研、阅读偏好调研时，画面必须围绕“看小说/看网文”的真实阅读场景展开，如手机阅读、追更、书荒选择、夜间阅读、通勤阅读等。
- 不要出现现金、金币、红包、可提现等字样，一律用“奖励”表达。

投放要求：
- 抖音：强调节奏快、冲击力强、情绪明显、竖屏友好。
- 小红书：强调生活方式感、精致感、原生感、清爽留白。
- 朋友圈：强调真实感、熟人传播感、可信度和轻互动感。

转化文案要求：
- 如果是问卷、调研、投票、测试类转化，请统一写“奖励、参与奖励、完成奖励”等表达。
- 不要出现现金、金币、可提现、代金券、优惠券、礼品卡、赠品券。

差异化要求：
- 4 个变体必须使用不同的叙事角度，例如痛点切入、结果诱导、好奇钩子、利益钩子、群体认同、悬念推进。
- 保持核心主题一致，但不要生成 4 个几乎一样的提示词。`;

      const response = await withRetry(() => apiGenerateContent({
        model: textModelName || textModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: textPromptsSchema,
        }
      }, textApiKey, textBaseUrl, textModelName));

      const jsonStr = response.text;
      if (jsonStr) {
         const parsed = JSON.parse(jsonStr);
         const normalizedPrompts: TextPromptsResult = {
           douyin: {
             video: parsed.douyin.video.map(normalizePromptVariation),
             image: parsed.douyin.image.map(normalizePromptVariation),
           },
           xiaohongshu: {
             video: parsed.xiaohongshu.video.map(normalizePromptVariation),
             image: parsed.xiaohongshu.image.map(normalizePromptVariation),
           },
           moments: {
             video: parsed.moments.video.map(normalizePromptVariation),
             image: parsed.moments.image.map(normalizePromptVariation),
           },
         };
         setTextPrompts(normalizedPrompts);
         
         let safeAiPrompt = normalizedPrompts[selectedPlatform]?.[generationMode];
         if (safeAiPrompt && typeof safeAiPrompt === 'object' && !Array.isArray(safeAiPrompt)) {
           safeAiPrompt = JSON.stringify(safeAiPrompt, null, 2);
         }
         
         // Automatically set the results.aiPrompt to the selected platform and mode
         setResults({
           mode: generationMode,
           aiPrompt: safeAiPrompt || "未生成提示词"
         });
      } else {
         throw new Error("AI 返回内容为空");
      }
    } catch (err: any) {
      console.error("Prompt generation failed:", err);
      const errorMessage = err.message || '提示词生成失败，请重试。';
      
      if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
        if (textApiKey) {
          setError('您在设置中填写的文本 API Key 无效，请检查是否填写正确。');
        } else {
          setError('平台默认 API Key 无效。请重新选择项目，或在设置中填写您自己的 Key。');
          setHasApiKey(false);
        }
      } else if (errorMessage.includes("Requested entity was not found")) {
        setError('找不到请求的模型或资源。');
        if (!textApiKey) setHasApiKey(false);
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  const analyzeMedia = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    setError(null);
    
    try {
      let base64Data = '';
      let mimeType = '';
      let isPortrait = false;

      if (file.type.startsWith('video/')) {
        const { dataUrl, isPortrait: portrait } = await extractFrame(file);
        base64Data = dataUrl.split(',')[1];
        mimeType = 'image/jpeg';
        isPortrait = portrait;
      } else {
        isPortrait = await getImageDimensions(file);
        
        // Scale down image to prevent OOM and Vercel 4.5MB payload limit
        const result = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('无法获取 canvas 上下文'));
              return;
            }
            
            const MAX_DIMENSION = 1080;
            let width = img.width;
            let height = img.height;
            
            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
              if (width > height) {
                height = Math.round((height * MAX_DIMENSION) / width);
                width = MAX_DIMENSION;
              } else {
                width = Math.round((width * MAX_DIMENSION) / height);
                height = MAX_DIMENSION;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
        
        base64Data = result.split(',')[1];
        mimeType = 'image/jpeg';
      }

      setMediaBase64({ data: base64Data, mimeType });
      setMediaAspectRatio(isPortrait ? '9:16' : '16:9');
      setSelectedAspectRatio(isPortrait ? '9:16' : '16:9');

      let prompt = "";
      let currentSchema = null;

      if (generationMode === 'video') {
        prompt = `请分析这张图片或视频截图，并按以下 9 个维度输出结构化结论：
1. 镜头景别与构图
2. 机位与运镜
3. 光影与色彩
4. 画面质感
5. 黄金三秒钩子
6. 人物形象与表现力
7. 叙事节奏
8. 画面中的界面元素与交互指引
9. 音频策略或音频联想

分析完成后，再生成 4 个视频提示词变体，要求：
- 提示词用中文写，可直接给智谱、豆包、即梦等国内模型使用。
- 保持参考画面的主体、服装、道具、背景风格和文化语境。
- 明确写出主体人数，避免生成人数错误。
- 强制无字，不要出现字幕、Logo、水印、按钮字。
- 预留顶部或底部干净留白区，方便后期叠加文案。
- 4 个变体需要在镜头、动作、景别或场景细节上有明显区分。
- 每个变体返回一个简短中文 narrativeAngle，说明它和原图的差异点。`;
        currentSchema = videoSchema;
      } else {
        prompt = `你是一名信息流广告素材分析师。请先分析这张图片在投放层面的结构，并输出以下维度：
1. 视觉阻断力
2. 原生感评分
3. 视觉诱导路径
4. 人群代入感
5. 构图与视角
6. 光影质感
7. 色彩心理
8. 安全区兼容性
9. 情绪指标
10. 社交距离

在分析后，再生成 4 个图片提示词变体，要求：
- 提示词用中文写，可直接给智谱、豆包等国内模型使用。
- 明确主体人数、主体关系、姿态、构图、背景、光线和材质细节。
- 如果是海报、调研招募、活动推广类画面，默认只保留一个主标题，不要堆叠大量文字。
- 主标题固定在画面中间，其他位置不要再出现现金文案、金额文案或按钮字。
- 背景必须和行业、活动内容、目标用户强相关，避免空洞背景。
- 保持原图风格、质感和文化氛围一致，但 4 个变体在镜头、动作、元素或场景上要有明确差异。
- 必须符合真实场景和物理常识，人物动作、道具关系、透视逻辑都要可信。
- 如果画面有人拿手机展示内容，必须展示手机正面屏幕而不是背面。
- 奖励类措辞统一使用“奖励”，不要出现现金、金币、可提现等字样。
- 每个变体返回一个简短中文 narrativeAngle，说明差异点。`;
        currentSchema = imageSchema;
      }

      const response = await withRetry(() => apiGenerateContent({
        model: textModelName || textModel,
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: currentSchema,
        }
      }, textApiKey, textBaseUrl, textModelName));

      const jsonStr = response.text;
      if (jsonStr) {
         const parsed = JSON.parse(jsonStr);
         let safeAiPrompt = normalizePromptResult(parsed.aiPrompts || parsed.aiPrompt);
         if (safeAiPrompt && typeof safeAiPrompt === 'object' && !Array.isArray(safeAiPrompt)) {
           safeAiPrompt = JSON.stringify(safeAiPrompt, null, 2);
         }
         setResults({
           mode: generationMode,
           aiPrompt: safeAiPrompt || "未生成提示词",
           videoAnalysis: generationMode === 'video' ? parsed.analysis : undefined,
           imageAnalysis: generationMode === 'image' ? parsed.analysis : undefined,
         });
      } else {
         throw new Error("AI 返回内容为空");
      }
    } catch (err: any) {
      console.error("Analysis failed:", err);
      const errorMessage = err.message || '分析失败，请重试。';
      
      if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
        if (textApiKey) {
          setError('您在设置中填写的文本 API Key 无效，请检查是否填写正确。');
        } else {
          setError('平台默认 API Key 无效。请重新选择项目，或在设置中填写您自己的 Key。');
          setHasApiKey(false);
        }
      } else if (errorMessage.includes("Requested entity was not found")) {
        setError('找不到请求的模型或资源。');
        if (!textApiKey) setHasApiKey(false);
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyPrompt = () => {
    if (results?.aiPrompt) {
      const textToCopy = Array.isArray(results.aiPrompt) 
        ? results.aiPrompt.map((p, i) => {
            const parts = [`Variation ${i + 1}`];
            const tags = [p.narrativeAngle, p.hookType].filter(Boolean);
            if (tags.length > 0) {
              parts.push(`(${tags.join(' - ')})`);
            }
            parts.push(`:\n${p.aiPrompt}`);
            if (p.ctaCopy) {
              parts.push(`\nCTA: ${p.ctaCopy}`);
            }
            return parts.join('');
          }).join('\n\n---\n\n')
        : results.aiPrompt;
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const requestSingleImage = async (basePrompt: string) => {
    const isReference = inputType === 'upload' && generationMethod === 'reference' && mediaBase64;
          const response = await withRetry(() => apiGenerateContent({
            model: imageModelName || imageModel,
            contents: {
              parts: [
          ...(isReference ? [{
            inlineData: {
              data: mediaBase64.data,
              mimeType: mediaBase64.mimeType
            }
          }] : []),
          {
            text: isReference
              ? `${basePrompt}. Maintain ${referenceSimilarity}% similarity to the reference image's ART STYLE and VIBE, but ensure the content/subject matches the prompt description.`
              : basePrompt
          }
        ]
      },
            config: {
              imageConfig: {
                aspectRatio: currentQumengImageSpec.recommendedAspectRatio,
                imageSize: "1K"
              }
            }
    }, imageApiKey, imageBaseUrl, imageModelName));

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64EncodeString = part.inlineData.data;
        return `data:${part.inlineData.mimeType};base64,${base64EncodeString}`;
      }
    }
    throw new Error('API 未返回图像数据');
  };

  const generateMedia = async () => {
    if (!results?.aiPrompt) return;
    
    setIsGeneratingMedia(true);
    setMediaGenerationError(null);
    setGeneratedMedia([]);
    setGeneratedMediaPromptIndices([]);
    
    try {
      setMediaGenerationProgress("Checking API key...");

      if (results.mode === 'video') {
        setMediaGenerationProgress("Initializing Veo 3.1 model for 4 videos...");
        
        const generateSingleVideo = async (index: number) => {
          const basePrompt = Array.isArray(results.aiPrompt) ? results.aiPrompt[index].aiPrompt : results.aiPrompt;
          let operation = await withRetry(() => apiGenerateVideos({
            model: videoModelName || videoModel,
            prompt: generationMethod === 'reference' && mediaBase64 
              ? `${basePrompt}. Maintain ${referenceSimilarity}% similarity to the reference image's ART STYLE and VIBE, but ensure the content/subject matches the prompt description.`
              : basePrompt,
            ...(generationMethod === 'reference' && mediaBase64 ? {
              image: {
                imageBytes: mediaBase64.data,
                mimeType: mediaBase64.mimeType
              }
            } : {}),
            config: {
              numberOfVideos: 1,
              resolution: '720p',
              aspectRatio: selectedAspectRatio
            }
          }, videoApiKey, videoBaseUrl, videoModelName, videoProvider));

          while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await withRetry(() => apiGetVideoOperation(operation, videoApiKey, videoBaseUrl, videoModelName, videoProvider));
          }

          const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
          if (!downloadLink) {
            throw new Error('视频生成已完成，但未返回视频 URI。');
          }

          const response = await apiFetchVideo(downloadLink, videoApiKey);

          if (!response.ok) {
            throw new Error(`下载视频失败: ${response.statusText}`);
          }

          const blob = await response.blob();
          return URL.createObjectURL(blob);
        };

        setMediaGenerationProgress("Generating 4 videos sequentially... This usually takes 1-3 minutes per video. Please don't close this window.");
        
        const successfulMedia: string[] = [];
        for (let i = 0; i < 4; i++) {
          try {
            setMediaGenerationProgress(`Generating video ${i + 1} of 4...`);
            const videoUrl = await generateSingleVideo(i);
            successfulMedia.push(videoUrl);
            setGeneratedMedia([...successfulMedia]); // Update UI progressively
            // Add a small delay between requests to avoid rate limits
            if (i < 3) await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (err) {
            console.error(`Failed to generate video ${i + 1}:`, err);
          }
        }
        
        if (successfulMedia.length === 0) {
          throw new Error('4 个视频生成均失败，请重试。');
        }

        setGeneratedMedia(successfulMedia);
        
        if (successfulMedia.length < 4) {
          setMediaGenerationError(`由于 API 限制或错误，4 个视频中只有 ${successfulMedia.length} 个生成成功。`);
        }
      } else {
        setMediaGenerationProgress("Generating 4 images sequentially... Please wait.");
        
        const successfulMedia: string[] = [];
        const sourcePromptIndices: number[] = [];
        for (let i = 0; i < 4; i++) {
          try {
            setMediaGenerationProgress(`Generating image ${i + 1} of 4...`);
            const basePrompt = Array.isArray(results.aiPrompt) ? results.aiPrompt[i].aiPrompt : results.aiPrompt;
            const imageUrl = await requestSingleImage(basePrompt);
            successfulMedia.push(imageUrl);
            sourcePromptIndices.push(i);
            setGeneratedMedia([...successfulMedia]); // Update UI progressively
            setGeneratedMediaPromptIndices([...sourcePromptIndices]);
            // Add a small delay between requests to avoid rate limits
            if (i < 3) await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (err) {
            console.error(`Failed to generate image ${i + 1}:`, err);
          }
        }
        
        if (successfulMedia.length === 0) {
          throw new Error('4 个图像生成均失败，请重试。');
        }

        setGeneratedMedia(successfulMedia);
        setGeneratedMediaPromptIndices(sourcePromptIndices);
        
        if (successfulMedia.length < 4) {
          setMediaGenerationError(`由于 API 限制或错误，4 个图像中只有 ${successfulMedia.length} 个生成成功。`);
        }
      }
      
      setMediaGenerationProgress("");

    } catch (err: any) {
      console.error("Media generation failed:", err);
      const errorMessage = err.message || '生成媒体失败，请重试。';
      
      if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
        if (videoApiKey) {
          setMediaGenerationError('您在设置中填写的视频 API Key 无效，请检查是否填写正确。');
        } else {
          setMediaGenerationError('平台默认 API Key 无效。请重新选择项目，或在设置中填写您自己的 Key。');
          setHasApiKey(false);
        }
      } else if (errorMessage.includes("Requested entity was not found")) {
        setMediaGenerationError('找不到请求的模型或资源。');
        if (!videoApiKey) setHasApiKey(false);
      } else {
        setMediaGenerationError(errorMessage);
      }
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  const handleSaveAllImages = async () => {
    if (results?.mode !== 'image' || generatedMedia.length === 0) return;

    for (let i = 0; i < generatedMedia.length; i++) {
      const url = generatedMedia[i];
      if (!overlayText) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `generated_image_${i + 1}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        const img = new Image();
        img.crossOrigin = "anonymous";
        
        await new Promise<void>((resolve) => {
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const scaledFontSize = overlayFontSize * (img.width / 500);
            ctx.font = `${overlayFontWeight} ${scaledFontSize}px "SimHei", "Heiti SC", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            ctx.shadowColor = 'rgba(0,0,0,0.4)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4;

            const pos = textPositions[i] || { x: 50, y: overlayPosition === 'top' ? 15 : 50 };
            const x = canvas.width * (pos.x / 100);
            const y = canvas.height * (pos.y / 100);

            if (overlayStrokeWidth > 0) {
              ctx.lineWidth = overlayStrokeWidth * (img.width / 500);
              ctx.strokeStyle = overlayStroke;
              ctx.strokeText(overlayText, x, y);
            }

            ctx.fillStyle = overlayColor;
            ctx.fillText(overlayText, x, y);

            const dataUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `generated_image_${i + 1}_with_text.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            resolve();
          };
          img.src = url;
        });
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  const generateSingleImageFromPrompt = async (index: number) => {
    if (!results?.aiPrompt || results.mode !== 'image' || !Array.isArray(results.aiPrompt)) return;

    setIsGeneratingMedia(true);
    setMediaGenerationError(null);
    setGeneratedMedia([]);
    setGeneratedMediaPromptIndices([]);

    try {
      setMediaGenerationProgress(`Generating image for prompt ${index + 1}...`);
      const imageUrl = await requestSingleImage(results.aiPrompt[index].aiPrompt);
      setGeneratedMedia([imageUrl]);
      setGeneratedMediaPromptIndices([index]);
      setMediaGenerationProgress('');
    } catch (err: any) {
      const errorMessage = err?.message || '生成单张图片失败，请重试。';
      setMediaGenerationError(errorMessage);
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  const buildQumengImageDataUrl = async (url: string, index: number) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法生成趣盟同步图片。');
    }

    const targetWidth = currentQumengImageSpec.width;
    const targetHeight = currentQumengImageSpec.height;
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const offsetX = (targetWidth - drawWidth) / 2;
        const offsetY = (targetHeight - drawHeight) / 2;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        if (overlayText) {
          const scaledFontSize = overlayFontSize * (targetWidth / 500);
          ctx.font = `${overlayFontWeight} ${scaledFontSize}px "SimHei", "Heiti SC", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.4)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4;

          const pos = textPositions[index] || { x: 50, y: overlayPosition === 'top' ? 15 : 50 };
          const x = canvas.width * (pos.x / 100);
          const y = canvas.height * (pos.y / 100);

          if (overlayStrokeWidth > 0) {
            ctx.lineWidth = overlayStrokeWidth * (targetWidth / 500);
            ctx.strokeStyle = overlayStroke;
            ctx.strokeText(overlayText, x, y);
          }

          ctx.fillStyle = overlayColor;
          ctx.fillText(overlayText, x, y);
        }

        resolve();
      };
      img.onerror = () => reject(new Error('无法读取待同步图片。'));
      img.src = url;
    });

    let quality = 0.92;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);

    while (quality > 0.45) {
      const base64 = dataUrl.split(',')[1] || '';
      const estimatedBytes = Math.ceil((base64.length * 3) / 4);
      if (estimatedBytes <= currentQumengImageSpec.maxBytes) {
        break;
      }

      quality -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', Math.max(quality, 0.4));
    }

    const finalBase64 = dataUrl.split(',')[1] || '';
    const finalBytes = Math.ceil((finalBase64.length * 3) / 4);
    if (finalBytes > currentQumengImageSpec.maxBytes) {
      throw new Error(`上传文件要小于${Math.ceil(currentQumengImageSpec.maxBytes / 1024)}K（当前约 ${Math.ceil(finalBytes / 1024)}K）`);
    }

    return dataUrl;
  };

  const uploadImageToQumeng = async (imageDataUrl: string) => {
    const accessToken = localStorage.getItem('qumeng_access_token') || '';
    const accountId = localStorage.getItem('qumeng_account_id') || '';

    if (!accessToken.trim()) {
      throw new Error('请先在设置中填写趣盟 Access Token。');
    }

    if (!accountId.trim()) {
      throw new Error('请先在设置中填写趣盟账户 ID。');
    }

    const response = await fetch('/api/qumeng/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageDataUrl,
        accessToken,
        accountId,
        materialType: currentQumengImageSpec.materialType,
        fileName: `qumeng-image-${Date.now()}.jpg`,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result?.success) {
      throw new Error(result?.error || '趣盟图片上传失败。');
    }

    return result as { materialId: string; remoteUrl?: string; materialType?: string };
  };

  const syncSingleImageToQumeng = async (index: number) => {
    if (results?.mode !== 'image') return;

    setQumengSyncStates(prev => ({
      ...prev,
      [index]: { status: 'syncing' }
    }));

    try {
      const imageDataUrl = await buildQumengImageDataUrl(generatedMedia[index], index);
      const result = await uploadImageToQumeng(imageDataUrl);

      setQumengSyncStates(prev => ({
        ...prev,
        [index]: {
          status: 'synced',
          materialId: result.materialId,
        }
      }));
    } catch (err: any) {
      const errorMessage = err?.message || '同步失败，请稍后重试。';
      setQumengSyncStates(prev => ({
        ...prev,
        [index]: {
          status: 'failed',
          error: errorMessage,
        }
      }));
      setQumengSyncSummary(errorMessage);
    }
  };

  const syncAllImagesToQumeng = async () => {
    if (results?.mode !== 'image' || generatedMedia.length === 0) return;

    setIsBulkSyncingToQumeng(true);
    setQumengSyncSummary(null);

    for (let i = 0; i < generatedMedia.length; i++) {
      await syncSingleImageToQumeng(i);
    }

    setIsBulkSyncingToQumeng(false);
    setQumengSyncSummary('批量同步已执行完成，请查看每张图片卡片上的同步结果。');
  };

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <Sparkles className="w-12 h-12 text-indigo-600 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-slate-900 mb-4">需要 API Key</h1>
          <p className="text-slate-600 mb-8">
            此应用程序使用高级 Gemini 模型，需要付费的 Google Cloud API Key。请选择您的 API Key 以继续。
            <br />
            <br />
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
              了解有关计费的更多信息
            </a>
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-indigo-600 text-white font-medium py-3 px-6 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            选择 API Key
          </button>
        </div>
      </div>
    );
  }

  if (hasApiKey === null) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
    </div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-800">媒体分析专家 (Media Analyzer Pro)</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-500 font-medium hidden sm:block">
            {getSettingsMode() === 'tool' ? '工具模式已启用' : 'Gemini 模式已启用'}
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-100 px-3 py-1.5 rounded-full">
                <User className="w-4 h-4" />
                <span className="max-w-[100px] truncate">{user.email}</span>
              </div>
              <button 
                onClick={() => supabase.auth.signOut()}
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="登出"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              登录
            </button>
          )}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="设置"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>
      
      {/* Auth Modal */}
      {isAuthOpen && <Auth onClose={() => setIsAuthOpen(false)} />}
      
      {/* Settings Modal */}
      {isSettingsOpen && <ModelSettingsModal onClose={() => setIsSettingsOpen(false)} />}
      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Upload & Preview */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                {inputType === 'upload' ? <UploadCloud className="w-5 h-5 text-indigo-500" /> : <Layers className="w-5 h-5 text-indigo-500" />}
                {inputType === 'upload' ? '上传媒体' : '文本输入'}
              </h2>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setInputType('upload')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${inputType === 'upload' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  上传
                </button>
                <button
                  onClick={() => setInputType('text')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${inputType === 'text' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  文本
                </button>
              </div>
            </div>

            <div className="flex gap-3 mb-6">
              <button 
                onClick={() => {
                  setGenerationMode('video');
                  if (inputType === 'text' && textPrompts) {
                    setResults(prev => prev ? { ...prev, mode: 'video', aiPrompt: textPrompts[selectedPlatform].video } : null);
                  }
                }} 
                className={`flex-1 py-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-colors
                  ${generationMode === 'video' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <Film className="w-5 h-5" />
                <span className="text-xs font-semibold">视频模式</span>
              </button>
              <button 
                onClick={() => {
                  setGenerationMode('image');
                  if (inputType === 'text' && textPrompts) {
                    setResults(prev => prev ? { ...prev, mode: 'image', aiPrompt: textPrompts[selectedPlatform].image } : null);
                  }
                }} 
                className={`flex-1 py-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-colors
                  ${generationMode === 'image' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <ImageIcon className="w-5 h-5" />
                <span className="text-xs font-semibold">图片模式</span>
              </button>
            </div>

            {inputType === 'upload' ? (
              <>
                <div 
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                    ${file ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*,video/*" 
                    className="hidden" 
                  />
                  
                  {!file ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">点击上传或拖拽文件到这里</p>
                        <p className="text-xs text-slate-500 mt-1">支持图片或视频 (MP4)</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                        {file.type.startsWith('video/') ? (
                          <Video className="w-6 h-6 text-indigo-600" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-indigo-600" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-indigo-900 truncate max-w-[200px]">{file.name}</p>
                        <p className="text-xs text-indigo-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                  )}
                </div>

                {previewUrl && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-slate-700 mb-3">预览</h3>
                    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video relative flex items-center justify-center">
                      {file?.type.startsWith('video/') ? (
                        <video src={previewUrl} controls className="max-w-full max-h-full object-contain" />
                      ) : (
                        <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain" />
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={analyzeMedia}
                  disabled={!file || isAnalyzing}
                  className={`w-full mt-6 py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all
                    ${!file ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 
                      isAnalyzing ? 'bg-indigo-100 text-indigo-600 cursor-wait' : 
                      'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow'}`}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      分析媒体...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      分析媒体
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      描述您的业务或活动
                    </label>
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="例如：美妆行业调研、网文用户调研、火锅口味调研"
                      className="w-full h-32 p-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                    />
                  </div>
                  
                  <button
                    onClick={analyzeText}
                    disabled={!textInput.trim() || isAnalyzing}
                    className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-sm
                      ${!textInput.trim() || isAnalyzing 
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow'}`}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        分析文本...
                      </>
                    ) : (
                      <>
                        <BrainCircuit className="w-5 h-5" />
                        生成关键词矩阵
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
            
            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-8 space-y-6">
          {!results && !textMatrix && !isAnalyzing && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Layers className="w-12 h-12 mb-4 text-slate-300" />
              <p className="text-lg font-medium text-slate-500">暂无分析结果</p>
              <p className="text-sm mt-1">
                {inputType === 'upload' ? '上传媒体并点击分析以查看结果' : '描述您的活动并点击生成以查看关键词矩阵'}
              </p>
            </div>
          )}

          {isAnalyzing && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-indigo-500 border-2 border-dashed border-indigo-100 rounded-2xl bg-indigo-50/30">
              <Loader2 className="w-10 h-10 mb-4 animate-spin" />
              <p className="text-lg font-medium">
                {inputType === 'upload' ? '正在分析 9 大维度...' : '正在生成关键词矩阵...'}
              </p>
              <p className="text-sm text-indigo-400 mt-1">这通常需要几秒钟</p>
            </div>
          )}

          {textMatrix && !isAnalyzing && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-semibold text-slate-800">关键词矩阵</h3>
                  </div>
                  <button
                    onClick={() => setIsEditingMatrix(!isEditingMatrix)}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    {isEditingMatrix ? '保存更改' : '编辑矩阵'}
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        主题词 (Theme Words)
                      </h4>
                      {isEditingMatrix ? (
                        <input
                          type="text"
                          value={(textMatrix.keywords?.theme || []).join(', ')}
                          onChange={(e) => setTextMatrix({ ...textMatrix, keywords: { ...textMatrix.keywords, theme: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                          className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="用逗号分隔的词..."
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {(textMatrix.keywords?.theme || []).map((word, i) => (
                            <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-md border border-blue-100">{word}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                        受众词 (Audience Words)
                      </h4>
                      {isEditingMatrix ? (
                        <input
                          type="text"
                          value={(textMatrix.keywords?.audience || []).join(', ')}
                          onChange={(e) => setTextMatrix({ ...textMatrix, keywords: { ...textMatrix.keywords, audience: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                          className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="用逗号分隔的词..."
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {(textMatrix.keywords?.audience || []).map((word, i) => (
                            <span key={i} className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs rounded-md border border-purple-100">{word}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        场景词 (Scene Words)
                      </h4>
                      {isEditingMatrix ? (
                        <input
                          type="text"
                          value={(textMatrix.keywords?.scene || []).join(', ')}
                          onChange={(e) => setTextMatrix({ ...textMatrix, keywords: { ...textMatrix.keywords, scene: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                          className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="用逗号分隔的词..."
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {(textMatrix.keywords?.scene || []).map((word, i) => (
                            <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-md border border-emerald-100">{word}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        调性词 (Tone Words)
                      </h4>
                      {isEditingMatrix ? (
                        <input
                          type="text"
                          value={(textMatrix.keywords?.tone || []).join(', ')}
                          onChange={(e) => setTextMatrix({ ...textMatrix, keywords: { ...textMatrix.keywords, tone: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                          className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="用逗号分隔的词..."
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {(textMatrix.keywords?.tone || []).map((word, i) => (
                            <span key={i} className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs rounded-md border border-amber-100">{word}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        视觉元素 (Visual Elements)
                      </h4>
                      {isEditingMatrix ? (
                        <input
                          type="text"
                          value={(textMatrix.keywords?.visualElements || []).join(', ')}
                          onChange={(e) => setTextMatrix({ ...textMatrix, keywords: { ...textMatrix.keywords, visualElements: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                          className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="用逗号分隔的词..."
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {(textMatrix.keywords?.visualElements || []).map((word, i) => (
                            <span key={i} className="px-2.5 py-1 bg-rose-50 text-rose-700 text-xs rounded-md border border-rose-100">{word}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        行动钩子 (Action Hooks)
                      </h4>
                      {isEditingMatrix ? (
                        <input
                          type="text"
                          value={(textMatrix.keywords?.actionHooks || []).join(', ')}
                          onChange={(e) => setTextMatrix({ ...textMatrix, keywords: { ...textMatrix.keywords, actionHooks: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                          className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="用逗号分隔的词..."
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {(textMatrix.keywords?.actionHooks || []).map((word, i) => (
                            <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-md border border-indigo-100">{word}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100">
                    <button
                      onClick={generatePromptsFromMatrix}
                      disabled={isGeneratingPrompts}
                      className={`w-full py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all
                        ${isGeneratingPrompts 
                          ? 'bg-indigo-100 text-indigo-600 cursor-wait' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow'}`}
                    >
                      {isGeneratingPrompts ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          正在生成提示词...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          为各平台生成提示词
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {results && !isAnalyzing && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* AI Prompt Card (Hero) */}
              <div className="bg-slate-900 rounded-2xl shadow-lg overflow-hidden text-white border border-slate-800">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-semibold text-lg">AI 生成提示词</h3>
                  </div>
                  <div className="flex items-center gap-4">
                    {inputType === 'text' && textPrompts && (
                      <div className="flex bg-slate-800 rounded-lg p-1">
                        <button
                          onClick={() => {
                            setSelectedPlatform('douyin');
                            let p = textPrompts.douyin[generationMode];
                            if (p && typeof p === 'object' && !Array.isArray(p)) p = JSON.stringify(p, null, 2);
                            setResults({ ...results, aiPrompt: p || "未生成提示词" } as any);
                          }}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${selectedPlatform === 'douyin' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                          抖音
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPlatform('xiaohongshu');
                            let p = textPrompts.xiaohongshu[generationMode];
                            if (p && typeof p === 'object' && !Array.isArray(p)) p = JSON.stringify(p, null, 2);
                            setResults({ ...results, aiPrompt: p || "未生成提示词" } as any);
                          }}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${selectedPlatform === 'xiaohongshu' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                          小红书
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPlatform('moments');
                            let p = textPrompts.moments[generationMode];
                            if (p && typeof p === 'object' && !Array.isArray(p)) p = JSON.stringify(p, null, 2);
                            setResults({ ...results, aiPrompt: p || "未生成提示词" } as any);
                          }}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${selectedPlatform === 'moments' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                          朋友圈
                        </button>
                      </div>
                    )}
                    <button 
                      onClick={copyPrompt}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-sm font-medium text-slate-300 hover:text-white border border-slate-700"
                    >
                      {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? '已复制' : '复制提示词'}
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  {Array.isArray(results.aiPrompt) ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {results.aiPrompt.map((variation, idx) => (
                        <div key={idx} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden flex flex-col">
                          <div className="bg-slate-800 px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {variation.narrativeAngle && (
                                <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-xs font-medium rounded-md border border-indigo-500/30">
                                  {variation.narrativeAngle}
                                </span>
                              )}
                              {variation.hookType && (
                                <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-medium rounded-md border border-emerald-500/30">
                                  {variation.hookType}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {results.mode === 'image' && (
                                <button
                                  onClick={() => generateSingleImageFromPrompt(idx)}
                                  disabled={isGeneratingMedia}
                                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                    isGeneratingMedia
                                      ? 'bg-slate-700 text-slate-400 cursor-wait'
                                      : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                  }`}
                                >
                                  生成此图片
                                </button>
                              )}
                              <span className="text-xs font-medium text-slate-500">变体 {idx + 1}</span>
                            </div>
                          </div>
                          <div className="p-4 flex-1 flex flex-col gap-2">
                            <label className="text-xs font-semibold text-slate-400">AI 提示词（可编辑）:</label>
                            <textarea
                              value={variation.aiPrompt}
                              onChange={(e) => {
                                const newPrompt = [...(results.aiPrompt as PromptVariation[])];
                                newPrompt[idx] = { ...newPrompt[idx], aiPrompt: e.target.value };
                                setResults({ ...results, aiPrompt: newPrompt });
                              }}
                              className="w-full flex-1 min-h-[100px] bg-slate-900/50 border border-slate-700/50 rounded-md px-3 py-2 font-mono text-xs text-slate-300 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-y"
                            />
                          </div>
                          {variation.ctaCopy !== undefined && (
                            <div className="px-4 py-3 bg-slate-800/30 border-t border-slate-700/50 flex flex-col gap-2">
                              <label className="text-xs font-semibold text-slate-400">转化文案 (CTA)（可编辑）:</label>
                              <textarea
                                value={variation.ctaCopy}
                                onChange={(e) => {
                                  const newPrompt = [...(results.aiPrompt as PromptVariation[])];
                                  newPrompt[idx] = { ...newPrompt[idx], ctaCopy: e.target.value };
                                  setResults({ ...results, aiPrompt: newPrompt });
                                }}
                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-md px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-y"
                                rows={2}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-slate-400">AI 提示词（可编辑）:</label>
                      <textarea
                        value={results.aiPrompt}
                        onChange={(e) => setResults({ ...results, aiPrompt: e.target.value })}
                        className="w-full min-h-[150px] bg-slate-900 border border-slate-700 rounded-md px-4 py-3 font-mono text-sm text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Media Generation Section */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    {results.mode === 'video' ? <Film className="w-5 h-5 text-indigo-500" /> : <ImageIcon className="w-5 h-5 text-indigo-500" />}
                    <h3 className="font-semibold text-slate-800">从提示词生成{results.mode === 'video' ? '视频' : '图片'}</h3>
                  </div>
                  <button
                    onClick={generateMedia}
                    disabled={isGeneratingMedia}
                    className={`px-4 py-2 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-sm
                      ${isGeneratingMedia 
                        ? 'bg-indigo-50 text-indigo-400 cursor-wait' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow'}`}
                  >
                    {isGeneratingMedia ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        正在生成{results.mode === 'video' ? '视频' : '图片'}...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        一键生成 4 个{results.mode === 'video' ? '视频' : '图片'}
                      </>
                    )}
                  </button>
                </div>

                {/* Media Settings */}
                <div className="space-y-4 mb-6 bg-slate-50 p-5 rounded-xl border border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-700">生成设置</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {results.mode === 'image' ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">图片规格</label>
                        <select
                          value={selectedImageSpec}
                          onChange={(e) => setSelectedImageSpec(e.target.value as QumengImageSpecKey)}
                          className="w-full text-sm rounded-lg border border-slate-200 p-2.5 outline-none focus:border-indigo-500 bg-white"
                          disabled={isGeneratingMedia}
                        >
                          <option value="BIG_IMAGE">大图 690×360（BIG_IMAGE）</option>
                          <option value="IMAGE">小图 225×150（IMAGE）</option>
                        </select>
                        <p className="text-[10px] text-slate-500 mt-1">
                          生成结果会按所选规格在同步到趣盟时自动裁切压缩。
                        </p>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">画面比例</label>
                        <select 
                          value={selectedAspectRatio}
                          onChange={(e) => setSelectedAspectRatio(e.target.value as '16:9' | '9:16')}
                          className="w-full text-sm rounded-lg border border-slate-200 p-2.5 outline-none focus:border-indigo-500 bg-white"
                          disabled={isGeneratingMedia}
                        >
                          <option value="16:9">横屏 (16:9)</option>
                          <option value="9:16">竖屏 (9:16)</option>
                        </select>
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">生成方式</label>
                      <select 
                        value={generationMethod}
                        onChange={(e) => setGenerationMethod(e.target.value as 'reference' | 'prompt')}
                        className="w-full text-sm rounded-lg border border-slate-200 p-2.5 outline-none focus:border-indigo-500 bg-white"
                        disabled={isGeneratingMedia || !mediaBase64}
                      >
                        <option value="reference">使用参考图</option>
                        <option value="prompt">仅使用提示词</option>
                      </select>
                      {!mediaBase64 && (
                        <p className="text-[10px] text-slate-500 mt-1">上传图片以使用参考图模式。</p>
                      )}
                    </div>

                    {generationMethod === 'reference' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">
                          参考相似度 ({referenceSimilarity}%)
                        </label>
                        <div className="flex items-center h-[42px] px-2 bg-white border border-slate-200 rounded-lg">
                          <input 
                            type="range" 
                            min="0" max="100" step="1"
                            value={referenceSimilarity}
                            onChange={(e) => setReferenceSimilarity(parseInt(e.target.value))}
                            className="w-full accent-indigo-600"
                            disabled={isGeneratingMedia}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {isGeneratingMedia && (
                  <div className="py-10 flex flex-col items-center justify-center text-center bg-slate-50 rounded-xl border border-slate-100">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                    <p className="text-sm font-medium text-slate-700">{mediaGenerationProgress}</p>
                    <p className="text-xs text-slate-500 mt-2 max-w-sm">
                      正在并行生成 4 个{results.mode === 'video' ? '视频' : '图片'}。这可能需要 1-3 分钟。
                    </p>
                  </div>
                )}

                {mediaGenerationError && (
                  <div className="mt-4 p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
                    {mediaGenerationError}
                  </div>
                )}

                {generatedMedia.length > 0 && !isGeneratingMedia && (
                  <div className="mt-6">
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mb-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Layers className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-semibold text-slate-800">叠加文本 (批量编辑)</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="lg:col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">文本内容</label>
                          <input 
                            type="text" 
                            value={overlayText}
                            onChange={(e) => setOverlayText(e.target.value)}
                            placeholder="输入要应用到所有媒体的文本..."
                            className="w-full text-sm rounded-lg border border-slate-200 p-2.5 outline-none focus:border-indigo-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">默认位置</label>
                          <select 
                            value={overlayPosition}
                            onChange={(e) => setOverlayPosition(e.target.value as 'top' | 'middle')}
                            className="w-full text-sm rounded-lg border border-slate-200 p-2.5 outline-none focus:border-indigo-500 bg-white"
                          >
                            <option value="top">顶部</option>
                            <option value="middle">居中</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">文本颜色</label>
                          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-1.5">
                            <input 
                              type="color" 
                              value={overlayColor}
                              onChange={(e) => setOverlayColor(e.target.value)}
                              className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                            />
                            <span className="text-xs text-slate-600 font-mono uppercase">{overlayColor}</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">描边颜色</label>
                          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-1.5">
                            <input 
                              type="color" 
                              value={overlayStroke}
                              onChange={(e) => setOverlayStroke(e.target.value)}
                              className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                            />
                            <span className="text-xs text-slate-600 font-mono uppercase">{overlayStroke}</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">描边宽度 ({overlayStrokeWidth}px)</label>
                          <div className="flex items-center h-[42px] px-2">
                            <input 
                              type="range" 
                              min="0" max="5" step="0.5"
                              value={overlayStrokeWidth}
                              onChange={(e) => setOverlayStrokeWidth(parseFloat(e.target.value))}
                              className="w-full accent-indigo-600"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">字体粗细 ({overlayFontWeight})</label>
                          <div className="flex items-center h-[42px] px-2">
                            <input 
                              type="range" 
                              min="100" max="900" step="100"
                              value={overlayFontWeight}
                              onChange={(e) => setOverlayFontWeight(parseInt(e.target.value))}
                              className="w-full accent-indigo-600"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">字体大小 ({overlayFontSize}px)</label>
                          <div className="flex items-center h-[42px] px-2">
                            <input 
                              type="range" 
                              min="12" max="120" step="2"
                              value={overlayFontSize}
                              onChange={(e) => setOverlayFontSize(parseInt(e.target.value))}
                              className="w-full accent-indigo-600"
                            />
                          </div>
                        </div>
                      </div>
                      {overlayText && (
                        <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
                          <MousePointerClick className="w-3.5 h-3.5" />
                          提示：您可以拖动每个生成媒体上的文本，以单独调整它的位置。
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-800">生成的{results.mode === 'video' ? '视频' : '图片'}</h3>
                      <div className="flex items-center gap-2">
                        {results.mode === 'image' && (
                          <>
                            <button
                              onClick={syncAllImagesToQumeng}
                              disabled={isBulkSyncingToQumeng}
                              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-sm ${
                                isBulkSyncingToQumeng
                                  ? 'bg-amber-50 text-amber-500 cursor-wait'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                            >
                              {isBulkSyncingToQumeng ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                              一键同步 4 张
                            </button>
                            <button
                              onClick={handleSaveAllImages}
                              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                            >
                              <Download className="w-4 h-4" />
                              一键保存图片
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {results.mode === 'image' && (
                      <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-full bg-white text-emerald-700 text-xs font-semibold border border-emerald-200">
                            趣盟同步规格
                          </span>
                          <span className="px-2.5 py-1 rounded-full bg-white text-slate-700 text-xs font-medium border border-slate-200">
                            {currentQumengImageSpec.label} {currentQumengImageSpec.sizeLabel}
                          </span>
                          <span className="px-2.5 py-1 rounded-full bg-white text-slate-700 text-xs font-medium border border-slate-200">
                            {currentQumengImageSpec.materialType}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">
                          当前按所选趣盟规格生成并同步：{currentQumengImageSpec.label} {currentQumengImageSpec.sizeLabel} / {currentQumengImageSpec.materialType}。
                        </p>
                        {qumengSyncSummary && (
                          <p className="mt-2 text-xs text-amber-700">{qumengSyncSummary}</p>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {generatedMedia.map((url, idx) => (
                        <div key={idx} className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                          {results.mode === 'image' && (
                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2 py-1 rounded-full bg-white text-slate-700 text-xs font-semibold border border-slate-200">
                                  {currentQumengImageSpec.label} {currentQumengImageSpec.sizeLabel}
                                </span>
                                <span className="px-2 py-1 rounded-full bg-white text-slate-700 text-xs font-medium border border-slate-200">
                                  {currentQumengImageSpec.materialType}
                                </span>
                                {generatedMediaPromptIndices[idx] !== undefined && (
                                  <span className="px-2 py-1 rounded-full bg-white text-indigo-700 text-xs font-medium border border-indigo-200">
                                    来源提示词 {generatedMediaPromptIndices[idx] + 1}
                                  </span>
                                )}
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium border ${
                                    qumengSyncStates[idx]?.status === 'synced'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : qumengSyncStates[idx]?.status === 'syncing'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : qumengSyncStates[idx]?.status === 'failed'
                                          ? 'bg-red-50 text-red-700 border-red-200'
                                          : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {qumengSyncStates[idx]?.status === 'synced'
                                    ? '已同步'
                                    : qumengSyncStates[idx]?.status === 'syncing'
                                      ? '同步中'
                                      : qumengSyncStates[idx]?.status === 'failed'
                                        ? '同步失败'
                                        : '未同步'}
                                </span>
                              </div>
                              <button
                                onClick={() => syncSingleImageToQumeng(idx)}
                                disabled={qumengSyncStates[idx]?.status === 'syncing' || isBulkSyncingToQumeng}
                                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                                  qumengSyncStates[idx]?.status === 'syncing' || isBulkSyncingToQumeng
                                    ? 'bg-emerald-50 text-emerald-400 cursor-wait'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                              >
                                {qumengSyncStates[idx]?.status === 'syncing' ? '同步中...' : '同步到趣盟'}
                              </button>
                            </div>
                          )}
                          <div
                            id={`media-container-${idx}`}
                            className={`bg-black relative flex items-center justify-center group ${
                              selectedAspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'
                            }`}
                          >
                            {results.mode === 'video' ? (
                              <video
                                src={url}
                                controls
                                autoPlay
                                loop
                                muted
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <img
                                src={url}
                                alt={`Generated ${idx + 1}`}
                                className="w-full h-full object-contain"
                              />
                            )}
                            <DraggableOverlay
                              text={overlayText}
                              color={overlayColor}
                              stroke={overlayStroke}
                              strokeWidth={overlayStrokeWidth}
                              fontWeight={overlayFontWeight}
                              fontSize={overlayFontSize}
                              defaultPos={overlayPosition}
                              position={textPositions[idx]}
                              onPositionChange={(pos) => setTextPositions(prev => ({ ...prev, [idx]: pos }))}
                              containerId={`media-container-${idx}`}
                            />
                          </div>
                          {results.mode === 'image' && (
                            <div className="border-t border-slate-100 px-4 py-3 bg-white">
                              {qumengSyncStates[idx]?.materialId ? (
                                <p className="text-xs text-emerald-700">素材ID：{qumengSyncStates[idx]?.materialId}</p>
                              ) : qumengSyncStates[idx]?.error ? (
                                <p className="text-xs text-red-600">{qumengSyncStates[idx]?.error}</p>
                              ) : (
                                <p className="text-xs text-slate-500">同步成功后会在这里显示趣盟素材ID。</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Analysis Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {results.mode === 'video' && results.videoAnalysis && (
                  <>
                    {/* Visual Dynamics */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden md:col-span-2">
                      <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                        <Eye className="w-5 h-5 text-blue-500" />
                        <h3 className="font-semibold text-slate-800">一、视觉表现层 (Visual Dynamics)</h3>
                      </div>
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ResultItem label="1. 镜头景别与构图 (Framing & Composition)" value={results.videoAnalysis.visualDynamics?.framing} />
                        <ResultItem label="2. 机位与运镜 (Camera Movement)" value={results.videoAnalysis.visualDynamics?.camera} />
                        <ResultItem label="3. 光影与色彩 (Lighting & Color)" value={results.videoAnalysis.visualDynamics?.lighting} />
                        <ResultItem label="4. 画面质感 (Texture & Quality)" value={results.videoAnalysis.visualDynamics?.texture} />
                      </div>
                    </div>

                    {/* Hook & Narrative */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                        <PlayCircle className="w-5 h-5 text-emerald-500" />
                        <h3 className="font-semibold text-slate-800">二、内容钩子层 (Hook & Narrative)</h3>
                      </div>
                      <div className="p-5 space-y-5">
                        <ResultItem label="5. 黄金 3 秒钩子 (The Hook)" value={results.videoAnalysis.hookNarrative?.hook} />
                        <ResultItem label="6. 人物形象与表现力 (Character & Performance)" value={results.videoAnalysis.hookNarrative?.character} />
                        <ResultItem label="7. 叙事节奏 (Pacing & Rhythm)" value={results.videoAnalysis.hookNarrative?.pacing} />
                      </div>
                    </div>

                    {/* Interaction & CTA */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                        <MousePointerClick className="w-5 h-5 text-orange-500" />
                        <h3 className="font-semibold text-slate-800">三、交互与转化层 (Interaction & CTA)</h3>
                      </div>
                      <div className="p-5 space-y-5">
                        <ResultItem label="8. UI 配合与指引 (On-screen Elements)" value={results.videoAnalysis.interactionCTA?.ui} />
                        <ResultItem label="9. 音频能量 (Audio Strategy)" value={results.videoAnalysis.interactionCTA?.audio} />
                      </div>
                    </div>
                  </>
                )}

                {results.mode === 'image' && results.imageAnalysis && (
                  <>
                    {/* Conversion & Attraction */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden md:col-span-2">
                      <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-blue-500" />
                        <h3 className="font-semibold text-slate-800">第一部分：投流核心维度 (Conversion & Attraction)</h3>
                      </div>
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ResultItem label="1. 视觉阻断力 (Pattern Interrupt)" value={results.imageAnalysis.conversionAttraction?.patternInterrupt} />
                        <ResultItem label="2. 原生感评分 (Native Aesthetic)" value={results.imageAnalysis.conversionAttraction?.nativeAesthetic} />
                        <ResultItem label="3. 视觉诱导路径 (Eye-tracking Logic)" value={results.imageAnalysis.conversionAttraction?.eyeTrackingLogic} />
                        <ResultItem label="4. 人群代入感 (Audience Fit)" value={results.imageAnalysis.conversionAttraction?.audienceFit} />
                      </div>
                    </div>

                    {/* Visual Parameters */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                        <Sliders className="w-5 h-5 text-emerald-500" />
                        <h3 className="font-semibold text-slate-800">第二部分：视觉参数维度 (Visual Parameters)</h3>
                      </div>
                      <div className="p-5 space-y-5">
                        <ResultItem label="5. 构图与视角 (Framing)" value={results.imageAnalysis.visualParameters?.framing} />
                        <ResultItem label="6. 光影质感 (Lighting & Texture)" value={results.imageAnalysis.visualParameters?.lightingTexture} />
                        <ResultItem label="7. 色彩心理 (Color Palette)" value={results.imageAnalysis.visualParameters?.colorPalette} />
                        <ResultItem label="8. UI 兼容性 (Safe Zone Check)" value={results.imageAnalysis.visualParameters?.safeZoneCheck} />
                      </div>
                    </div>

                    {/* Psychological Hooks */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-4 flex items-center gap-2">
                        <BrainCircuit className="w-5 h-5 text-orange-500" />
                        <h3 className="font-semibold text-slate-800">第三部分：心理钩子维度 (Psychological Hooks)</h3>
                      </div>
                      <div className="p-5 space-y-5">
                        <ResultItem label="9. 情绪指标 (Emotional Index)" value={results.imageAnalysis.psychologicalHooks?.emotionalIndex} />
                        <ResultItem label="10. 社交距离 (Social Distance)" value={results.imageAnalysis.psychologicalHooks?.socialDistance} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}

const ResultItem = ({ label, value }: { label: string, value: string }) => (
  <div>
    <h4 className="text-sm font-medium text-slate-500 mb-1.5">{label}</h4>
    <p className="text-slate-800 text-sm leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">{value}</p>
  </div>
);


