// SDK imports removed to prevent client-side key exposure
import { ModelProvider } from '@/types/data';

export interface AIRequestOptions {
  temperature?: number;
  maxTokens?: number;
}

export type AIInputType = 'text' | 'image' | 'audio';

export interface AIProvider {
  id: string;
  name: string;
  processText: (text: string, prompt?: string, apiKey?: string, modelId?: string, baseUrl?: string, type?: AIInputType, options?: AIRequestOptions) => Promise<string>;
  processBatch?: (texts: string[], prompt?: string, apiKey?: string, modelId?: string, baseUrl?: string, type?: AIInputType, options?: AIRequestOptions) => Promise<string[]>;
}

export const AVAILABLE_PROVIDERS: ModelProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o and other OpenAI models',
    requiresApiKey: true,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Flagship model' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and cost-effective' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Legacy fast model' }
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3.5 Sonnet and Opus',
    requiresApiKey: true,
    models: [
      { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', description: 'High intelligence' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most powerful' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fastest' }
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified access to many frontier and open models',
    requiresApiKey: true,
    models: []
  },
  {
    id: 'sambanova',
    name: 'SambaNova',
    description: 'High-speed inference for open models',
    requiresApiKey: true,
    models: [
      { id: 'Meta-Llama-3.1-405B-Instruct', name: 'Llama 3.1 405B', description: 'Largest open model' },
      { id: 'Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', description: 'Balanced performance' },
      { id: 'Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', description: 'Fast and lightweight' },
      { id: 'Llama-3.3-Swallow-70B-Instruct-v0.4', name: 'Llama 3.3 Swallow 70B', description: 'Latest Llama 3.3 variant' },
      { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', description: 'Official Meta Llama 3.3' },
      { id: 'DeepSeek-R1-Distill-Llama-70B', name: 'DeepSeek R1 Distill 70B', description: 'Reasoning model' },
      { id: 'DeepSeek-R1-0528', name: 'DeepSeek R1 (0528)', description: 'Reasoning model' },
      { id: 'DeepSeek-V3-0324', name: 'DeepSeek V3 (0324)', description: 'Latest DeepSeek model' },
      { id: 'DeepSeek-V3.1', name: 'DeepSeek V3.1', description: 'Advanced reasoning' },
      { id: 'ALLaM-7B-Instruct-preview', name: 'ALLaM 7B', description: 'Arabic/English model' },
      { id: 'Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', description: 'Strong reasoning' },
      { id: 'Qwen2.5-Coder-32B-Instruct', name: 'Qwen 2.5 Coder 32B', description: 'Code specialization' },
      { id: 'Qwen3-32B', name: 'Qwen 3 32B', description: 'Next-gen Qwen reasoning' },
      { id: 'Qwen3-235B', name: 'Qwen 3 235B', description: 'Large scale Qwen model' }
    ]
  },
  {
    id: 'local',
    name: 'Local (Ollama)',
    description: 'Run models locally via Ollama',
    requiresApiKey: false,
    models: [
      { id: 'llama3', name: 'Llama 3', description: 'Standard Llama 3' },
      { id: 'mistral', name: 'Mistral', description: 'Mistral 7B' },
      { id: 'gemma', name: 'Gemma', description: 'Google Gemma' }
    ]
  }
];

// Helper to resolve image content (URL or Base64)
const resolveImageContent = async (text: string): Promise<string> => {
  // If it's a data URL, return as is
  if (text.startsWith('data:')) return text;

  // For OpenAI/Anthropic/OpenRouter, localhost URLs won't work if they are calling from their servers.
  // We MUST convert to base64 if it's local or if we want to ensure the provider gets the data directly.
  const isLocal = text.startsWith('/') || text.includes('localhost') || text.includes('127.0.0.1');

  if (isLocal || text.startsWith('http')) {
    try {
      const response = await fetch(text);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Failed to resolve image content:", e);
      if (text.startsWith('http')) return text; // Fallback to URL if fetch fails but it looks like a URL
      throw new Error(`Failed to load image: ${text}`);
    }
  }

  return text;
};

class OpenAIProvider implements AIProvider {
  id = 'openai';
  name = 'OpenAI GPT';

  async processText(text: string, prompt?: string, apiKey?: string, modelId: string = 'gpt-4o-mini', baseUrl?: string, type: AIInputType = 'text', options?: AIRequestOptions): Promise<string> {
    if (!apiKey) throw new Error('OpenAI API key is required');

    const messages: any[] = [
      { role: "system", content: prompt || "You are a helpful data labeling assistant." }
    ];

    if (type === 'image') {
      const imageUrl = await resolveImageContent(text);
      messages.push({
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: "Please analyze the image provided according to the system instructions." }
        ]
      });
    } else {
      messages.push({ role: "user", content: text });
    }

    const response = await fetch('/api/openai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'OpenAI API Error');
    }

    const data = await response.json();
    return data.choices[0].message.content || '';
  }

  async processBatch(texts: string[], prompt?: string, apiKey?: string, modelId: string = 'gpt-4o-mini', baseUrl?: string, type: AIInputType = 'text', options?: AIRequestOptions): Promise<string[]> {
    const promises = texts.map(text => this.processText(text, prompt, apiKey, modelId, baseUrl, type, options));
    return Promise.all(promises);
  }
}

class AnthropicProvider implements AIProvider {
  id = 'anthropic';
  name = 'Anthropic Claude';

