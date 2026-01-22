import axios from 'axios';

const API_KEY = process.env.VIZARDAI_API_KEY;
const BASE_URL = 'https://elb-api.vizard.ai/hvizard-server-front/open-api/v1';

export interface VizardVideoClip {
  videoId: number;
  videoUrl: string;
  videoMsDuration: number;
  title: string;
  viralScore: string;
  viralReason: string;
  transcript: string;
  relatedTopic: string;
  clipEditorUrl: string;
}

export interface VizardApiResponse<T = any> {
  code: number;
  projectId?: string;
  videos?: VizardVideoClip[];
  errMsg?: string;
}

export class VizardClient {
  private headers: Record<string, string>;

  constructor() {
    if (!API_KEY) {
      throw new Error('VIZARDAI_API_KEY is not defined');
    }
    this.headers = {
      'Content-Type': 'application/json',
      'VIZARDAI_API_KEY': API_KEY
    };
  }

  async createProject(videoUrl: string, lang: string = 'auto'): Promise<string> {
    const payload = {
      lang,
      preferLength: [0], // auto
      videoUrl,
      videoType: 2 // YouTube
    };

    const response = await axios.post<VizardApiResponse>(`${BASE_URL}/project/create`, payload, {
      headers: this.headers
    });

    if (response.data.code === 2000 && response.data.projectId) {
      return response.data.projectId;
    }

    throw new Error(response.data.errMsg || `Vizard API error: ${response.data.code}`);
  }

  async queryProject(projectId: string): Promise<{ status: 'processing' | 'completed' | 'failed'; videos?: VizardVideoClip[]; error?: string }> {
    const response = await axios.get<VizardApiResponse>(`${BASE_URL}/project/query/${projectId}`, {
      headers: this.headers
    });

    if (response.data.code === 2000) {
      return { status: 'completed', videos: response.data.videos };
    } else if (response.data.code === 1000) {
      return { status: 'processing' };
    }

    return { status: 'failed', error: response.data.errMsg || `Vizard API error: ${response.data.code}` };
  }
}
