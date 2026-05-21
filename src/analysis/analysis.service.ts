import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyzeChatDto, AnalysisReport } from './dto/analyze-chat.dto';
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

  async analyzeChat(analyzeChatDto: AnalyzeChatDto, image?: any): Promise<AnalysisReport> {
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
You are an expert relationship communication analyzer. Your task is to analyze a conversation between two people and generate a comprehensive relationship health report.

The conversation is provided below, either as text or as a screenshot image. Extract and analyze the conversation content.

IMPORTANT: Return ONLY valid JSON - no additional text before or after.

CRITICAL: Extract the actual names of the two participants from the conversation. If names are mentioned, use them directly (e.g., "Muhammad Hamza", "Sarah"). If names are not identifiable, use only "Participant 1" and "Participant 2".

Analyze the conversation using EXACTLY these 6 sections:

1. Relationship Health Score (1-100) - Calculated from 4 components, each scored 0-25:
   - Positive Markers Score (0-25): Presence of respectful wording, support, care, apologies, calm explanations, willingness to understand, effort to solve
   - Negative Markers Score (0-25): REVERSE SCORED - subtract from 25 if present: blaming, insults, pressure, threats, dismissive replies, avoiding issues, disrespect
   - Conflict Insights Score (0-25): How well the conversation addresses core conflicts
   - Roles & Tendencies Score (0-25): Communication pattern consistency and effectiveness
   - TOTAL = Sum of all four (0-100)

2. Roles & Tendencies: Explain how each person communicates in this conversation (factual observations only, no diagnosis)

3. Positive Markers: List positive communication signs with evidence from the conversation

4. Negative Markers: List negative communication signs with evidence from the conversation

5. Conflict Insights: Explain what conflict or communication issue appears in the conversation

6. Improvement Tips: 3-5 simple suggestions to improve communication based on this conversation

JSON Schema (MUST return valid JSON only):
{
  "relationshipHealthScore": {
    "positiveMarkersScore": number,
    "negativeMarkersScore": number,
    "conflictInsightsScore": number,
    "rolesTendenciesScore": number,
    "totalScore": number
  },
  "rolesAndTendencies": [
    {
      "person": "string (actual name extracted from conversation, e.g. 'Muhammad Hamza' or 'Participant 1' if name not identifiable)",
      "role": "string",
      "communicationStyle": "string"
    }
  ],
  "positiveMarkers": [
    {
      "title": "string",
      "description": "string",
      "evidence": "string"
    }
  ],
  "negativeMarkers": [
    {
      "title": "string",
      "description": "string",
      "evidence": "string"
    }
  ],
  "conflictInsights": "string",
  "improvementTips": ["string", "string", "string"]
}

${text ? `Text conversation to analyze:\n"${text}"` : 'Conversation screenshot provided as image below. Please extract and analyze all visible conversation content.'}

Guidelines:
- Use ONLY information from the conversation (text or image)
- Do not diagnose personalities or conditions
- Do not guess beyond what is shown
- Be objective and factual
- Scoring must be between 0-100
- Extract all visible text from the image if analyzing a screenshot
- ALWAYS extract real names from the conversation if mentioned - do NOT use generic labels like "Person A", "Person B", "User 1", "User 2"
- Return valid JSON only
`;

      const parts: any[] = [{ text: prompt }];
      
      // Add image if provided
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
      const analysis = JSON.parse(responseText);
      
      // Validate the response structure
      if (!analysis.relationshipHealthScore || !analysis.rolesAndTendencies) {
        throw new InternalServerErrorException('Invalid analysis response structure from Gemini API.');
      }

      // Ensure totalScore is calculated correctly
      if (!analysis.relationshipHealthScore.totalScore) {
        analysis.relationshipHealthScore.totalScore = 
          (analysis.relationshipHealthScore.positiveMarkersScore || 0) +
          (analysis.relationshipHealthScore.negativeMarkersScore || 0) +
          (analysis.relationshipHealthScore.conflictInsightsScore || 0) +
          (analysis.relationshipHealthScore.rolesTendenciesScore || 0);
      }

      return analysis as AnalysisReport;
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
      
      throw new InternalServerErrorException('An error occurred during chat analysis. Please try again.');
    }
  }
}