  async processText(text: string, prompt?: string, apiKey?: string, modelId: string = 'claude-3-5-sonnet-20240620', baseUrl?: string, type: AIInputType = 'text', options?: AIRequestOptions): Promise<string> {
    if (!apiKey) throw new Error('Anthropic API key is required');

    const messages: any[] = [];

    if (type === 'image') {
      const imageUrl = await resolveImageContent(text);
      // Extract base64 data and media type if it's a data URL
      if (imageUrl.startsWith('data:')) {
        const matches = imageUrl.match(/^data:(.+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mediaType = matches[1];
          const data = matches[2];
          messages.push({
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: data } },
              { type: "text", text: "Please analyze the image provided." }
            ]
          });
        } else {
          throw new Error("Invalid image data URL");
        }
      } else {
        // If it's still a URL (public), Anthropic API might not support it directly via proxy depending on implementation,
        // but usually they require base64. Let's assume we must convert everything to base64 for Anthropic.
        // If resolveImageContent returned a URL, it means it wasn't local.
        // We should probably fetch it anyway to convert to base64 for Anthropic.
        // For now, let's try to fetch it.
        try {
          const response = await fetch(text);
          const blob = await response.blob();
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          const matches = base64.match(/^data:(.+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            messages.push({
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: matches[1], data: matches[2] } },
                { type: "text", text: "Please analyze the image provided." }
              ]
            });
          }
        } catch (e) {
          throw new Error("Failed to load remote image for Anthropic. Please ensure CORS is allowed or use local images.");
        }
      }
    } else {
      messages.push({ role: "user", content: text });
    }

    const response = await fetch('/api/anthropic/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature,
        system: prompt || "You are a helpful data labeling assistant.",
        messages
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Anthropic API Error');
    }

    const data = await response.json();
    return data.content[0].text || '';
  }
}

class SambaNovaProvider implements AIProvider {
  id = 'sambanova';
  name = 'SambaNova Cloud';

  async processText(text: string, prompt?: string, apiKey?: string, modelId: string = 'Meta-Llama-3.1-70B-Instruct', baseUrl?: string, type: AIInputType = 'text', options?: AIRequestOptions): Promise<string> {
    if (!apiKey) throw new Error('SambaNova API key is required');

    if (type === 'image') {
      const imageUrl = await resolveImageContent(text);
      const messages: any[] = [
        { role: "system", content: prompt || "You are a helpful data labeling assistant." }
      ];

      // Assuming SambaNova follows OpenAI format for vision if supported
      messages.push({
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: "Please analyze the image provided." }
        ]
      });

      const response = await fetch('/api/sambanova/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          temperature: options?.temperature ?? 0.1,
          top_p: 0.1,
          max_tokens: options?.maxTokens
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'SambaNova Vision API Error');
      }

      const data = await response.json();
      return data.choices[0].message.content || '';
    }

    const response = await fetch('/api/sambanova/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: prompt || "You are a helpful data labeling assistant." },
          { role: "user", content: text }
        ],
        temperature: options?.temperature ?? 0.1,
        top_p: 0.1,
        max_tokens: options?.maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'SambaNova API Error');
    }

    const data = await response.json();
    return data.choices[0].message.content || '';
  }
}

class OpenRouterProvider implements AIProvider {
  id = 'openrouter';
  name = 'OpenRouter';

  async processText(text: string, prompt?: string, apiKey?: string, modelId: string = 'openai/gpt-4o-mini', baseUrl?: string, type: AIInputType = 'text', options?: AIRequestOptions): Promise<string> {
    if (!apiKey) throw new Error('OpenRouter API key is required');

    const messages: any[] = [
      { role: "system", content: prompt || "You are a helpful data labeling assistant." }
    ];

    if (type === 'image') {
      const imageUrl = await resolveImageContent(text);
      messages.push({
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: "Please analyze the image provided above." }
        ]
      });
    } else {
      messages.push({ role: "user", content: text });
    }

    const response = await fetch('/api/openrouter/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || errorData.error || 'OpenRouter API Error');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

class LocalProvider implements AIProvider {
  id = 'local';
  name = 'Local Model (Ollama)';

  async processText(text: string, prompt?: string, apiKey?: string, modelId: string = 'llama3', baseUrl: string = 'http://localhost:11434', type: AIInputType = 'text', options?: AIRequestOptions): Promise<string> {
    const systemPrompt = prompt || "You are a helpful data labeling assistant.";

    // Ensure baseUrl doesn't end with slash
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const url = `${cleanBaseUrl}/api/generate`;

    const body: any = {
      model: modelId,
      stream: false,
      options: {}
    };

    if (type === 'image') {
      try {
        // Reuse the helper!
        const imageUrl = await resolveImageContent(text);
        // Extract just the base64 part for Ollama
        const base64 = imageUrl.split(',')[1];

        body.prompt = prompt || "Describe this image";
        body.images = [base64];
      } catch (e) {
        console.error("Failed to load image for Ollama:", e);
        throw new Error("Failed to load image for analysis");
      }
    } else {
      body.prompt = `${systemPrompt}\n\nText to analyze:\n${text}`;
    }
    if (options?.temperature !== undefined) {
      body.options.temperature = options.temperature;
    }
    if (options?.maxTokens !== undefined) {
      body.options.num_predict = options.maxTokens;
    }
    if (Object.keys(body.options).length === 0) {
      delete body.options;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Failed to connect to Ollama at ${url}. Make sure it is running.`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error('Ollama error:', error);
      throw error;
    }
  }
}

const providers: Record<string, AIProvider> = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  openrouter: new OpenRouterProvider(),
  sambanova: new SambaNovaProvider(),
  local: new LocalProvider()
};

export const getAIProvider = (id: string): AIProvider => {
  const provider = providers[id];
  if (!provider) throw new Error(`Provider ${id} not found`);
  return provider;
};
