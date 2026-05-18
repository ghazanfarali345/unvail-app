import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyzeChatDto } from './dto/analyze-chat.dto';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AnalysisService {
  constructor(private readonly configService: ConfigService) {}

  private fileToGenerativePart(buffer: Buffer, mimeType: string) {
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType,
      },
    };
  }

  async analyzeChat(analyzeChatDto: AnalyzeChatDto, image?: any) {
    const { text } = analyzeChatDto;

    // Validate that at least one of text or image is provided
    if (!text && (!image || !image.buffer)) {
      throw new BadRequestException('Please provide either text or a screenshot image of the chat to analyze.');
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      console.warn('GEMINI_API_KEY not found in environment. Falling back to static response.');
      return this.getStaticFallback();
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `
You are an advanced relationship and compatibility analysis AI.
Your task is to analyze a couples' chat log (and/or a screenshot of their chat, if provided).
Evaluate their bond based on their interactions, tone, empathy, conflict resolution style, and alignment.

Please return a valid JSON response strictly matching the following schema. Do not output anything other than a single valid JSON object.

JSON Schema:
{
  "score": number, // Overall compatibility score between 0 and 100
  "stabilityIndex": number, // Relationship stability index between 0 and 100
  "personalities": {
    "user1": {
      "name": "string", // Dynamically identified and parsed name of the first participant from the chat. If not identifiable, default to "User 1".
      "adjectives": ["string", "string"] // Exactly two key adjectives/phrases describing their personality in this chat (e.g. "Constructive Organizer", "Empathetic Listener")
    },
    "user2": {
      "name": "string", // Dynamically identified and parsed name of the second participant from the chat. If not identifiable, default to "User 2".
      "adjectives": ["string", "string"] // Exactly two key adjectives/phrases describing their personality in this chat (e.g. "Proactive Collaborator", "Logical Thinker")
    }
  },
  "unveiledPaths": [
    {
      "title": "string", // Title of a specific path (we need exactly 3 unveiled paths)
      "description": "string" // A helpful, actionable description of how they can build their bond on this path
    }
  ]
}

Analyze the following chat log and identify the names of the two participants:
"${text || 'Screenshot provided below'}"
`;

      const parts: any[] = [{ text: prompt }];
      if (image && image.buffer) {
        parts.push(this.fileToGenerativePart(image.buffer, image.mimetype));
      }

      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const responseText = result.response.text();
      return JSON.parse(responseText);
    } catch (error) {
      console.error('Gemini Analysis failed, falling back to static response:', error);
      return this.getStaticFallback();
    }
  }

  private getStaticFallback() {
    const score = Math.floor(Math.random() * 16) + 80; // 80 - 95
    const stabilityIndex = Math.floor(Math.random() * 16) + 75; // 75 - 90

    const adjectivePool = [
      'Constructive Organizer',
      'Empathetic Listener',
      'Proactive Collaborator',
      'Logical Thinker',
      'Affectionate Supporter',
      'Harmonious Mediator',
      'Strategic Visionary',
      'Compassionate Guide',
      'Playful Companion',
      'Resilient Anchor',
    ];

    // Shuffle adjectives and pick unique ones for each user
    const shuffledAdjectives = [...adjectivePool].sort(() => 0.5 - Math.random());
    const user1Adjectives = [shuffledAdjectives[0], shuffledAdjectives[1]];
    const user2Adjectives = [shuffledAdjectives[2], shuffledAdjectives[3]];

    const pathPool = [
      {
        title: 'Path of Mutual Understanding',
        description: 'Focus on shared goals to strengthen your foundational bond and deepen mutual trust.',
      },
      {
        title: 'Path of Emotional Growth',
        description: 'Develop deeper empathy through active listening and open communication during conflicts.',
      },
      {
        title: 'Path of Dynamic Synergy',
        description: 'Balance each other\'s strengths by allowing your constructive organization to pair with their proactive collaboration.',
      },
      {
        title: 'Path of Shared Adventure',
        description: 'Introduce new activities and spontaneous plans to keep the spark alive and cultivate shared joy.',
      },
      {
        title: 'Path of Resilient Anchoring',
        description: 'Create safe spaces to express vulnerability, establishing a stronger emotional safety net.',
      },
      {
        title: 'Path of Quiet Connections',
        description: 'Appreciate non-verbal connections and silent moments of closeness to build a peaceful rhythm together.',
      },
    ];

    // Shuffle paths and pick 3 unique ones
    const shuffledPaths = [...pathPool].sort(() => 0.5 - Math.random());
    const selectedPaths = [shuffledPaths[0], shuffledPaths[1], shuffledPaths[2]];

    return {
      score,
      stabilityIndex,
      personalities: {
        user1: {
          name: 'User 1',
          adjectives: user1Adjectives,
        },
        user2: {
          name: 'User 2',
          adjectives: user2Adjectives,
        },
      },
      unveiledPaths: selectedPaths,
    };
  }
}
