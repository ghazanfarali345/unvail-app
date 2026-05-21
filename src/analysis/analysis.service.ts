import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
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
      throw new InternalServerErrorException('Gemini API key is not configured. Please set GEMINI_API_KEY environment variable.');
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
    } catch (error: any) {
      console.error('Gemini API analysis error:', error);
      
      if (error instanceof SyntaxError) {
        throw new InternalServerErrorException('Failed to parse Gemini API response. The response was not valid JSON.');
      }
      
      if (error.status === 429) {
        throw new InternalServerErrorException('Gemini API rate limit exceeded. Please try again later.');
      }
      
      if (error.status === 401 || error.status === 403) {
        throw new InternalServerErrorException('Gemini API authentication failed. Invalid or expired API key.');
      }
      
      if (error.status >= 500) {
        throw new InternalServerErrorException('Gemini API server error. Please try again later.');
      }
      
      throw new InternalServerErrorException(
        error.message || 'Failed to analyze chat with Gemini API. Please try again later.'
      );
    }
  }
}
